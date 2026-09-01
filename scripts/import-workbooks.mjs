/**
 * Generates the typed catalogues in `src/lib/catalog/` from the two supplied
 * workbooks.
 *
 * The deployed application never reads XLSX at runtime — this script runs by
 * hand and commits its output, so the data is reviewable in the diff and the
 * app carries no spreadsheet dependency.
 *
 *   node scripts/import-workbooks.mjs <cancer.xlsx> <net-treatments.xlsx>
 *
 * Verified against:
 *   Cancer Type Drop Down.xlsx    e92d6fdb1ad150ff3d887cdd4aff972556c8164f874a62d40cf762e3fa182b2d
 *   NET_treatment_options_1.xlsx  d1efde064809a8a5b0fd9e61ac84b4d8b8f6b990d1064905faab858efceb2712
 *
 * Nothing is invented. Blank cells in the workbook stay blank; brand names are
 * never filled in from memory or research.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal XLSX reader
// ---------------------------------------------------------------------------

function readZip(buf) {
  const files = {};
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  for (let n = 0; n < count; n++) {
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

/**
 * Matches both `<c ...>...</c>` and the self-closing `<c ... />` form used for
 * empty cells. Missing the self-closing form silently shifts every later value
 * in the row into the wrong column.
 */
const CELL_PATTERN = /<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function sheetRows(xml, sharedStrings) {
  const rows = [];
  for (const row of xml.toString("utf8").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cell of row[1].matchAll(CELL_PATTERN)) {
      const [, column, attrs = "", body = ""] = cell;
      const isShared = /\bt="s"/.test(attrs);
      const value = body.match(/<v>([\s\S]*?)<\/v>/);
      const inline = body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
      let text = inline ? unescapeXml(inline[1]) : value ? unescapeXml(value[1]) : "";
      if (isShared && value) text = sharedStrings[Number(value[1])] ?? "";
      cells[column] = text.trim();
    }
    rows.push(cells);
  }
  return rows;
}

