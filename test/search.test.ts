import { describe, expect, it } from "vitest";
import { buildSearchUrl, buildStudyUrl } from "@/lib/ctgov/query";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import { searchInputSchema } from "@/lib/schemas";
import { haversineMiles, parseAgeToYears } from "@/lib/geo";
import { rawStudyFixture } from "./fixtures";

describe("search input validation", () => {
  it("requires a non-empty condition", () => {
    expect(searchInputSchema.safeParse({ condition: "" }).success).toBe(false);
    expect(searchInputSchema.safeParse({ condition: "asthma" }).success).toBe(true);
  });

  it("strips age and sex entirely — they are never sent to the server", () => {
    const parsed = searchInputSchema.parse({ condition: "x", age: 54, sex: "female" });
    expect(parsed).not.toHaveProperty("age");
    expect(parsed).not.toHaveProperty("sex");
  });

  it("rejects out-of-range and unknown values", () => {
    expect(searchInputSchema.safeParse({ condition: "x", travelDistanceMiles: 0 }).success).toBe(
      false,
    );
    expect(
      searchInputSchema.safeParse({ condition: "x", recruitmentStatuses: ["BOGUS"] }).success,
    ).toBe(false);
    expect(searchInputSchema.safeParse({ condition: "x", phases: ["PHASE9"] }).success).toBe(false);
  });
});

describe("buildSearchUrl", () => {
  const base = { condition: "melanoma" };

  it("targets the v2 studies endpoint with the condition query", () => {
    const url = new URL(buildSearchUrl({ input: searchInputSchema.parse(base) }));
    expect(url.origin + url.pathname).toBe("https://clinicaltrials.gov/api/v2/studies");
    expect(url.searchParams.get("query.cond")).toBe("melanoma");
    expect(url.searchParams.get("countTotal")).toBe("true");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("pipe-joins recruitment statuses", () => {
    const url = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({
          ...base,
          recruitmentStatuses: ["RECRUITING", "NOT_YET_RECRUITING"],
        }),
      }),
    );
    expect(url.searchParams.get("filter.overallStatus")).toBe("RECRUITING|NOT_YET_RECRUITING");
  });

  it("builds an Essie phase expression, parenthesised only when multiple", () => {
    const single = new URL(
      buildSearchUrl({ input: searchInputSchema.parse({ ...base, phases: ["PHASE2"] }) }),
    );
    expect(single.searchParams.get("filter.advanced")).toBe("AREA[Phase]PHASE2");

    const multi = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({ ...base, phases: ["PHASE2", "PHASE3"] }),
      }),
    );
    expect(multi.searchParams.get("filter.advanced")).toBe(
      "(AREA[Phase]PHASE2 OR AREA[Phase]PHASE3)",
    );
  });

  it("uses the geo distance filter when coordinates are known", () => {
    const url = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({ ...base, city: "Chicago", travelDistanceMiles: 50 }),
        origin: { lat: 41.8755616, lon: -87.6244212 },
      }),
    );
    expect(url.searchParams.get("filter.geo")).toBe("distance(41.87556,-87.62442,50mi)");
    expect(url.searchParams.has("query.locn")).toBe(false);
  });

  it("falls back to location text when geocoding failed", () => {
    const url = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({
          ...base,
          city: "Chicago",
          state: "Illinois",
          travelDistanceMiles: 50,
        }),
        origin: null,
      }),
    );
    expect(url.searchParams.has("filter.geo")).toBe(false);
    expect(url.searchParams.get("query.locn")).toContain("Chicago");
  });

  it("strips Essie metacharacters from free text so the query cannot be restructured", () => {
    const url = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({
          condition: 'lung") OR AREA[Phase]PHASE3 OR ("x',
        }),
      }),
    );
    const cond = url.searchParams.get("query.cond") ?? "";
    expect(cond).not.toContain('"');
    expect(cond).not.toContain("[");
    expect(cond).not.toContain("(");
  });

  it("builds a single-study URL from an NCT id", () => {
    expect(buildStudyUrl("NCT00000001")).toBe(
      "https://clinicaltrials.gov/api/v2/studies/NCT00000001?format=json",
    );
  });
});

