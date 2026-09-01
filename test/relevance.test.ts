import { describe, expect, it } from "vitest";
import { findCancer, type CancerEntry } from "@/lib/catalog/cancers";
import { filterByCancer, matchesCancer, matchesFreeText } from "@/lib/ctgov/relevance";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Disease relevance.
 *
 * The two rules under test are the ones that were previously wrong:
 * each published condition is judged on its own, and a curated conflict list
 * stops a negated subtype ("non-small cell") satisfying its parent ("small
 * cell") despite containing every one of its words.
 *
 * Condition strings below are the wording ClinicalTrials.gov actually
 * publishes. All NCT ids and study details remain fictional.
 */

const base = normalizeStudy(rawStudyFixture) as Trial;
const study = (conditions: string[]): Trial => ({ ...base, conditions });

const cancer = (id: string): CancerEntry => {
  const found = findCancer(id);
  if (!found) throw new Error(`no catalogue entry: ${id}`);
  return found;
};

const matches = (conditions: string[], cancerId: string) =>
  matchesCancer(study(conditions), cancer(cancerId)).matched;

// --------------------------------------------------------------------------

describe("acute versus chronic leukaemia", () => {
  it("does not let CML satisfy AML", () => {
    expect(matches(["Chronic Myeloid Leukemia"], "acute-myeloid-leukemia")).toBe(false);
    expect(matches(["Chronic Myelogenous Leukemia"], "acute-myeloid-leukemia")).toBe(false);
  });

  it("does not let AML satisfy CML", () => {
    expect(matches(["Acute Myeloid Leukemia"], "chronic-myeloid-leukemia")).toBe(false);
  });

  it("still matches each to itself, including the abbreviation", () => {
    expect(matches(["Acute Myeloid Leukemia"], "acute-myeloid-leukemia")).toBe(true);
    expect(matches(["AML"], "acute-myeloid-leukemia")).toBe(true);
    expect(matches(["Chronic Myeloid Leukemia"], "chronic-myeloid-leukemia")).toBe(true);
    expect(matches(["CML"], "chronic-myeloid-leukemia")).toBe(true);
  });

  it("does not confuse ALL with CLL", () => {
    expect(matches(["Chronic Lymphocytic Leukemia"], "acute-lymphoblastic-leukemia")).toBe(false);
    expect(
      matches(["Acute Lymphoblastic Leukemia"], "chronic-lymphocytic-leukemia-small-lymphocytic-lymphoma"),
    ).toBe(false);
  });

  it("accepts SLL for the CLL/SLL entry", () => {
    expect(
      matches(["Small Lymphocytic Lymphoma"], "chronic-lymphocytic-leukemia-small-lymphocytic-lymphoma"),
    ).toBe(true);
  });
});

describe("small cell versus non-small cell lung cancer", () => {
  // The previous matcher accepted these because "non-small cell lung cancer"
  // contains every token of "small cell lung cancer".
  it.each([
    ["Non-Small Cell Lung Cancer"],
    ["Non Small Cell Lung Cancer"],
    ["NSCLC"],
    ["Nonsmall Cell Lung Cancer"],
  ])("rejects %s for a small-cell search", (condition) => {
    expect(matches([condition], "small-cell-lung-cancer")).toBe(false);
  });

  it("reports it as a conflicting subtype, not merely a different disease", () => {
    const result = matchesCancer(study(["Non-Small Cell Lung Cancer"]), cancer("small-cell-lung-cancer"));
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("conflicting-subtype");
  });

  it("still matches genuine small-cell studies", () => {
    expect(matches(["Small Cell Lung Cancer"], "small-cell-lung-cancer")).toBe(true);
    expect(matches(["SCLC"], "small-cell-lung-cancer")).toBe(true);
    expect(matches(["Small Cell Lung Carcinoma"], "small-cell-lung-cancer")).toBe(true);
  });

  it("matches NSCLC studies to the NSCLC entry", () => {
    expect(matches(["Non-Small Cell Lung Cancer"], "non-small-cell-lung-cancer")).toBe(true);
    expect(matches(["NSCLC"], "non-small-cell-lung-cancer")).toBe(true);
  });

  it("keeps a basket trial that genuinely lists both", () => {
    // Listing SCLC alongside NSCLC is a real basket study and does qualify.
    expect(matches(["Non-Small Cell Lung Cancer", "Small Cell Lung Cancer"], "small-cell-lung-cancer")).toBe(
      true,
    );
  });
});

describe("cutaneous versus uveal melanoma", () => {
  it("does not let uveal satisfy cutaneous", () => {
    expect(matches(["Metastatic Uveal Melanoma"], "melanoma-cutaneous")).toBe(false);
    expect(matches(["Choroidal Melanoma"], "melanoma-cutaneous")).toBe(false);
  });

  it("does not let cutaneous satisfy uveal", () => {
    expect(matches(["Cutaneous Melanoma"], "melanoma-uveal")).toBe(false);
  });

  it("matches each to itself", () => {
    expect(matches(["Cutaneous Melanoma"], "melanoma-cutaneous")).toBe(true);
    expect(matches(["Uveal Melanoma"], "melanoma-uveal")).toBe(true);
  });
});

describe("neuroendocrine terminology", () => {
  it.each([
    ["Neuroendocrine Tumors"],
    ["Neuroendocrine Tumours"],
    ["Neuroendocrine Tumor"],
    ["Neuroendocrine Neoplasms"],
    ["Carcinoid Tumor"],
    ["Pancreatic Neuroendocrine Tumor"],
    ["Well-Differentiated Neuroendocrine Carcinoma"],
  ])("accepts %s", (condition) => {
    expect(matches([condition], "neuroendocrine-and-adrenal-tumors")).toBe(true);
  });

  it("folds tumour and tumor spelling in both directions", () => {
    expect(matches(["Neuroendocrine Tumour"], "neuroendocrine-and-adrenal-tumors")).toBe(true);
    expect(matches(["Solid Tumours"], "neuroendocrine-and-adrenal-tumors")).toBe(false);
  });

  it("does not match unrelated adrenal disease", () => {
    // The workbook groups neuroendocrine with adrenal; the query must not.
    expect(matches(["Adrenocortical Carcinoma"], "neuroendocrine-and-adrenal-tumors")).toBe(false);
    expect(matches(["Pheochromocytoma"], "neuroendocrine-and-adrenal-tumors")).toBe(false);
  });

  it("rejects an unrelated cancer", () => {
    expect(matches(["Metastatic Uveal Melanoma"], "neuroendocrine-and-adrenal-tumors")).toBe(false);
    expect(matches(["Breast Cancer"], "neuroendocrine-and-adrenal-tumors")).toBe(false);
  });
});

describe("breast cancer", () => {
  it("accepts plain and metastatic wording alike", () => {
    expect(matches(["Breast Cancer"], "breast-cancer")).toBe(true);
    expect(matches(["Metastatic Breast Cancer"], "breast-cancer")).toBe(true);
    expect(matches(["Breast Carcinoma"], "breast-cancer")).toBe(true);
  });

  it("rejects a different organ", () => {
    expect(matches(["Lung Cancer"], "breast-cancer")).toBe(false);
  });
});

describe("each condition is judged on its own", () => {
  it("does not combine tokens from unrelated conditions into a false match", () => {
    // Neither condition alone is small-cell lung cancer. Concatenating them
    // would previously have supplied every required token.
    const conditions = ["Small Cell Carcinoma of the Bladder", "Lung Adenocarcinoma"];
    expect(matches(conditions, "small-cell-lung-cancer")).toBe(false);
  });

  it("qualifies on the strength of a single matching condition", () => {
    const result = matchesCancer(
      study(["Obesity", "Neuroendocrine Tumors", "Hospital Readmission"]),
      cancer("neuroendocrine-and-adrenal-tumors"),
    );
    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("Neuroendocrine Tumors");
  });

  it("reports which condition satisfied the match", () => {
    const result = matchesCancer(study(["Small Cell Lung Cancer"]), cancer("small-cell-lung-cancer"));
    expect(result.matchedOn).toBe("Small Cell Lung Cancer");
  });
});

describe("failing safe", () => {
  it("keeps a study that publishes no condition list", () => {
    const result = matchesCancer(study([]), cancer("breast-cancer"));
    expect(result.matched).toBe(true);
    expect(result.reason).toBe("no-conditions-published");
  });

  it("keeps everything when no cancer was selected", () => {
    expect(matchesCancer(base, null).matched).toBe(true);
  });

  it("does not throw on odd condition wording", () => {
    for (const condition of ["!!!", "", "   ", "a", "-".repeat(200)]) {
      expect(() => matchesCancer(study([condition]), cancer("breast-cancer"))).not.toThrow();
    }
  });
});

describe("free-text fallback", () => {
  it("matches per condition, like the catalogue path", () => {
    expect(matchesFreeText(study(["Type 2 Diabetes"]), "type 2 diabetes").matched).toBe(true);
    expect(matchesFreeText(study(["Type 1 Diabetes"]), "type 2 diabetes").matched).toBe(false);
  });

  it("keeps everything when the text is empty", () => {
    expect(matchesFreeText(study(["Anything"]), "").matched).toBe(true);
  });
});

describe("filterByCancer", () => {
  it("removes wrong-disease studies and counts them", () => {
    const trials = [
      study(["Small Cell Lung Cancer"]),
      study(["Non-Small Cell Lung Cancer"]),
      study(["Breast Cancer"]),
      study(["SCLC", "Brain Metastases"]),
    ];
    const { kept, removed } = filterByCancer(trials, cancer("small-cell-lung-cancer"));
    expect(kept).toHaveLength(2);
    expect(removed).toBe(2);
  });

  it("uses the free-text path when no cancer is selected", () => {
    const trials = [study(["Type 2 Diabetes"]), study(["Type 1 Diabetes"])];
    expect(filterByCancer(trials, null, "type 2 diabetes").removed).toBe(1);
  });

  it("handles an empty result set", () => {
    expect(filterByCancer([], cancer("breast-cancer"))).toEqual({ kept: [], removed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Registry vocabulary
// ---------------------------------------------------------------------------

/**
 * The wordings below are the ones ClinicalTrials.gov actually publishes, taken
 * from a live search that this app got wrong. MeSH headings are inverted
 * ("Carcinoma, Non-Small-Cell Lung"), and sponsors use "cancer", "carcinoma",
 * "neoplasm" and "tumor" interchangeably for the same disease.
 */
describe("inverted MeSH headings", () => {
  const invertedNsclc = [
    "Carcinoma, Non-Small-Cell Lung",
    "Lung Non-Small Cell Carcinoma",
    "Lung Cancer, Non-Small Cell",
    "Carcinoma, Non Small Cell Lung",
  ];

  for (const condition of invertedNsclc) {
    it(`does not let "${condition}" satisfy small cell lung cancer`, () => {
      // Live regression: four of twenty-six results for SCLC were exclusively
      // NSCLC, because the conflict list required the registry to use the
      // conflict's own word order.
      expect(matches([condition], "small-cell-lung-cancer")).toBe(false);
    });
  }

  it("still accepts genuine small cell lung cancer however it is written", () => {
    for (const condition of [
      "Small Cell Lung Cancer",
      "Small Cell Lung Carcinoma",
      "Carcinoma, Small Cell Lung",
      "Lung Neoplasms, Small Cell",
      "SCLC",
    ]) {
      expect(matches([condition], "small-cell-lung-cancer")).toBe(true);
    }
  });

  it("catches an inverted chronic leukaemia heading in an acute search", () => {
    expect(matches(["Leukemia, Myeloid, Chronic"], "acute-myeloid-leukemia")).toBe(false);
    expect(matches(["Leukemia, Myeloid, Acute"], "acute-myeloid-leukemia")).toBe(true);
  });

  it("keeps a basket trial that lists both subtypes", () => {
    // One matching condition is enough; a study of both is a real option.
    expect(
      matches(["Carcinoma, Non-Small-Cell Lung", "Small Cell Lung Carcinoma"], "small-cell-lung-cancer"),
    ).toBe(true);
  });
});

describe("interchangeable words for a malignancy", () => {
  it("treats cancer, carcinoma, neoplasm and tumor as the same word", () => {
    expect(matches(["Breast Carcinoma"], "breast-cancer")).toBe(true);
    expect(matches(["Breast Neoplasms"], "breast-cancer")).toBe(true);
    expect(matches(["Malignant Neoplasm of Breast"], "breast-cancer")).toBe(true);
    expect(matches(["Neuroendocrine Neoplasms"], "neuroendocrine-and-adrenal-tumors")).toBe(true);
  });

  it("does not fold specific histologies into each other", () => {
    // "Melanoma" and "Sarcoma" are diseases, not synonyms for "cancer".
    expect(matches(["Sarcoma"], "melanoma-cutaneous")).toBe(false);
    expect(matches(["Breast Sarcoma"], "breast-cancer")).toBe(false);
  });

  it("does not let the shared word alone create a match", () => {
    expect(matches(["Lung Carcinoma"], "breast-cancer")).toBe(false);
    expect(matches(["Cancer"], "breast-cancer")).toBe(false);
  });
});
