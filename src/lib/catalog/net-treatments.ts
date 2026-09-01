/**
 * NET treatment catalogue — GENERATED, do not edit by hand.
 *
 * Source: "NET_treatment_options_1.xlsx" supplied for the challenge
 * demonstration, drawn from NCCN Guidelines for Patients: Neuroendocrine
 * Tumors, 2026 edition.
 * SHA-256: d1efde064809a8a5b0fd9e61ac84b4d8b8f6b990d1064905faab858efceb2712
 * Regenerate: node scripts/import-workbooks.mjs <cancer.xlsx> <net.xlsx>
 *
 * Provisional demonstration catalogue. Not every treatment applies to every NET
 * type, primary site or patient — see the source guide. Brand names are blank
 * wherever the workbook left them blank; none have been supplied from memory or
 * research.
 *
 * Mechanism (column D) is what exclusion matching may use. Category (column C)
 * holds broad classes such as "Chemotherapy" or "Targeted therapy" and must
 * NEVER be used to hide a trial.
 */

export interface NetTreatment {
  /** Stable slug used in storage, the API and WebMCP. */
  id: string;
  /** Generic or procedure name, as supplied. */
  name: string;
  /** Zero or more brand names. Empty where the workbook supplied none. */
  brands: string[];
  /** Broad class. Display and grouping only — never used to hide a trial. */
  category: string;
  /** Specific mechanism, e.g. "mTOR inhibitor". May be used for exclusions. */
  mechanism: string;
  /** Normalised mechanism, so drugs sharing a mechanism compare equal. */
  mechanismKey: string;
  notes: string;
}

