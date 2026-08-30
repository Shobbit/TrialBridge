import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SEARCH_STATUS,
  SEARCHABLE_RECRUITMENT_STATUSES,
  RECRUITMENT_STATUSES,
} from "@/lib/ctgov/types";
import { EMPTY_PROFILE, searchInputSchema } from "@/lib/schemas";
import { buildSearchUrl } from "@/lib/ctgov/query";
import { createTools } from "@/webmcp/tools";

/**
 * Recruiting-first search.
 *
 * TrialBridge is for people trying to enrol now, so a search must never surface
 * studies that cannot accept them. These assertions cover all three layers that
 * enforce it: the form default, the shared schema, and the server route.
 */

// The route pulls in the upstream fetch and the geocoder; both are stubbed so
// these tests never touch the network.
vi.mock("@/lib/ctgov/fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ctgov/fetch")>("@/lib/ctgov/fetch");
  return { ...actual, fetchUpstreamJson: vi.fn(async () => ({ totalCount: 0, studies: [] })) };
});
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null) }));

const { fetchUpstreamJson } = await import("@/lib/ctgov/fetch");
const { POST } = await import("@/app/api/trials/search/route");

const post = (body: unknown) =>
  POST(
    new Request("https://trialbridge.test/api/trials/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** The upstream URL the route actually requested. */
function upstreamUrl(): URL {
  const mock = vi.mocked(fetchUpstreamJson);
  return new URL(String(mock.mock.calls.at(-1)?.[0]));
}

beforeEach(() => {
  vi.mocked(fetchUpstreamJson).mockClear();
});

// --------------------------------------------------------------------------

describe("the searchable status set", () => {
  it("is exactly RECRUITING and NOT_YET_RECRUITING", () => {
    expect([...SEARCHABLE_RECRUITMENT_STATUSES]).toEqual(["RECRUITING", "NOT_YET_RECRUITING"]);
  });

  it("excludes every status that cannot enrol a new participant", () => {
    for (const closed of [
      "COMPLETED",
      "TERMINATED",
      "WITHDRAWN",
      "SUSPENDED",
      "ACTIVE_NOT_RECRUITING",
      "ENROLLING_BY_INVITATION",
      "UNKNOWN",
    ]) {
      expect(SEARCHABLE_RECRUITMENT_STATUSES as readonly string[]).not.toContain(closed);
    }
  });

  it("keeps the full display list intact, so a shortlisted study can still report a closed status", () => {
    // A study already on the shortlist may later be terminated; the UI must be
    // able to say so truthfully even though it is not searchable.
    expect(RECRUITMENT_STATUSES).toHaveLength(9);
    expect(RECRUITMENT_STATUSES as readonly string[]).toContain("TERMINATED");
    expect(RECRUITMENT_STATUSES as readonly string[]).toContain("COMPLETED");
  });
});

describe("defaults", () => {
  it("selects Recruiting and nothing else in a fresh profile", () => {
    expect(EMPTY_PROFILE.recruitmentStatuses).toEqual([DEFAULT_SEARCH_STATUS]);
    expect(EMPTY_PROFILE.recruitmentStatuses).not.toContain("NOT_YET_RECRUITING");
  });

  it("keeps Not yet recruiting available as an opt-in", () => {
    const parsed = searchInputSchema.safeParse({
      condition: "example condition",
      recruitmentStatuses: ["RECRUITING", "NOT_YET_RECRUITING"],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("schema rejects unsupported statuses rather than converting them", () => {
  it.each([
    "COMPLETED",
    "TERMINATED",
    "WITHDRAWN",
    "SUSPENDED",
    "ACTIVE_NOT_RECRUITING",
    "ENROLLING_BY_INVITATION",
    "UNKNOWN",
  ])("rejects %s", (status) => {
    const parsed = searchInputSchema.safeParse({
      condition: "example condition",
      recruitmentStatuses: [status],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty array instead of treating it as 'no filter'", () => {
    const parsed = searchInputSchema.safeParse({
      condition: "example condition",
      recruitmentStatuses: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("server injects the default when the status is omitted", () => {
  it("sends filter.overallStatus=RECRUITING for a bare search", async () => {
    const response = await post({ condition: "example condition" });
    expect(response.status).toBe(200);
    expect(upstreamUrl().searchParams.get("filter.overallStatus")).toBe("RECRUITING");
  });

  it("never omits the status filter entirely", async () => {
    await post({ condition: "example condition" });
    expect(upstreamUrl().searchParams.has("filter.overallStatus")).toBe(true);
  });

  it("honours an explicit opt-in to Not yet recruiting", async () => {
    await post({
      condition: "example condition",
      recruitmentStatuses: ["RECRUITING", "NOT_YET_RECRUITING"],
    });
    expect(upstreamUrl().searchParams.get("filter.overallStatus")).toBe(
      "RECRUITING|NOT_YET_RECRUITING",
    );
  });

  it("returns 400 with a readable message for a closed status", async () => {
    const response = await post({
      condition: "example condition",
      recruitmentStatuses: ["COMPLETED"],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not valid/i);
    // Nothing was requested upstream.
    expect(vi.mocked(fetchUpstreamJson)).not.toHaveBeenCalled();
  });
});

describe("query builder", () => {
  it("pipe-joins only searchable statuses", () => {
    const url = new URL(
      buildSearchUrl({
        input: searchInputSchema.parse({
          condition: "example condition",
          recruitmentStatuses: ["RECRUITING", "NOT_YET_RECRUITING"],
        }),
      }),
    );
    expect(url.searchParams.get("filter.overallStatus")).toBe("RECRUITING|NOT_YET_RECRUITING");
  });
});

describe("WebMCP tool schemas", () => {
  const statusEnum = (toolName: string) => {
    const tool = createTools().find((t) => t.name === toolName)!;
    const prop = (tool.inputSchema.properties ?? {})["recruitmentStatuses"] as {
      items: { enum: string[] };
    };
    return prop.items.enum;
  };

  it.each(["search_clinical_trials", "update_search_profile"])(
    "%s offers only enrolling statuses",
    (toolName) => {
      expect(statusEnum(toolName)).toEqual(["RECRUITING", "NOT_YET_RECRUITING"]);
    },
  );

  it("rejects a closed status passed to update_search_profile", async () => {
    const tool = createTools().find((t) => t.name === "update_search_profile")!;
    const result = await tool.execute({ recruitmentStatuses: ["COMPLETED"] });
    expect(result.isError).toBe(true);
  });

  it("rejects a closed status passed to search_clinical_trials", async () => {
    const tool = createTools().find((t) => t.name === "search_clinical_trials")!;
    const result = await tool.execute({
      condition: "example condition",
      recruitmentStatuses: ["TERMINATED"],
    });
    expect(result.isError).toBe(true);
  });
});

describe("stored profiles from the previous build", () => {
  // The v1 -> v2 persistence migration is covered directly, against the real
  // production function, in test/migration.test.ts. It is deliberately not
  // re-tested here: an inline reimplementation of the filtering would keep
  // passing even if the migration were deleted.
  it("is covered by test/migration.test.ts against the production function", () => {
    expect(SEARCHABLE_RECRUITMENT_STATUSES as readonly string[]).not.toContain("COMPLETED");
  });
});
