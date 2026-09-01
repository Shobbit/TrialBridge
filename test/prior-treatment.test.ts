import { describe, expect, it } from "vitest";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import {
  assessPriorTreatments,
  isConditional,
  partitionByPriorTreatment,
} from "@/lib/ctgov/prior-treatment";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Prior-treatment screening.
 *
 * Hiding a trial is the most destructive thing this app does, so the tests are
 * weighted towards the ways it could hide one wrongly: a drug named in the
 * intervention list, a drug the *inclusion* criteria explicitly permit, a
 * washout clause, a broad category word, an unreadable criteria block.
 *
 * All NCT ids and study details are fictional. Criteria wording follows the
 * patterns ClinicalTrials.gov actually publishes.
 */

const base = normalizeStudy(rawStudyFixture) as Trial;

/** Builds a study with the given eligibility text. */
function study(criteria: string, extra: Partial<Trial> = {}): Trial {
  return { ...base, eligibilityCriteria: criteria, ...extra };
}

/** Standard registry layout: headings plus bulleted items. */
function criteria(inclusion: string[], exclusion: string[]): string {
  return [
    "Inclusion Criteria:",
    ...inclusion.map((i) => `* ${i}`),
    "",
    "Exclusion Criteria:",
    ...exclusion.map((e) => `* ${e}`),
  ].join("\n");
}

const EVEROLIMUS = ["everolimus"];

// ---------------------------------------------------------------------------
// A — clear unconditional exclusion
// ---------------------------------------------------------------------------

