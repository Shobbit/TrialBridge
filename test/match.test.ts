import { describe, expect, it } from "vitest";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { ELIGIBILITY_DISCLAIMER, analyzeTrial } from "@/lib/match";
import { profileSchema, type SearchProfile } from "@/lib/schemas";
import { rawStudyFixture } from "./fixtures";

const baseTrial = normalizeStudy(rawStudyFixture) as Trial;

function profile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return profileSchema.parse(overrides);
}

function withTrial(overrides: Partial<Trial>): Trial {
  return { ...baseTrial, ...overrides };
}

/** All finding text produced for a trial/profile pair. */
function allText(trial: Trial, p: SearchProfile): string {
  const a = analyzeTrial(trial, p);
  return [...a.matches, ...a.mismatches, ...a.unknowns].map((f) => f.detail).join(" ");
}

describe("age analysis", () => {
  it("reports a match when the age is inside the published range", () => {
    const a = analyzeTrial(baseTrial, profile({ age: 54 }));
    expect(a.matches.some((f) => f.field === "age")).toBe(true);
    expect(a.mismatches.some((f) => f.field === "age")).toBe(false);
  });

  it("reports a mismatch below the minimum and above the maximum", () => {
    expect(
      analyzeTrial(baseTrial, profile({ age: 12 })).mismatches.some((f) => f.field === "age"),
    ).toBe(true);
    expect(
      analyzeTrial(baseTrial, profile({ age: 80 })).mismatches.some((f) => f.field === "age"),
    ).toBe(true);
  });

  it("treats the boundary ages as within range", () => {
    for (const age of [18, 70]) {
      expect(
        analyzeTrial(baseTrial, profile({ age })).mismatches.some((f) => f.field === "age"),
        `age ${age}`,
      ).toBe(false);
    }
  });

  it("reports unknown rather than assuming when no age was entered", () => {
    const a = analyzeTrial(baseTrial, profile({}));
    expect(a.unknowns.some((f) => f.field === "age")).toBe(true);
    expect(a.matches.some((f) => f.field === "age")).toBe(false);
    expect(a.mismatches.some((f) => f.field === "age")).toBe(false);
  });

  it("treats an absent published range as unknown, never as 'no limit'", () => {
    const trial = withTrial({
      minimumAge: null,
      maximumAge: null,
      minimumAgeYears: null,
      maximumAgeYears: null,
    });
    const a = analyzeTrial(trial, profile({ age: 54 }));
    expect(a.unknowns.some((f) => f.field === "age")).toBe(true);
    expect(a.matches.some((f) => f.field === "age")).toBe(false);
  });

  it("flags a half-published range as partly unknown even when it matches", () => {
    const trial = withTrial({ maximumAge: null, maximumAgeYears: null });
    const a = analyzeTrial(trial, profile({ age: 54 }));
    expect(a.matches.some((f) => f.field === "age")).toBe(true);
    expect(a.unknowns.some((f) => f.field === "age")).toBe(true);
  });
});

describe("sex analysis", () => {
  it("matches when a trial accepts all sexes", () => {
    const a = analyzeTrial(baseTrial, profile({ sex: "female" }));
    expect(a.matches.some((f) => f.field === "sex")).toBe(true);
  });

  it("reports a mismatch when the trial restricts to the other sex", () => {
    const trial = withTrial({ sex: "FEMALE" });
    const a = analyzeTrial(trial, profile({ sex: "male" }));
    expect(a.mismatches.some((f) => f.field === "sex")).toBe(true);
  });

  it("reports unknown when the trial restricts by sex but none was entered", () => {
    const trial = withTrial({ sex: "FEMALE" });
    const a = analyzeTrial(trial, profile({ sex: "unspecified" }));
    expect(a.unknowns.some((f) => f.field === "sex")).toBe(true);
    expect(a.mismatches.some((f) => f.field === "sex")).toBe(false);
  });
});

describe("distance analysis", () => {
  it("matches when the nearest site is inside the stated limit", () => {
    const trial = withTrial({ nearestLocationMiles: 12 });
    const a = analyzeTrial(trial, profile({ travelDistanceMiles: 50 }));
    expect(a.matches.some((f) => f.field === "distance")).toBe(true);
  });

  it("reports a mismatch when the nearest site is beyond the limit", () => {
    const trial = withTrial({ nearestLocationMiles: 300 });
    const a = analyzeTrial(trial, profile({ travelDistanceMiles: 50 }));
    expect(a.mismatches.some((f) => f.field === "distance")).toBe(true);
  });

  it("reports unknown when no distance could be measured", () => {
    const trial = withTrial({ nearestLocationMiles: null });
    const a = analyzeTrial(trial, profile({ travelDistanceMiles: 50 }));
    expect(a.unknowns.some((f) => f.field === "distance")).toBe(true);
  });
});

describe("recruitment status analysis", () => {
  it("matches a recruiting trial", () => {
    expect(
      analyzeTrial(baseTrial, profile({})).matches.some((f) => f.field === "recruitmentStatus"),
    ).toBe(true);
  });

  it("flags a completed trial as a mismatch", () => {
    const a = analyzeTrial(withTrial({ overallStatus: "COMPLETED" }), profile({}));
    expect(a.mismatches.some((f) => f.field === "recruitmentStatus")).toBe(true);
  });

  it("treats an unknown status as unknown", () => {
    const a = analyzeTrial(withTrial({ overallStatus: "UNKNOWN" }), profile({}));
    expect(a.unknowns.some((f) => f.field === "recruitmentStatus")).toBe(true);
  });
});

