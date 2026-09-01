import { describe, expect, it } from "vitest";
import {
  extractStageRequirement,
  hasDefiniteStage,
  stageLabel,
  stageMatches,
} from "@/lib/ctgov/stage";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Cancer-stage extraction and the "if available, match" rule.
 *
 * Three properties are load-bearing and each was previously wrong:
 * negation must invert nothing into Stage IV; "metastatic" alone must never
 * become a definite stage used for filtering; and under-extracting a list or
 * range must not exclude a patient the trial actually accepts.
 *
 * All studies here are fictional.
 */

const extract = (conditions: string[], inclusion = "") =>
  extractStageRequirement(conditions, inclusion);
const fromText = (text: string) => extract([], text);

// --------------------------------------------------------------------------

describe("clear positive statements", () => {
  it.each([
    ["Stage IV disease", ["IV"]],
    ["Stage 4 disease", ["IV"]],
    ["stage iii confirmed", ["III"]],
    ["Stage 0 carcinoma in situ", ["0"]],
    ["Stage IIIb disease", ["III"]],
    ["Stage IIIA or IIIB", ["III"]],
  ])("reads %s", (text, expected) => {
    const req = fromText(text);
    expect(req.stages).toEqual(expected);
    expect(req.source).toBe("stated");
  });

  it("reads a stage out of the conditions list", () => {
    // The registry really does publish "Stage IV Bladder Cancer AJCC v8".
    expect(extract(["Stage IV Bladder Cancer AJCC v8"]).stages).toEqual(["IV"]);
  });

  it("records the wording it read", () => {
    expect(fromText("Stage IV disease").evidence).toMatch(/stage\s*IV/i);
  });
});

describe("lists, ranges, plurals and thresholds", () => {
  it.each([
    ["Stage II and III", ["II", "III"]],
    ["Stages II and III", ["II", "III"]],
    ["Stage II/III/IV", ["II", "III", "IV"]],
    ["Stage III or IV", ["III", "IV"]],
    ["Stage II-IV", ["II", "III", "IV"]],
    ["Stage I through IV", ["I", "II", "III", "IV"]],
    ["Stage II to IV", ["II", "III", "IV"]],
    ["Stage IIB or higher", ["II", "III", "IV"]],
    ["Stage III or greater", ["III", "IV"]],
    ["Stage II and above", ["II", "III", "IV"]],
    ["Stage II or lower", ["0", "I", "II"]],
    ["Stage II or earlier", ["0", "I", "II"]],
  ])("reads %s", (text, expected) => {
    expect(fromText(text).stages).toEqual(expected);
  });

  it("does not lose a stage the trial explicitly accepts", () => {
    // Under-extraction is the dangerous direction: it excludes a patient from a
    // trial that names their stage.
    const req = fromText("Inclusion Criteria: Stages II and III are eligible.");
    expect(stageMatches(req, "III")).toBe(true);
  });
});

describe("negation is honoured", () => {
  it.each([
    "non-metastatic disease",
    "no metastases present",
    "without metastatic disease",
    "must not have metastatic spread",
    "patients free of metastatic disease",
    "absence of metastatic disease",
  ])("does not turn %s into a stage", (text) => {
    const req = fromText(text);
    expect(req.stages).toEqual([]);
    expect(req.source).toBe("none");
  });

  it.each([
    "no Stage IV disease",
    "Stage IV disease must be absent",
    "non-Stage IV disease",
    "patients with Stage IV are excluded",
    "must not have Stage IV disease",
  ])("does not read %s as an accepted stage", (text) => {
    expect(fromText(text).stages).toEqual([]);
  });

  it("still reads a positive stage in the same text", () => {
    const req = fromText("Stage II or III disease. No Stage IV disease.");
    expect(req.stages).toEqual(["II", "III"]);
  });
});