describe("a clear unconditional exclusion", () => {
  it("is found by the drug's generic name", () => {
    const result = assessPriorTreatments(
      study(criteria(["Confirmed neuroendocrine tumor"], ["Prior treatment with everolimus"])),
      EVEROLIMUS,
    );

    expect(result.status).toBe("excluded");
    expect(result.hideRecommended).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matchedVia).toBe("name");
  });

  it("is found by a brand name the workbook supplied", () => {
    const result = assessPriorTreatments(
      study(criteria(["Confirmed NET"], ["Previous therapy with Afinitor"])),
      EVEROLIMUS,
    );

    expect(result.status).toBe("excluded");
    expect(result.matches[0].matchedVia).toBe("brand");
    expect(result.matches[0].matchedText).toBe("Afinitor");
  });

  it("is found by a specific mechanism the person's drug belongs to", () => {
    // A trial excluding "any prior mTOR inhibitor" excludes everolimus without
    // ever naming it.
    const result = assessPriorTreatments(
      study(criteria(["Confirmed NET"], ["Any prior mTOR inhibitor"])),
      EVEROLIMUS,
    );

    expect(result.status).toBe("excluded");
    expect(result.matches[0].matchedVia).toBe("mechanism");
  });

  it("quotes the criterion verbatim as evidence", () => {
    const text = "Prior treatment with everolimus or any other mTOR inhibitor";
    const result = assessPriorTreatments(study(criteria(["NET"], [text])), EVEROLIMUS);

    expect(result.matches[0].excerpt).toBe(text);
    expect(result.matches[0].criterionId).toMatch(/:exclusion:1$/);
  });

  it("reports one finding per treatment, not one per restatement", () => {
    const result = assessPriorTreatments(
      study(
        criteria(
          ["NET"],
          [
            "Prior treatment with everolimus",
            "Any previous everolimus exposure",
            "History of everolimus therapy",
          ],
        ),
      ),
      EVEROLIMUS,
    );

    expect(result.matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// B — conditional or time-qualified
// ---------------------------------------------------------------------------

describe("a conditional or time-qualified criterion", () => {
  const conditionalPhrasings = [
    "Everolimus within 4 weeks of study entry",
    "Treatment with everolimus in the last 6 months",
    "Prior everolimus without an adequate washout period",
    "Prior everolimus, unless discontinued for reasons other than progression",
    "Any prior systemic therapy except everolimus",
    "Prior everolimus is permitted if at least 28 days have elapsed",
    "Everolimus therapy less than 3 weeks prior to randomization",
    "Prior anticancer therapy ≤ 21 days before the first dose, including everolimus",
  ];

  for (const phrasing of conditionalPhrasings) {
    it(`is flagged but never hidden: "${phrasing}"`, () => {
      const result = assessPriorTreatments(study(criteria(["NET"], [phrasing])), EVEROLIMUS);

      expect(result.status).toBe("timing-unclear");
      expect(result.hideRecommended).toBe(false);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].finding).toBe("timing-unclear");
    });
  }

  it("recognises the conditional markers directly", () => {
    expect(isConditional("no prior therapy within 28 days")).toBe(true);
    expect(isConditional("requires a 4 week washout")).toBe(true);
    expect(isConditional("prior treatment with everolimus")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — a mention that is not an exclusion
// ---------------------------------------------------------------------------

describe("a mention that is not an exclusion", () => {
  it("ignores the drug appearing in the intervention list", () => {
    const trial = study(criteria(["NET"], ["Uncontrolled intercurrent illness"]), {
      interventions: [{ type: "DRUG", name: "Everolimus", description: "10 mg daily" }],
    });

    expect(assessPriorTreatments(trial, EVEROLIMUS).status).toBe("clear");
  });

  it("ignores the drug appearing in the title or summary", () => {
    const trial = study(criteria(["NET"], ["Pregnancy or breastfeeding"]), {
      briefTitle: "Everolimus in Advanced Neuroendocrine Tumors",
      briefSummary: "This study evaluates everolimus in participants with advanced NET.",
    });

    expect(assessPriorTreatments(trial, EVEROLIMUS).status).toBe("clear");
  });

  it("ignores an inclusion criterion that permits the drug", () => {
    // "Prior everolimus allowed" is the opposite of an exclusion; reading it as
    // one would hide exactly the trials this person should see.
    const trial = study(
      criteria(["NET", "Prior everolimus is allowed"], ["Uncontrolled hypertension"]),
    );

    expect(assessPriorTreatments(trial, EVEROLIMUS).status).toBe("clear");
  });

  it("never matches on the broad category alone", () => {
    // "Chemotherapy" is everolimus's neighbour in the catalogue and appears in
    // most oncology exclusion lists. Matching a category would hide the registry.
    const result = assessPriorTreatments(
      study(criteria(["NET"], ["Any prior chemotherapy"])),
      ["carboplatin"],
    );

    expect(result.status).toBe("clear");
  });

  it("does not match a drug name inside a longer word", () => {
    const result = assessPriorTreatments(
      study(criteria(["NET"], ["Prior treatment with fluorouracil-based regimens"])),
      ["oxaliplatin"],
    );

    expect(result.status).toBe("clear");
  });
});

// ---------------------------------------------------------------------------
// Refusing to guess
// ---------------------------------------------------------------------------

describe("when the record cannot be read", () => {
  it("makes no claim about criteria it could not split", () => {
    const trial = study(
      "Participants must have advanced NET. Patients who have received everolimus are not eligible.",
    );
    const result = assessPriorTreatments(trial, EVEROLIMUS);

    expect(result.notAssessed).toBe(true);
    expect(result.status).toBe("clear");
    expect(result.hideRecommended).toBe(false);
  });

  it("makes no claim when there are no criteria at all", () => {
    expect(assessPriorTreatments(study(""), EVEROLIMUS).notAssessed).toBe(true);
  });

  it("assesses nothing when no treatments were entered", () => {
    const trial = study(criteria(["NET"], ["Prior treatment with everolimus"]));
    const result = assessPriorTreatments(trial, []);

    expect(result.status).toBe("clear");
    expect(result.notAssessed).toBe(false);
  });

  it("ignores treatment ids that are not in the catalogue", () => {
    const trial = study(criteria(["NET"], ["Prior treatment with everolimus"]));
    expect(assessPriorTreatments(trial, ["not-a-real-drug"]).status).toBe("clear");
  });
});

// ---------------------------------------------------------------------------
// Procedures are flagged, never hidden
// ---------------------------------------------------------------------------

describe("procedures and care pathways", () => {
  it("flags a radiation exclusion without hiding the study", () => {
    // Having had radiotherapy is not the same kind of bar as having had a
    // specific drug, and hiding on it would remove most of the registry.
    const result = assessPriorTreatments(
      study(criteria(["NET"], ["Prior chemoradiation therapy"])),
      ["chemoradiation-therapy"],
    );

    expect(result.status).toBe("excluded");
    expect(result.hideRecommended).toBe(false);
  });

  it("never matches entries whose names are ordinary clinical English", () => {
    const trial = study(
      criteria(["NET"], ["Participation in another clinical trial", "Ongoing palliative care"]),
    );

    expect(
      assessPriorTreatments(trial, ["clinical-trials", "supportive-palliative-care", "ablation"])
        .status,
    ).toBe("clear");
  });
});

// ---------------------------------------------------------------------------
// Partitioning
// ---------------------------------------------------------------------------

describe("partitionByPriorTreatment", () => {
  const excluding = study(criteria(["NET"], ["Prior treatment with everolimus"]), {
    nctId: "NCT00000001",
  });
  const conditional = study(criteria(["NET"], ["Everolimus within 4 weeks"]), {
    nctId: "NCT00000002",
  });
  const unrelated = study(criteria(["NET"], ["Pregnancy"]), { nctId: "NCT00000003" });

  it("hides only the unconditional exclusion", () => {
    const { visible, hidden } = partitionByPriorTreatment(
      [excluding, conditional, unrelated],
      EVEROLIMUS,
    );

    expect(hidden.map((t) => t.nctId)).toEqual(["NCT00000001"]);
    expect(visible.map((t) => t.nctId)).toEqual(["NCT00000002", "NCT00000003"]);
  });

  it("attaches the assessment to every trial, hidden or visible", () => {
    const { visible, hidden } = partitionByPriorTreatment(
      [excluding, conditional, unrelated],
      EVEROLIMUS,
    );

    expect(hidden[0].priorTreatment?.status).toBe("excluded");
    expect(visible[0].priorTreatment?.status).toBe("timing-unclear");
    expect(visible[1].priorTreatment?.status).toBe("clear");
  });

  it("hides nothing when no treatments were entered", () => {
    const { visible, hidden } = partitionByPriorTreatment([excluding, conditional], []);

    expect(hidden).toHaveLength(0);
    expect(visible).toHaveLength(2);
  });

  it("leaves the input untouched", () => {
    partitionByPriorTreatment([excluding], EVEROLIMUS);
    expect(excluding.priorTreatment).toBeUndefined();
  });
});