export const NET_TREATMENTS: readonly NetTreatment[] = [
  {
    id: "endoscopic-resection",
    name: "Endoscopic resection",
    brands: [],
    category: "Surgery",
    mechanism: "Surgical / procedural",
    mechanismKey: "surgical-procedural",
    notes: "Main treatment for early-stage NETs in stomach, duodenum, rectum",
  },
  {
    id: "open-surgery",
    name: "Open surgery",
    brands: [],
    category: "Surgery",
    mechanism: "Surgical / procedural",
    mechanismKey: "surgical-procedural",
    notes: "One large incision; used when nodes/organs may be involved",
  },
  {
    id: "minimally-invasive-surgery",
    name: "Minimally invasive surgery",
    brands: [],
    category: "Surgery",
    mechanism: "Surgical / procedural",
    mechanismKey: "surgical-procedural",
    notes: "Laparoscopic/robotic; several small incisions",
  },
  {
    id: "carboplatin",
    name: "Carboplatin",
    brands: ["Kyxata"],
    category: "Chemotherapy",
    mechanism: "Platinum-based alkylating agent",
    mechanismKey: "platinum-based-alkylating-agent",
    notes: "",
  },
  {
    id: "cisplatin",
    name: "Cisplatin",
    brands: [],
    category: "Chemotherapy",
    mechanism: "Platinum-based alkylating agent",
    mechanismKey: "platinum-based-alkylating-agent",
    notes: "",
  },
  {
    id: "oxaliplatin",
    name: "Oxaliplatin",
    brands: [],
    category: "Chemotherapy",
    mechanism: "Platinum-based alkylating agent",
    mechanismKey: "platinum-based-alkylating-agent",
    notes: "Component of CAPEOX, FOLFOX, FOLFIRINOX",
  },
  {
    id: "dacarbazine",
    name: "Dacarbazine",
    brands: [],
    category: "Chemotherapy",
    mechanism: "Alkylating agent",
    mechanismKey: "alkylating-agent",
    notes: "",
  },
  {
    id: "etoposide",
    name: "Etoposide",
    brands: ["Etopophos"],
    category: "Chemotherapy",
    mechanism: "Topoisomerase II inhibitor",
    mechanismKey: "topoisomerase-ii-inhibitor",
    notes: "",
  },
  {
    id: "irinotecan",
    name: "Irinotecan",
    brands: ["Camptosar"],
    category: "Chemotherapy",
    mechanism: "Topoisomerase I inhibitor",
    mechanismKey: "topoisomerase-i-inhibitor",
    notes: "Component of FOLFIRI, FOLFIRINOX",
  },
  {
    id: "capecitabine",
    name: "Capecitabine",
    brands: ["Xeloda"],
    category: "Chemotherapy",
    mechanism: "Antimetabolite (fluoropyrimidine)",
    mechanismKey: "antimetabolite",
    notes: "Oral prodrug of fluorouracil; component of CAPEOX",
  },
  {
    id: "fluorouracil-5-fu",
    name: "Fluorouracil (5-FU)",
    brands: [],
    category: "Chemotherapy",
    mechanism: "Antimetabolite (fluoropyrimidine)",
    mechanismKey: "antimetabolite",
    notes: "Component of FOLFIRI, FOLFOX, FOLFIRINOX",
  },
  {
    id: "leucovorin-calcium",
    name: "Leucovorin calcium",
    brands: [],
    category: "Chemotherapy adjunct",
    mechanism: "Folate analog / biomodulator",
    mechanismKey: "folate-analog-biomodulator",
    notes: "Not cytotoxic itself; enhances 5-FU activity",
  },
  {
    id: "capeox",
    name: "CAPEOX",
    brands: [],
    category: "Chemotherapy regimen",
    mechanism: "Combination: capecitabine + oxaliplatin",
    mechanismKey: "combination-capecitabine-oxaliplatin",
    notes: "",
  },
  {
    id: "folfiri",
    name: "FOLFIRI",
    brands: [],
    category: "Chemotherapy regimen",
    mechanism: "Combination: fluorouracil + leucovorin + irinotecan",
    mechanismKey: "combination-fluorouracil-leucovorin-irinotecan",
    notes: "",
  },
  {
    id: "folfox",
    name: "FOLFOX",
    brands: [],
    category: "Chemotherapy regimen",
    mechanism: "Combination: fluorouracil + leucovorin + oxaliplatin",
    mechanismKey: "combination-fluorouracil-leucovorin-oxaliplatin",
    notes: "",
  },
  {
    id: "folfirinox",
    name: "FOLFIRINOX",
    brands: [],
    category: "Chemotherapy regimen",
    mechanism: "Combination: fluorouracil + leucovorin + irinotecan + oxaliplatin",
    mechanismKey: "combination-fluorouracil-leucovorin-irinotecan-oxaliplatin",
    notes: "",
  },
  {
    id: "cabozantinib",
    name: "Cabozantinib",
    brands: ["Cabometyx"],
    category: "Targeted therapy",
    mechanism: "Multi-kinase inhibitor (VEGFR2, MET, RET, AXL)",
    mechanismKey: "multi-kinase-inhibitor",
    notes: "",
  },
  {
    id: "dabrafenib",
    name: "Dabrafenib",
    brands: ["Tafinlar"],
    category: "Targeted therapy",
    mechanism: "BRAF inhibitor",
    mechanismKey: "braf-inhibitor",
    notes: "",
  },
  {
    id: "entrectinib",
    name: "Entrectinib",
    brands: ["Rozlytrek"],
    category: "Targeted therapy",
    mechanism: "TRK / ROS1 / ALK inhibitor",
    mechanismKey: "trk-ros1-alk-inhibitor",
    notes: "For NTRK/ROS1 fusion-positive tumors",
  },
  {
    id: "everolimus",
    name: "Everolimus",
    brands: ["Afinitor"],
    category: "Targeted therapy",
    mechanism: "mTOR inhibitor",
    mechanismKey: "mtor-inhibitor",
    notes: "",
  },
  {
    id: "larotrectinib",
    name: "Larotrectinib",
    brands: ["Vitrakvi"],
    category: "Targeted therapy",
    mechanism: "TRK inhibitor",
    mechanismKey: "trk-inhibitor",
    notes: "For NTRK fusion-positive tumors",
  },
  {
    id: "repotrectinib",
    name: "Repotrectinib",
    brands: ["Augtyro"],
    category: "Targeted therapy",
    mechanism: "ROS1 / TRK inhibitor (next-generation)",
    mechanismKey: "ros1-trk-inhibitor",
    notes: "",
  },
  {
    id: "selpercatinib",
    name: "Selpercatinib",
    brands: ["Retevmo"],
    category: "Targeted therapy",
    mechanism: "RET inhibitor",
    mechanismKey: "ret-inhibitor",
    notes: "",
  },
  {
    id: "sunitinib",
    name: "Sunitinib",
    brands: ["Sutent"],
    category: "Targeted therapy",
    mechanism: "Multi-kinase inhibitor (VEGFR, PDGFR, KIT)",
    mechanismKey: "multi-kinase-inhibitor",
    notes: "",
  },
  {
    id: "trametinib",
    name: "Trametinib",
    brands: ["Mekinist"],
    category: "Targeted therapy",
    mechanism: "MEK inhibitor",
    mechanismKey: "mek-inhibitor",
    notes: "",
  },
  {
    id: "lutetium-lu-177-dotatate",
    name: "Lutetium Lu 177 dotatate",
    brands: ["Lutathera"],
    category: "SSTR-targeted therapy",
    mechanism: "PRRT — radiolabeled somatostatin analog",
    mechanismKey: "prrt-radiolabeled-somatostatin-analog",
    notes: "Peptide receptor radionuclide therapy",
  },
  {
    id: "octreotide-lar",
    name: "Octreotide LAR",
    brands: ["Sandostatin LAR Depot"],
    category: "SSTR-targeted therapy",
    mechanism: "Somatostatin analog (SSA)",
    mechanismKey: "somatostatin-analog",
    notes: "",
  },
  {
    id: "octreotide-acetate",
    name: "Octreotide acetate",
    brands: ["Sandostatin", "Bynfezia Pen"],
    category: "SSTR-targeted therapy",
    mechanism: "Somatostatin analog (SSA)",
    mechanismKey: "somatostatin-analog",
    notes: "",
  },
  {
    id: "lanreotide",
    name: "Lanreotide",
    brands: ["Somatuline Depot"],
    category: "SSTR-targeted therapy",
    mechanism: "Somatostatin analog (SSA)",
    mechanismKey: "somatostatin-analog",
    notes: "",
  },
  {
    id: "pembrolizumab",
    name: "Pembrolizumab",
    brands: ["Keytruda"],
    category: "Immunotherapy",
    mechanism: "PD-1 inhibitor (checkpoint inhibitor)",
    mechanismKey: "pd-1-inhibitor",
    notes: "",
  },
  {
    id: "nivolumab",
    name: "Nivolumab",
    brands: ["Opdivo"],
    category: "Immunotherapy",
    mechanism: "PD-1 inhibitor (checkpoint inhibitor)",
    mechanismKey: "pd-1-inhibitor",
    notes: "",
  },
  {
    id: "ipilimumab",
    name: "Ipilimumab",
    brands: ["Yervoy"],
    category: "Immunotherapy",
    mechanism: "CTLA-4 inhibitor (checkpoint inhibitor)",
    mechanismKey: "ctla-4-inhibitor",
    notes: "",
  },
  {
    id: "external-beam-radiation-therapy-ebrt",
    name: "External beam radiation therapy (EBRT)",
    brands: [],
    category: "Radiation therapy",
    mechanism: "External radiation",
    mechanismKey: "external-radiation",
    notes: "",
  },
  {
    id: "chemoradiation-therapy",
    name: "Chemoradiation therapy",
    brands: [],
    category: "Combined modality",
    mechanism: "Chemotherapy + radiation, concurrent or sequential",
    mechanismKey: "chemotherapy-radiation-concurrent-or-sequential",
    notes: "Typically for poorly differentiated tumors outside the lung",
  },
  {
    id: "ablation",
    name: "Ablation",
    brands: [],
    category: "Local/regional therapy",
    mechanism: "Tumor destruction via cold, heat, radio/microwaves, or chemicals",
    mechanismKey: "tumor-destruction-via-cold-heat-radio-microwaves-or-chemicals",
    notes: "For liver or lung tumors",
  },
  {
    id: "arterially-directed-therapy-embolization",
    name: "Arterially directed therapy (embolization)",
    brands: [],
    category: "Local/regional therapy",
    mechanism: "Intra-arterial delivery of particles/chemo/radioactive beads",
    mechanismKey: "intra-arterial-delivery-of-particles-chemo-radioactive-beads",
    notes: "Blocks tumor blood supply",
  },
  {
    id: "watch-and-wait",
    name: "Watch and wait",
    brands: [],
    category: "Monitoring",
    mechanism: "Observation — no active treatment",
    mechanismKey: "observation-no-active-treatment",
    notes: "For tumors that don't need immediate treatment",
  },
  {
    id: "clinical-trials",
    name: "Clinical trials",
    brands: [],
    category: "Research access",
    mechanism: "Investigational treatment",
    mechanismKey: "investigational-treatment",
    notes: "Phase 1-4; may combine with standard care",
  },
  {
    id: "supportive-palliative-care",
    name: "Supportive / palliative care",
    brands: [],
    category: "Supportive care",
    mechanism: "Symptom & quality-of-life management",
    mechanismKey: "symptom-quality-of-life-management",
    notes: "For everyone with cancer, not only end-of-life",
  },
] as const;

export function findTreatment(id: string): NetTreatment | undefined {
  return NET_TREATMENTS.find((t) => t.id === id);
}

/** Every term that should find this treatment in the selector. */
export function treatmentSearchTerms(t: NetTreatment): string[] {
  return [t.name, ...t.brands, t.mechanism].filter(Boolean);
}