describe("normalizeStudy", () => {
  it("flattens a real-shaped record", () => {
    const trial = normalizeStudy(rawStudyFixture);
    expect(trial).not.toBeNull();
    expect(trial!.nctId).toBe("NCT00000001");
    expect(trial!.overallStatus).toBe("RECRUITING");
    expect(trial!.phases).toEqual(["PHASE2"]);
    expect(trial!.minimumAgeYears).toBe(18);
    expect(trial!.maximumAgeYears).toBe(70);
    expect(trial!.sex).toBe("ALL");
    expect(trial!.leadSponsor).toBe("Example Research Institute");
    expect(trial!.interventions).toHaveLength(1);
    expect(trial!.sourceUrl).toBe("https://clinicaltrials.gov/study/NCT00000001");
    expect(Date.parse(trial!.retrievedAt)).not.toBeNaN();
  });

  it("returns null when there is no NCT id to link back to", () => {
    expect(normalizeStudy({ protocolSection: { identificationModule: {} } })).toBeNull();
    expect(normalizeStudy(null)).toBeNull();
    expect(normalizeStudy({})).toBeNull();
  });

  it("represents missing fields as null rather than inventing defaults", () => {
    const trial = normalizeStudy({
      protocolSection: { identificationModule: { nctId: "NCT99999999" } },
    });
    expect(trial!.overallStatus).toBe("UNKNOWN");
    expect(trial!.minimumAge).toBeNull();
    expect(trial!.maximumAgeYears).toBeNull();
    expect(trial!.sex).toBeNull();
    expect(trial!.healthyVolunteers).toBeNull();
    expect(trial!.leadSponsor).toBeNull();
    expect(trial!.conditions).toEqual([]);
    expect(trial!.locations).toEqual([]);
    expect(trial!.nearestLocationMiles).toBeNull();
  });

  it("discards enum values it does not recognise instead of passing them through", () => {
    const trial = normalizeStudy({
      protocolSection: {
        identificationModule: { nctId: "NCT99999999" },
        statusModule: { overallStatus: "MADE_UP" },
        designModule: { phases: ["PHASE2", "NOT_A_PHASE"] },
        eligibilityModule: { sex: "OTHER" },
      },
    });
    expect(trial!.overallStatus).toBe("UNKNOWN");
    expect(trial!.phases).toEqual(["PHASE2"]);
    expect(trial!.sex).toBeNull();
  });

  it("computes per-location and nearest distances when an origin is supplied", () => {
    const trial = normalizeStudy(rawStudyFixture, { lat: 41.8781, lon: -87.6298 });
    const chicago = trial!.locations.find((l) => l.city === "Chicago");
    expect(chicago!.distanceMiles).toBeLessThan(5);
    // The New York site is far away, so Chicago must be nearest.
    expect(trial!.nearestLocationMiles).toBe(chicago!.distanceMiles);
  });

  it("leaves distance null for locations without coordinates", () => {
    const trial = normalizeStudy(
      {
        protocolSection: {
          identificationModule: { nctId: "NCT99999999" },
          contactsLocationsModule: { locations: [{ city: "Nowhere" }] },
        },
      },
      { lat: 41.8, lon: -87.6 },
    );
    expect(trial!.locations[0].distanceMiles).toBeNull();
    expect(trial!.nearestLocationMiles).toBeNull();
  });
});

describe("geo helpers", () => {
  it("measures a known distance within one percent", () => {
    // Chicago to New York is roughly 711 straight-line miles.
    const miles = haversineMiles(41.8781, -87.6298, 40.7128, -74.006);
    expect(miles).toBeGreaterThan(704);
    expect(miles).toBeLessThan(718);
  });

  it("parses registry age strings into years", () => {
    expect(parseAgeToYears("18 Years")).toBe(18);
    expect(parseAgeToYears("6 Months")).toBeCloseTo(0.5, 5);
    expect(parseAgeToYears("1 Year")).toBe(1);
  });

  it("returns null for unparseable ages so they are treated as unknown", () => {
    expect(parseAgeToYears(null)).toBeNull();
    expect(parseAgeToYears("")).toBeNull();
    expect(parseAgeToYears("N/A")).toBeNull();
    expect(parseAgeToYears("adult")).toBeNull();
  });
});
