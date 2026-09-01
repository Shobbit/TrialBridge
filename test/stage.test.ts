import { describe, expect, it } from "vitest";
import {
  extractStageRequirement,
  stageLabel,
  stageMatches,
} from "@/lib/ctgov/stage";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Cancer-stage extraction and the "if available, match" rule.
 *
 * The rule that matters: a study stating a stage must agree with the stage
 * entered; a study stating none is kept. Measured across recruiting oncology
 * trials, roughly half state no stage at all, so requiring one would hide more
 * real options than noise.
 *
 * All studies here are fictional.
 */

const extract = (conditions: string[], inclusion = "") =>
  extractStageRequirement(conditions, inclusion);

describe("reading a stated stage", () => {
  it.each([
    ["Stage IV disease", ["IV"]],
    ["Stage 4 disease", ["IV"]],
    ["stage iii confirmed", ["III"]],
    ["Stage 0 carcinoma in situ", ["0"]],
    ["Stage II or Stage III", ["II", "III"]],
  ])("reads %s", (text, expected) => {
    expect(extract([], `Inclusion Criteria: ${text}`).stages).toEqual(expected);
  });

  it("expands a hyphenated range", () => {
    expect(extract([], "Stage II-IV disease").stages).toEqual(["II", "III", "IV"]);
  });

  it("expands a slash range", () => {
    expect(extract([], "Stage III/IV").stages).toEqual(["III", "IV"]);
  });

  it("expands an 'or' range", () => {
    expect(extract([], "Stage 3 or 4").stages).toEqual(["III", "IV"]);
  });

  it("ignores sub-letters: IIIb is still III", () => {
    expect(extract([], "Stage IIIb disease").stages).toEqual(["III"]);
  });

  it("reads a stage out of the conditions list", () => {
    // Registries really do publish conditions like "Stage IV Bladder Cancer AJCC v8".
    expect(extract(["Stage IV Bladder Cancer AJCC v8"]).stages).toEqual(["IV"]);
  });

  it("collects every stage mentioned across conditions and criteria", () => {
    const req = extract(["Stage II Breast Cancer"], "Inclusion: Stage IV also permitted");
    expect(req.stages).toEqual(["II", "IV"]);
  });

  it("records the wording it read the stage from", () => {
    expect(extract([], "Stage IV disease").evidence).toMatch(/stage\s*IV/i);
  });
});

describe("metastatic counts as Stage IV", () => {
  it.each(["metastatic disease", "known metastases", "distant metastasis"])(
    "maps %s to Stage IV",
    (text) => {
      const req = extract([], `Inclusion Criteria: ${text}`);
      expect(req.stages).toEqual(["IV"]);
      expect(req.source).toBe("metastatic");
    },
  );

  it("prefers an explicitly stated stage over the metastatic inference", () => {
    const req = extract([], "Stage II disease without metastatic spread");
    expect(req.source).toBe("stated");
    expect(req.stages).toEqual(["II"]);
  });

  it("reads metastatic from the conditions list", () => {
    expect(extract(["Metastatic Uveal Melanoma"]).stages).toEqual(["IV"]);
  });
});

describe("exclusion text is not read as acceptance", () => {
  const trialWith = (criteria: string): Trial =>
    normalizeStudy({
      ...rawStudyFixture,
      protocolSection: {
        ...rawStudyFixture.protocolSection,
        conditionsModule: { conditions: ["Example Cancer"] },
        eligibilityModule: { eligibilityCriteria: criteria },
      },
    }) as Trial;

  it("does not treat an excluded stage as an accepted one", () => {
    // Reading this as "accepts Stage IV" would hide exactly the wrong people.
    const trial = trialWith(
      "Inclusion Criteria:\n\n1. Confirmed example cancer.\n\nExclusion Criteria:\n\n1. Stage IV disease.",
    );
    expect(trial.stageRequirement.stages).toEqual([]);
    expect(trial.stageRequirement.source).toBe("none");
  });

  it("still reads a stage stated in the inclusion half", () => {
    const trial = trialWith(
      "Inclusion Criteria:\n\n1. Stage II or III disease.\n\nExclusion Criteria:\n\n1. Stage IV disease.",
    );
    expect(trial.stageRequirement.stages).toEqual(["II", "III"]);
  });

  it("does not infer metastatic from exclusion text alone", () => {
    const trial = trialWith(
      "Inclusion Criteria:\n\n1. Confirmed example cancer.\n\nExclusion Criteria:\n\n1. Any metastatic disease.",
    );
    expect(trial.stageRequirement.stages).toEqual([]);
  });
});

describe("the 'if available, match' rule", () => {
  const stated = (stages: string) => extract([], `Inclusion Criteria: Stage ${stages}`);

  it("keeps a study that states no stage at all", () => {
    // This is the clause that protects roughly half of all recruiting trials.
    const none = extract([], "Inclusion Criteria: Confirmed disease.");
    expect(none.stages).toEqual([]);
    for (const patient of ["0", "I", "II", "III", "IV"] as const) {
      expect(stageMatches(none, patient), `stage ${patient}`).toBe(true);
    }
  });

  it("keeps a study whose stated stage includes the person's", () => {
    expect(stageMatches(stated("II-IV"), "III")).toBe(true);
    expect(stageMatches(stated("IV"), "IV")).toBe(true);
  });

  it("drops a study whose stated stage excludes the person's", () => {
    expect(stageMatches(stated("IV"), "II")).toBe(false);
    expect(stageMatches(stated("I-II"), "IV")).toBe(false);
  });

  it("keeps everything when no stage was entered", () => {
    expect(stageMatches(stated("IV"), "unspecified")).toBe(true);
    expect(stageMatches(stated("IV"), null)).toBe(true);
    expect(stageMatches(stated("IV"), undefined)).toBe(true);
  });

  it("matches a metastatic study to a Stage IV patient", () => {
    const met = extract([], "Inclusion Criteria: metastatic disease");
    expect(stageMatches(met, "IV")).toBe(true);
    expect(stageMatches(met, "II")).toBe(false);
  });
});

describe("labels shown on the card", () => {
  it("names a single stage", () => {
    expect(stageLabel(extract([], "Stage IV"))).toBe("Stage IV");
  });

  it("uses a range for contiguous stages", () => {
    expect(stageLabel(extract([], "Stage II-IV"))).toBe("Stage II–IV");
  });

  it("lists non-contiguous stages", () => {
    expect(stageLabel(extract(["Stage I Cancer"], "Stage IV also eligible"))).toBe("Stage I, IV");
  });

  it("returns null when nothing was stated, so the card can say so", () => {
    expect(stageLabel(extract([], "Confirmed disease"))).toBeNull();
  });
});

describe("failing safe", () => {
  it("never throws on odd input", () => {
    for (const text of ["", "stage", "stage 9", "stage XII", "!!!", "s".repeat(10_000)]) {
      expect(() => extract([], text)).not.toThrow();
    }
  });

  it("ignores stage numbers outside 0-IV", () => {
    expect(extract([], "Stage 9 disease").stages).toEqual([]);
  });

  it("treats a study with no criteria and no conditions as unstated", () => {
    const req = extract([], "");
    expect(req.stages).toEqual([]);
    expect(req.source).toBe("none");
    expect(req.evidence).toBeNull();
  });
});
