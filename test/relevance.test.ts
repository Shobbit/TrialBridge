import { describe, expect, it } from "vitest";
import { filterByCondition, matchesCondition } from "@/lib/ctgov/relevance";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Disease relevance.
 *
 * ClinicalTrials.gov matches `query.cond` loosely, so a search for
 * "type 2 diabetes" really does return studies whose only listed condition is
 * "Healthy Participants" or "Type 1 Diabetes". Those wrong-disease results are
 * what this filter removes.
 *
 * The condition strings below are the wording the live registry actually uses.
 * All NCT ids and study details remain fictional.
 */

const base = normalizeStudy(rawStudyFixture) as Trial;
const withConditions = (conditions: string[]): Trial => ({ ...base, conditions });
const matches = (conditions: string[], query: string) =>
  matchesCondition(withConditions(conditions), query).matched;

describe("the wrong disease is rejected", () => {
  it("rejects Type 1 Diabetes for a type 2 diabetes search", () => {
    expect(matches(["Type 1 Diabetes"], "type 2 diabetes")).toBe(false);
  });

  it("rejects Healthy Participants for a disease search", () => {
    expect(matches(["Healthy Participants"], "type 2 diabetes")).toBe(false);
    expect(matches(["Healthy Volunteers"], "metastatic melanoma")).toBe(false);
  });

  it("rejects an unrelated disease entirely", () => {
    expect(matches(["Hypertension"], "type 2 diabetes")).toBe(false);
    expect(matches(["Breast Cancer"], "melanoma")).toBe(false);
  });

  it("keeps the numeric discriminator strict in both directions", () => {
    expect(matches(["Type 2 Diabetes"], "type 1 diabetes")).toBe(false);
    expect(matches(["Type 1 Diabetes"], "type 2 diabetes")).toBe(false);
  });
});

describe("real registry wording still matches", () => {
  // Every one of these is a condition string the live API returned for
  // query.cond="type 2 diabetes".
  it.each([
    ["Type 2 Diabetes"],
    ["Type II Diabetes"],
    ["Type 2 Diabetes Mellitus (T2DM)"],
    ["Diabetes Mellitus Type 2"],
    ["Diabetes Mellitus, Type 2"],
    ["Diabetes Type 2"],
    ["Obesity and Diabetes Mellitus, Type 2"],
  ])("accepts %s", (condition) => {
    expect(matches([condition], "type 2 diabetes")).toBe(true);
  });

  it("accepts a study listing several conditions where one matches", () => {
    expect(
      matches(["Obesity", "Type 2 Diabetes", "Hospital Readmission"], "type 2 diabetes"),
    ).toBe(true);
  });

  it("folds roman numerals so Type II equals type 2", () => {
    expect(matches(["Type II Diabetes"], "type 2 diabetes")).toBe(true);
    expect(matches(["Type 2 Diabetes"], "type ii diabetes")).toBe(true);
  });
});

describe("severity qualifiers do not over-filter", () => {
  it("accepts plain Melanoma for a metastatic melanoma search", () => {
    // Registries routinely list the bare disease for advanced-disease studies.
    expect(matches(["Melanoma"], "metastatic melanoma")).toBe(true);
  });

  it.each(["advanced", "recurrent", "refractory", "unresectable", "relapsed"])(
    "treats %s as optional",
    (qualifier) => {
      expect(matches(["Melanoma"], `${qualifier} melanoma`)).toBe(true);
    },
  );

  it("still requires the disease itself", () => {
    expect(matches(["Melanoma"], "metastatic breast cancer")).toBe(false);
  });
});

describe("abbreviations people actually type", () => {
  it.each([
    ["T2DM", ["Type 2 Diabetes Mellitus"]],
    ["t2d", ["Type 2 Diabetes"]],
    ["NSCLC", ["Non Small Cell Lung Cancer"]],
    ["COPD", ["Chronic Obstructive Pulmonary Disease"]],
  ])("expands %s", (query, conditions) => {
    expect(matches(conditions, query)).toBe(true);
  });

  it("does not let T2DM match a type 1 study", () => {
    expect(matches(["Type 1 Diabetes Mellitus"], "T2DM")).toBe(false);
  });
});

describe("failing safe", () => {
  it("keeps a study that publishes no condition list", () => {
    const result = matchesCondition(withConditions([]), "type 2 diabetes");
    expect(result.matched).toBe(true);
    expect(result.reason).toBe("no-conditions-published");
  });

  it("keeps everything when no condition was entered", () => {
    expect(matchesCondition(base, "").matched).toBe(true);
    expect(matchesCondition(base, "   ").matched).toBe(true);
  });

  it("does not throw on punctuation or odd input", () => {
    for (const query of ["!!!", "type-2 diabetes", "diabetes (type 2)", "a", "  "]) {
      expect(() => matchesCondition(base, query)).not.toThrow();
    }
  });

  it("tolerates hyphenation and parentheses", () => {
    expect(matches(["Type 2 Diabetes"], "type-2 diabetes")).toBe(true);
    expect(matches(["Type 2 Diabetes"], "diabetes (type 2)")).toBe(true);
  });

  it("folds plurals and spelling variants", () => {
    expect(matches(["Solid Tumors"], "solid tumour")).toBe(true);
  });
});

describe("filterByCondition", () => {
  it("removes the wrong-disease studies and counts them", () => {
    const trials = [
      withConditions(["Type 2 Diabetes"]),
      withConditions(["Type 1 Diabetes"]),
      withConditions(["Healthy Participants"]),
      withConditions(["Diabetes Mellitus, Type 2", "Obesity"]),
    ];

    const { kept, removed } = filterByCondition(trials, "type 2 diabetes");
    expect(kept).toHaveLength(2);
    expect(removed).toBe(2);
    for (const t of kept) {
      expect(t.conditions.join(" ").toLowerCase()).toContain("2");
    }
  });

  it("removes nothing when every study is on topic", () => {
    const trials = [withConditions(["Type 2 Diabetes"]), withConditions(["Type 2 Diabetes"])];
    expect(filterByCondition(trials, "type 2 diabetes").removed).toBe(0);
  });

  it("handles an empty result set", () => {
    expect(filterByCondition([], "type 2 diabetes")).toEqual({ kept: [], removed: 0 });
  });
});