function loadSheet(file) {
  const buf = fs.readFileSync(file);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const zip = readZip(buf);
  const sharedStrings = [
    ...(zip["xl/sharedStrings.xml"]?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(""));
  return { rows: sheetRows(zip["xl/worksheets/sheet1.xml"], sharedStrings), sha };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const quote = (s) => JSON.stringify(s);
const list = (arr) => `[${arr.map(quote).join(", ")}]`;

// ---------------------------------------------------------------------------
// Cancer catalogue
// ---------------------------------------------------------------------------

/**
 * Hand-curated data for the entries where a wrong match is clinically
 * dangerous, or where the workbook label is not a good ClinicalTrials.gov
 * query. Everything else falls back to the workbook label.
 *
 * `query`      what we send as query.cond
 * `aliases`    accepted alternative wordings, for search and for matching a
 *              study's published condition strings
 * `conflicts`  wordings that must NEVER satisfy this entry, even though they
 *              contain its words (the non-small-cell / small-cell trap)
 * `display`    overrides the workbook label in the interface
 */
const CANCER_OVERRIDES = {
  "neuroendocrine-and-adrenal-tumors": {
    display: "Neuroendocrine Tumors (NET)",
    query: "neuroendocrine tumor",
    aliases: [
      "neuroendocrine tumor",
      "neuroendocrine tumors",
      "neuroendocrine tumour",
      "neuroendocrine tumours",
      "neuroendocrine neoplasm",
      "neuroendocrine neoplasms",
      "neuroendocrine carcinoma",
      "NET",
      "GEP-NET",
      "carcinoid",
      "carcinoid tumor",
      "pancreatic neuroendocrine tumor",
      "pNET",
    ],
    // The workbook groups neuroendocrine with adrenal under one NCCN chapter.
    // Broadening the query to adrenal tumours would make it clinically wrong.
    conflicts: ["adrenocortical carcinoma", "pheochromocytoma"],
    sourceCategory: "Neuroendocrine and Adrenal Tumors",
  },
  "small-cell-lung-cancer": {
    query: "small cell lung cancer",
    aliases: ["small cell lung cancer", "small cell lung carcinoma", "SCLC", "small-cell lung cancer"],
    conflicts: ["non-small cell lung cancer", "non small cell lung cancer", "NSCLC", "nonsmall cell lung cancer"],
  },
  "non-small-cell-lung-cancer": {
    query: "non small cell lung cancer",
    aliases: [
      "non small cell lung cancer",
      "non-small cell lung cancer",
      "non-small-cell lung cancer",
      "NSCLC",
      "nonsmall cell lung cancer",
    ],
  },
  "acute-myeloid-leukemia": {
    query: "acute myeloid leukemia",
    aliases: ["acute myeloid leukemia", "acute myeloid leukaemia", "acute myelogenous leukemia", "AML"],
    conflicts: ["chronic myeloid leukemia", "chronic myelogenous leukemia", "CML"],
  },
  "chronic-myeloid-leukemia": {
    query: "chronic myeloid leukemia",
    aliases: ["chronic myeloid leukemia", "chronic myeloid leukaemia", "chronic myelogenous leukemia", "CML"],
    conflicts: ["acute myeloid leukemia", "acute myelogenous leukemia", "AML"],
  },
  "acute-lymphoblastic-leukemia": {
    query: "acute lymphoblastic leukemia",
    aliases: [
      "acute lymphoblastic leukemia",
      "acute lymphoblastic leukaemia",
      "acute lymphocytic leukemia",
      "ALL",
    ],
    conflicts: ["chronic lymphocytic leukemia", "CLL", "small lymphocytic lymphoma"],
  },
  "chronic-lymphocytic-leukemia-small-lymphocytic-lymphoma": {
    display: "Chronic Lymphocytic Leukemia / Small Lymphocytic Lymphoma",
    query: "chronic lymphocytic leukemia",
    aliases: [
      "chronic lymphocytic leukemia",
      "chronic lymphocytic leukaemia",
      "small lymphocytic lymphoma",
      "CLL",
      "SLL",
    ],
    conflicts: ["acute lymphoblastic leukemia", "acute lymphocytic leukemia"],
  },
  "melanoma-cutaneous": {
    display: "Melanoma: Cutaneous",
    query: "cutaneous melanoma",
    aliases: ["cutaneous melanoma", "skin melanoma", "melanoma of the skin", "malignant melanoma"],
    conflicts: ["uveal melanoma", "ocular melanoma", "choroidal melanoma", "mucosal melanoma"],
  },
  "melanoma-uveal": {
    display: "Melanoma: Uveal",
    query: "uveal melanoma",
    aliases: ["uveal melanoma", "ocular melanoma", "choroidal melanoma", "intraocular melanoma"],
    conflicts: ["cutaneous melanoma", "skin melanoma"],
  },
  "breast-cancer": {
    query: "breast cancer",
    aliases: ["breast cancer", "breast carcinoma", "breast neoplasm", "carcinoma of the breast"],
  },
};

function buildCancers(rows) {
  const entries = [];
  const seen = new Set();

  for (const row of rows) {
    const label = (row.A ?? "").trim();
    if (!label || label.toLowerCase() === "cancer type") continue;

    const id = slug(label);
    if (seen.has(id)) throw new Error(`duplicate cancer id: ${id}`);
    seen.add(id);

    const o = CANCER_OVERRIDES[id] ?? {};
    entries.push({
      id,
      label: o.display ?? label,
      sourceLabel: label,
      query: o.query ?? label.replace(/\s*\/\s*/g, " ").replace(/:\s*/g, " ").trim(),
      aliases: o.aliases ?? [],
      conflicts: o.conflicts ?? [],
      sourceCategory: o.sourceCategory ?? null,
    });
  }
  return entries;
}

function renderCancers(entries, sha) {
  const body = entries
    .map(
      (e) => `  {
    id: ${quote(e.id)},
    label: ${quote(e.label)},
    sourceLabel: ${quote(e.sourceLabel)},
    query: ${quote(e.query)},
    aliases: ${list(e.aliases)},
    conflicts: ${list(e.conflicts)},${e.sourceCategory ? `\n    sourceCategory: ${quote(e.sourceCategory)},` : ""}
  },`,
    )
    .join("\n");

  return `/**
 * Cancer catalogue — GENERATED, do not edit by hand.
 *
 * Source: "Cancer Type Drop Down.xlsx" supplied for the challenge demonstration.
 * SHA-256: ${sha}
 * Regenerate: node scripts/import-workbooks.mjs <cancer.xlsx> <net.xlsx>
 *
 * This is the supplied demonstration catalogue, NOT an exhaustive or medically
 * validated ontology of every cancer subtype. Entries carry curated aliases and
 * conflicts only where a wrong match would be clinically dangerous; the rest
 * fall back to their workbook label.
 */

export interface CancerEntry {
  /** Stable slug used in storage, the API and WebMCP. */
  id: string;
  /** What the person sees. */
  label: string;
  /** The workbook's original wording, preserved for provenance. */
  sourceLabel: string;
  /** Sent to ClinicalTrials.gov as query.cond. */
  query: string;
  /** Accepted alternative wordings, for search and condition matching. */
  aliases: string[];
  /**
   * Wordings that must never satisfy this entry even though they contain its
   * words — "non-small cell lung cancer" must not match "small cell lung cancer".
   */
  conflicts: string[];
  /** Set where the display label narrows a broader workbook category. */
  sourceCategory?: string;
}

export const CANCERS: readonly CancerEntry[] = [
${body}
] as const;

/** The demonstration's primary cancer, used by the NET treatment selector. */
export const NET_CANCER_ID = "neuroendocrine-and-adrenal-tumors";

export function findCancer(id: string): CancerEntry | undefined {
  return CANCERS.find((c) => c.id === id);
}
`;
}

// ---------------------------------------------------------------------------
// NET treatment catalogue
// ---------------------------------------------------------------------------

/**
 * Normalises a mechanism string into a stable family key so that several drugs
 * can share one mechanism, and so exclusion criteria can be matched against the
 * family rather than the exact wording.
 */
function mechanismKey(mechanism) {
  return slug(mechanism.replace(/\(.*?\)/g, "").trim());
}

function buildTreatments(rows) {
  const entries = [];
  const seen = new Set();

  for (const row of rows) {
    const name = (row.A ?? "").trim();
    if (!name || name.toLowerCase().startsWith("treatment /")) continue;

    const id = slug(name);
    if (seen.has(id)) throw new Error(`duplicate treatment id: ${id}`);
    seen.add(id);

    // A single cell can hold several brands ("Sandostatin, Bynfezia Pen").
    const brands = (row.B ?? "")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);

    const mechanism = (row.D ?? "").trim();

    entries.push({
      id,
      name,
      brands,
      category: (row.C ?? "").trim(),
      mechanism,
      mechanismKey: mechanism ? mechanismKey(mechanism) : "",
      notes: (row.E ?? "").trim(),
    });
  }
  return entries;
}

function renderTreatments(entries, sha) {
  const body = entries
    .map(
      (t) => `  {
    id: ${quote(t.id)},
    name: ${quote(t.name)},
    brands: ${list(t.brands)},
    category: ${quote(t.category)},
    mechanism: ${quote(t.mechanism)},
    mechanismKey: ${quote(t.mechanismKey)},
    notes: ${quote(t.notes)},
  },`,
    )
    .join("\n");

  return `/**
 * NET treatment catalogue — GENERATED, do not edit by hand.
 *
 * Source: "NET_treatment_options_1.xlsx" supplied for the challenge
 * demonstration, drawn from NCCN Guidelines for Patients: Neuroendocrine
 * Tumors, 2026 edition.
 * SHA-256: ${sha}
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
${body}
] as const;

export function findTreatment(id: string): NetTreatment | undefined {
  return NET_TREATMENTS.find((t) => t.id === id);
}

/** Every term that should find this treatment in the selector. */
export function treatmentSearchTerms(t: NetTreatment): string[] {
  return [t.name, ...t.brands, t.mechanism].filter(Boolean);
}
`;
}

// ---------------------------------------------------------------------------

const [cancerFile, netFile] = process.argv.slice(2);
if (!cancerFile || !netFile) {
  console.error("usage: node scripts/import-workbooks.mjs <cancer.xlsx> <net.xlsx>");
  process.exit(1);
}

const cancer = loadSheet(cancerFile);
const net = loadSheet(netFile);

const cancers = buildCancers(cancer.rows);
const treatments = buildTreatments(net.rows);

const outDir = path.join(process.cwd(), "src", "lib", "catalog");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "cancers.ts"), renderCancers(cancers, cancer.sha));
fs.writeFileSync(path.join(outDir, "net-treatments.ts"), renderTreatments(treatments, net.sha));

console.log(`cancers.ts        ${cancers.length} entries   sha ${cancer.sha.slice(0, 16)}…`);
console.log(`net-treatments.ts ${treatments.length} entries   sha ${net.sha.slice(0, 16)}…`);
console.log(`brands present    ${treatments.filter((t) => t.brands.length).length}`);
console.log(`brands blank      ${treatments.filter((t) => !t.brands.length).length}  (left blank, as supplied)`);
console.log(`mechanisms        ${new Set(treatments.map((t) => t.mechanismKey).filter(Boolean)).size} distinct`);
