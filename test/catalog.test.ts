import { describe, expect, it } from "vitest";
import { CANCERS, NET_CANCER_ID, findCancer } from "@/lib/catalog/cancers";
import {
  NET_TREATMENTS,
  findTreatment,
  treatmentSearchTerms,
} from "@/lib/catalog/net-treatments";

/**
 * The supplied demonstration catalogues.
 *
 * These assert that the workbooks were imported faithfully — the right row
 * counts, no invented brand names, and correct data for the entries where a
 * wrong match would be clinically dangerous.
 */

describe("cancer catalogue", () => {
  it("imports all 68 supplied entries", () => {
    expect(CANCERS).toHaveLength(68);
  });

  it("gives every entry a non-empty, unique id", () => {
    const ids = CANCERS.map((c) => c.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a label and a query term", () => {
    for (const c of CANCERS) {
      expect(c.label.length, c.id).toBeGreaterThan(0);
      expect(c.query.length, c.id).toBeGreaterThan(0);
      expect(c.sourceLabel.length, c.id).toBeGreaterThan(0);
    }
  });

  it("preserves the workbook's own wording as sourceLabel", () => {
    expect(CANCERS.find((c) => c.id === "acute-myeloid-leukemia")?.sourceLabel).toBe(
      "Acute Myeloid Leukemia",
    );
    expect(CANCERS.find((c) => c.id === "wilms-tumor-nephroblastoma")?.sourceLabel).toBe(
      "Wilms Tumor (Nephroblastoma)",
    );
  });

  it("keeps the leukaemia pairs mutually exclusive", () => {
    const aml = findCancer("acute-myeloid-leukemia")!;
    const cml = findCancer("chronic-myeloid-leukemia")!;
    expect(aml.conflicts).toContain("chronic myeloid leukemia");
    expect(cml.conflicts).toContain("acute myeloid leukemia");
    expect(aml.aliases).toContain("AML");
    expect(cml.aliases).toContain("CML");
  });

  it("keeps ALL and CLL mutually exclusive", () => {
    const all = findCancer("acute-lymphoblastic-leukemia")!;
    const cll = findCancer("chronic-lymphocytic-leukemia-small-lymphocytic-lymphoma")!;
    expect(all.conflicts).toContain("chronic lymphocytic leukemia");
    expect(cll.conflicts).toContain("acute lymphoblastic leukemia");
    expect(cll.aliases).toContain("small lymphocytic lymphoma");
  });

  it("stops non-small-cell from satisfying small-cell", () => {
    const sclc = findCancer("small-cell-lung-cancer")!;
    expect(sclc.conflicts).toContain("non small cell lung cancer");
    expect(sclc.conflicts).toContain("NSCLC");
    expect(sclc.aliases).toContain("SCLC");
  });

  it("separates cutaneous from uveal melanoma", () => {
    const cutaneous = findCancer("melanoma-cutaneous")!;
    const uveal = findCancer("melanoma-uveal")!;
    expect(cutaneous.conflicts).toContain("uveal melanoma");
    expect(uveal.conflicts).toContain("cutaneous melanoma");
  });

  describe("the NET entry", () => {
    const net = findCancer(NET_CANCER_ID)!;

    it("exists and is displayed as Neuroendocrine Tumors (NET)", () => {
      expect(net).toBeDefined();
      expect(net.label).toBe("Neuroendocrine Tumors (NET)");
    });

    it("does not broaden the query to adrenal tumours", () => {
      // The workbook groups neuroendocrine and adrenal under one NCCN chapter.
      // Searching adrenal disease for a NET patient would be clinically wrong.
      expect(net.query).toBe("neuroendocrine tumor");
      expect(net.query).not.toMatch(/adrenal/i);
      expect(net.conflicts).toContain("adrenocortical carcinoma");
    });

    it("keeps the broader source category for provenance", () => {
      expect(net.sourceCategory).toBe("Neuroendocrine and Adrenal Tumors");
      expect(net.sourceLabel).toBe("Neuroendocrine and Adrenal Tumors");
    });

    it("accepts the spellings and abbreviations people use", () => {
      for (const alias of ["NET", "neuroendocrine tumour", "carcinoid", "pNET"]) {
        expect(net.aliases).toContain(alias);
      }
    });
  });
});

describe("NET treatment catalogue", () => {
  it("imports all 39 supplied rows", () => {
    expect(NET_TREATMENTS).toHaveLength(39);
  });

  it("gives every entry a non-empty, unique id and name", () => {
    const ids = NET_TREATMENTS.map((t) => t.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(NET_TREATMENTS.every((t) => t.name.length > 0)).toBe(true);
  });

  it("leaves blank brands blank rather than inventing them", () => {
    // 19 of the 39 supplied rows have no brand: procedures, regimens and
    // generics. None may be filled in from memory.
    const blank = NET_TREATMENTS.filter((t) => t.brands.length === 0);
    expect(blank).toHaveLength(19);

    for (const name of ["Cisplatin", "Oxaliplatin", "Fluorouracil (5-FU)", "CAPEOX", "FOLFOX"]) {
      const t = NET_TREATMENTS.find((x) => x.name === name)!;
      expect(t, name).toBeDefined();
      expect(t.brands, `${name} must have no invented brand`).toEqual([]);
    }
    // Specifically: brands that exist in the real world but not in the workbook.
    const serialised = JSON.stringify(NET_TREATMENTS);
    for (const invented of ["Platinol", "Eloxatin", "Adrucil", "Wellcovorin"]) {
      expect(serialised, `${invented} was not supplied`).not.toContain(invented);
    }
  });

  it("keeps the categories the workbook supplied", () => {
    const byName = (n: string) => NET_TREATMENTS.find((t) => t.name === n)!;
    expect(byName("Cisplatin").category).toBe("Chemotherapy");
    expect(byName("CAPEOX").category).toBe("Chemotherapy regimen");
    expect(byName("Endoscopic resection").category).toBe("Surgery");
    expect(NET_TREATMENTS.every((t) => t.category.length > 0)).toBe(true);
  });

  it("splits a multi-brand cell into separate aliases", () => {
    const octreotide = findTreatment("octreotide-acetate")!;
    expect(octreotide.brands).toEqual(["Sandostatin", "Bynfezia Pen"]);
  });

  describe("the Everolimus demonstration case", () => {
    const everolimus = findTreatment("everolimus")!;

    it("carries the brand and mechanism the demo depends on", () => {
      expect(everolimus.name).toBe("Everolimus");
      expect(everolimus.brands).toEqual(["Afinitor"]);
      expect(everolimus.mechanism).toBe("mTOR inhibitor");
    });

    it("is findable by generic name, brand and mechanism", () => {
      const terms = treatmentSearchTerms(everolimus).map((t) => t.toLowerCase());
      expect(terms).toContain("everolimus");
      expect(terms).toContain("afinitor");
      expect(terms).toContain("mtor inhibitor");
    });

    it("has a normalised mechanism key that other drugs could share", () => {
      expect(everolimus.mechanismKey).toBe("mtor-inhibitor");
    });
  });

  it("normalises mechanisms into stable keys, ignoring parenthetical detail", () => {
    const pembro = findTreatment("pembrolizumab")!;
    const nivo = findTreatment("nivolumab")!;
    // Both are "PD-1 inhibitor (checkpoint inhibitor)" — same family.
    expect(pembro.mechanismKey).toBe(nivo.mechanismKey);
    expect(pembro.mechanismKey).toBe("pd-1-inhibitor");
  });

  it("keeps broad categories separate from specific mechanisms", () => {
    // Category is display-only; mechanism is what exclusion matching may use.
    const everolimus = findTreatment("everolimus")!;
    expect(everolimus.category).toBe("Targeted therapy");
    expect(everolimus.mechanism).not.toBe(everolimus.category);
  });

  it("preserves the supplied notes", () => {
    expect(findTreatment("oxaliplatin")!.notes).toContain("CAPEOX");
    expect(findTreatment("lutetium-lu-177-dotatate")!.notes).toContain("Peptide receptor");
  });
});