describe("condition analysis", () => {
  it("never reports a condition mismatch, because wording differences are not mismatches", () => {
    const a = analyzeTrial(baseTrial, profile({ condition: "something entirely different" }));
    expect(a.mismatches.some((f) => f.field === "condition")).toBe(false);
    expect(a.unknowns.some((f) => f.field === "condition")).toBe(true);
  });

  it("matches when wording overlaps the studied conditions", () => {
    const a = analyzeTrial(baseTrial, profile({ condition: "example condition" }));
    expect(a.matches.some((f) => f.field === "condition")).toBe(true);
  });
});

describe("prior treatments", () => {
  // The fixture excludes "Prior treatment with an example compound."
  it("raises a treatment named in the exclusion criteria to a visible mismatch", () => {
    const a = analyzeTrial(baseTrial, profile({ priorTreatments: ["Example Compound"] }));
    const finding = a.mismatches.find((f) => f.field === "priorTreatments");

    expect(finding).toBeDefined();
    // Still a prompt to check, never a verdict.
    expect(finding!.detail).toMatch(/raise this with the study team/i);
    expect(finding!.detail.toLowerCase()).not.toContain("ineligible");
    expect(finding!.detail.toLowerCase()).not.toContain("you do not qualify");
  });

  it("never promotes a prior treatment to a match", () => {
    const a = analyzeTrial(baseTrial, profile({ priorTreatments: ["Example Compound"] }));
    expect(a.matches.some((f) => f.field === "priorTreatments")).toBe(false);
  });

  it("reports a treatment named only in the inclusion criteria as unknown", () => {
    const a = analyzeTrial(baseTrial, profile({ priorTreatments: ["organ function"] }));
    expect(a.unknowns.some((f) => f.field === "priorTreatments")).toBe(true);
    expect(a.mismatches.some((f) => f.field === "priorTreatments")).toBe(false);
  });

  it("reports an unmentioned treatment as unknown, not as acceptable", () => {
    const a = analyzeTrial(baseTrial, profile({ priorTreatments: ["something not mentioned"] }));
    const finding = a.unknowns.find((f) => f.field === "priorTreatments");
    expect(finding).toBeDefined();
    expect(finding!.detail).toMatch(/does not mean/i);
    expect(a.mismatches.some((f) => f.field === "priorTreatments")).toBe(false);
  });
});

describe("cancer stage", () => {
  it("is not checked at all when no stage was entered", () => {
    const a = analyzeTrial(baseTrial, profile({}));
    expect([...a.matches, ...a.mismatches, ...a.unknowns].some((f) => f.field === "cancerStage")).toBe(
      false,
    );
  });

  it("flags a stage the criteria mention, without deciding anything", () => {
    const staged = withTrial({
      eligibilityCriteria: "Inclusion Criteria:\n\n1. Stage III disease confirmed by biopsy.",
    });
    const a = analyzeTrial(staged, profile({ cancerStage: "III" }));
    const finding = a.matches.find((f) => f.field === "cancerStage");
    expect(finding).toBeDefined();
    expect(finding!.detail).toMatch(/for the study team to confirm/i);
  });

  it("recognises the arabic form of a roman stage", () => {
    const staged = withTrial({
      eligibilityCriteria: "Inclusion Criteria:\n\n1. Stage 4 disease.",
    });
    const a = analyzeTrial(staged, profile({ cancerStage: "IV" }));
    expect(a.matches.some((f) => f.field === "cancerStage")).toBe(true);
  });

  it("never turns an unrecognised stage into a mismatch", () => {
    const a = analyzeTrial(baseTrial, profile({ cancerStage: "IV" }));
    expect(a.unknowns.some((f) => f.field === "cancerStage")).toBe(true);
    expect(a.mismatches.some((f) => f.field === "cancerStage")).toBe(false);
  });
});

describe("product boundary", () => {
  const cases: Array<[string, Trial, SearchProfile]> = [
    ["fully matching", baseTrial, profile({ condition: "example condition", age: 54, sex: "female", travelDistanceMiles: 500 })],
    ["fully mismatching", withTrial({ overallStatus: "TERMINATED", sex: "MALE" }), profile({ condition: "other", age: 9, sex: "female", travelDistanceMiles: 1 })],
    ["entirely unknown", withTrial({ minimumAge: null, maximumAge: null, minimumAgeYears: null, maximumAgeYears: null, sex: null, overallStatus: "UNKNOWN", locations: [], nearestLocationMiles: null, eligibilityCriteria: null }), profile({})],
  ];

  it.each(cases)("never claims eligibility (%s)", (_name, trial, p) => {
    const text = allText(trial, p).toLowerCase();
    expect(text).not.toContain("you are eligible");
    expect(text).not.toContain("you qualify");
    expect(text).not.toContain("you do not qualify");
    expect(text).not.toContain("we recommend");
    expect(text).not.toContain("you should");
    expect(text).not.toMatch(/\byou have\b/);
    expect(text).not.toContain("diagnos");
  });

  it("always reports free-text criteria as unevaluated", () => {
    const a = analyzeTrial(baseTrial, profile({ age: 54 }));
    expect(a.unknowns.some((f) => f.field === "eligibilityCriteria")).toBe(true);
    expect(a.matches.some((f) => f.field === "eligibilityCriteria")).toBe(false);
  });

  it("always produces at least one unknown, so no trial ever looks fully cleared", () => {
    for (const [, trial, p] of cases) {
      expect(analyzeTrial(trial, p).unknowns.length).toBeGreaterThan(0);
    }
  });

  it("states that only investigators determine eligibility", () => {
    expect(ELIGIBILITY_DISCLAIMER).toContain("investigators after medical screening");
    expect(ELIGIBILITY_DISCLAIMER.toLowerCase()).toContain("does not provide medical advice");
  });
});