describe("metastatic is never a definite stage", () => {
  it.each(["metastatic disease", "known metastases", "distant metastasis"])(
    "records %s as uncertain, not Stage IV",
    (text) => {
      const req = fromText(text);
      expect(req.source).toBe("metastatic-unspecified");
      expect(req.stages).toEqual([]);
      expect(hasDefiniteStage(req)).toBe(false);
    },
  );

  it("never filters anyone out on a metastatic mention", () => {
    // Melanoma Stage III already includes regional metastases; AML has no
    // I-IV staging at all. A metastatic mention cannot exclude anyone.
    const req = fromText("Inclusion Criteria: metastatic disease required.");
    for (const stage of ["0", "I", "II", "III", "IV"] as const) {
      expect(stageMatches(req, stage), `stage ${stage}`).toBe(true);
    }
  });

  it("says so plainly in the label", () => {
    expect(stageLabel(fromText("metastatic disease"))).toBe(
      "Metastatic disease mentioned; exact stage not clearly stated",
    );
  });

  it("prefers an explicit stage over the metastatic mention", () => {
    const req = fromText("Stage II disease without metastatic spread");
    expect(req.source).toBe("stated");
    expect(req.stages).toEqual(["II"]);
  });

  it("reads metastatic from the conditions list too", () => {
    expect(extract(["Metastatic Uveal Melanoma"]).source).toBe("metastatic-unspecified");
  });
});

describe("exclusion text is never read as acceptance", () => {
  const trialWith = (criteria: string): Trial =>
    normalizeStudy({
      ...rawStudyFixture,
      protocolSection: {
        ...rawStudyFixture.protocolSection,
        conditionsModule: { conditions: ["Example Cancer"] },
        eligibilityModule: { eligibilityCriteria: criteria },
      },
    }) as Trial;

  it("does not treat an excluded stage as accepted", () => {
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
      "Inclusion Criteria:\n\n1. Confirmed cancer.\n\nExclusion Criteria:\n\n1. Any metastatic disease.",
    );
    expect(trial.stageRequirement.source).toBe("none");
  });
});

describe("the 'if available, match' rule", () => {
  const stated = (text: string) => fromText(`Inclusion Criteria: Stage ${text}`);

  it("keeps a study that states no stage at all", () => {
    const none = fromText("Inclusion Criteria: Confirmed disease.");
    expect(none.source).toBe("none");
    for (const stage of ["0", "I", "II", "III", "IV"] as const) {
      expect(stageMatches(none, stage), `stage ${stage}`).toBe(true);
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
});

describe("labels never present uncertainty as a definite stage", () => {
  it("names a clear single stage", () => {
    expect(stageLabel(fromText("Stage IV"))).toBe("Stage IV");
    expect(hasDefiniteStage(fromText("Stage IV"))).toBe(true);
  });

  it("uses a range for contiguous stages", () => {
    expect(stageLabel(fromText("Stage II-IV"))).toBe("Stage II–IV");
  });

  it("lists non-contiguous stages", () => {
    expect(stageLabel(extract(["Stage I Cancer"], "Stage IV also eligible"))).toBe("Stage I, IV");
  });

  it("says the stage is not clear when nothing was stated", () => {
    const req = fromText("Confirmed disease");
    expect(stageLabel(req)).toBe("Stage not clearly stated");
    expect(hasDefiniteStage(req)).toBe(false);
  });
});

describe("failing safe", () => {
  it("never throws on odd input", () => {
    for (const text of ["", "stage", "stage 9", "stage XII", "!!!", "s".repeat(10_000)]) {
      expect(() => fromText(text)).not.toThrow();
    }
  });

  it("ignores stage numbers outside 0-IV", () => {
    expect(fromText("Stage 9 disease").stages).toEqual([]);
  });

  it("treats empty input as unstated", () => {
    const req = extract([], "");
    expect(req.stages).toEqual([]);
    expect(req.source).toBe("none");
    expect(req.evidence).toBeNull();
  });
});
