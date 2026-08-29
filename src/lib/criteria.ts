import type { Trial } from "./ctgov/types";

/**
 * Segmentation of a trial's published eligibility criteria into addressable
 * items.
 *
 * PRODUCT BOUNDARY — this module performs **no clinical interpretation**.
 * It does not read, classify, paraphrase, summarise or judge a criterion. It
 * only decides where one criterion ends and the next begins, so that each can
 * be quoted, referenced by a stable id, and discussed individually.
 *
 * Every returned item carries the registry's own wording. Where the registry's
 * formatting cannot be segmented with confidence, the whole block is returned
 * intact and flagged for manual review — an unsegmented block is always
 * preferable to invented boundaries.
 */

export type CriterionType = "inclusion" | "exclusion" | "unsegmented";

export interface Criterion {
  /**
   * Stable identifier, formatted `<NCT id>:<type>:<ordinal>`.
   *
   * Embedding the NCT id means a criterion reference is self-describing and
   * cannot silently be applied to a different study — `record_prescreening_responses`
   * relies on this to reject cross-trial writes.
   *
   * Ordinals are assigned in document order, so ids are stable for a given
   * retrieved text. If ClinicalTrials.gov republishes the study with different
   * criteria, ids may shift; `retrievedAt` records which version was read.
   */
  criterionId: string;
  type: CriterionType;
  /** The registry's own wording, unmodified. */
  verbatimText: string;
}

export interface ParsedCriteria {
  nctId: string;
  sourceUrl: string;
  retrievedAt: string;
  criteria: Criterion[];
  /**
   * False when the text could not be split with confidence. The caller must
   * then present `criteria` (a single `unsegmented` item) as raw text requiring
   * manual review, and must not describe it as a list of individual criteria.
   */
  segmented: boolean;
  /** Human-readable explanation shown in the UI when `segmented` is false. */
  notice: string | null;
}

/** Beyond this, the text is almost certainly not a criteria list. */
const MAX_CRITERIA = 200;

const INCLUSION_HEADING = /^\s*(?:key\s+)?inclusion\s+criteria\s*:?\s*$/i;
const EXCLUSION_HEADING = /^\s*(?:key\s+)?exclusion\s+criteria\s*:?\s*$/i;

/**
 * A line that starts a new criterion: a bullet, or a number/letter followed by
 * `.` or `)`. Leading indentation is captured so nested items can be attached
 * to their parent rather than becoming orphan fragments.
 */
const ITEM_MARKER = /^(\s*)(?:[-*•‣▪]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/i;

function markerIndent(line: string): number | null {
  const match = line.match(ITEM_MARKER);
  return match ? match[1].length : null;
}

/**
 * Splits one heading-delimited section into criteria.
 *
 * A new criterion begins at each top-level marker. More deeply indented
 * markers, and lines with no marker at all, are appended to the criterion
 * currently being built — this keeps "Cohort 1: …" style sub-clauses attached
 * to the requirement they qualify, instead of stranding them.
 */
function segmentSection(lines: string[]): string[] {
  const indents = lines
    .map(markerIndent)
    .filter((indent): indent is number => indent !== null);

  // No markers anywhere: treat each non-empty line as its own item only if the
  // section is short, otherwise let the caller fall back to unsegmented.
  if (indents.length === 0) {
    const paragraphs = lines.join("\n").split(/\n\s*\n/);
    return paragraphs.map((p) => p.trim()).filter((p) => p.length > 2);
  }

  const topLevel = Math.min(...indents);
  const items: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length) current.push("");
      continue;
    }
    const indent = markerIndent(line);
    const startsNew = indent !== null && indent <= topLevel;

    if (startsNew) {
      if (current.length) items.push(current.join("\n").trim());
      current = [line];
    } else if (current.length) {
      current.push(line);
    } else {
      // Preamble before the first marker (e.g. "Patients must meet all of:").
      current = [line];
    }
  }
  if (current.length) items.push(current.join("\n").trim());

  return items.filter((item) => item.length > 2);
}

/**
 * Parses a trial's eligibility text into addressable criteria.
 *
 * Never throws. Any input that cannot be segmented confidently — empty,
 * heading-less prose, or pathologically long output — yields a single
 * `unsegmented` criterion holding the original block.
 */
export function parseCriteria(trial: Trial): ParsedCriteria {
  const base = {
    nctId: trial.nctId,
    sourceUrl: trial.sourceUrl,
    retrievedAt: trial.retrievedAt,
  };

  const raw = trial.eligibilityCriteria;

  if (!raw || raw.trim().length === 0) {
    return {
      ...base,
      criteria: [],
      segmented: false,
      notice:
        "This study does not publish eligibility criteria in a readable form. Review the full record on ClinicalTrials.gov and ask the study team directly.",
    };
  }

  const unsegmented = (notice: string): ParsedCriteria => ({
    ...base,
    criteria: [
      {
        criterionId: `${trial.nctId}:unsegmented:1`,
        type: "unsegmented",
        verbatimText: raw.trim(),
      },
    ],
    segmented: false,
    notice,
  });

  const lines = raw.split(/\r?\n/);

  // Locate the inclusion/exclusion headings, if the registry used them.
  const inclusionAt = lines.findIndex((l) => INCLUSION_HEADING.test(l));
  const exclusionAt = lines.findIndex((l) => EXCLUSION_HEADING.test(l));

  if (inclusionAt === -1 && exclusionAt === -1) {
    return unsegmented(
      "This study's eligibility text does not separate inclusion and exclusion criteria in a way TrialBridge can split reliably, so it is shown in full and needs manual review.",
    );
  }

  const inclusionLines: string[] = [];
  const exclusionLines: string[] = [];

  // Assign each line to whichever heading most recently preceded it.
  let bucket: "none" | "inclusion" | "exclusion" =
    inclusionAt === 0 || exclusionAt === 0 ? "none" : "none";

  lines.forEach((line, index) => {
    if (index === inclusionAt) {
      bucket = "inclusion";
      return;
    }
    if (index === exclusionAt) {
      bucket = "exclusion";
      return;
    }
    if (bucket === "inclusion") inclusionLines.push(line);
    else if (bucket === "exclusion") exclusionLines.push(line);
    // Text before any heading is preamble and is deliberately not turned into
    // a criterion — inventing one would be fabrication.
  });

  const inclusionItems = segmentSection(inclusionLines);
  const exclusionItems = segmentSection(exclusionLines);

  if (inclusionItems.length === 0 && exclusionItems.length === 0) {
    return unsegmented(
      "Inclusion and exclusion headings were found but no individual criteria could be identified beneath them, so the text is shown in full and needs manual review.",
    );
  }

  if (inclusionItems.length + exclusionItems.length > MAX_CRITERIA) {
    return unsegmented(
      "This study's eligibility text produced an implausible number of separate items, which usually means unusual formatting. It is shown in full and needs manual review.",
    );
  }

  const criteria: Criterion[] = [
    ...inclusionItems.map((text, i) => ({
      criterionId: `${trial.nctId}:inclusion:${i + 1}`,
      type: "inclusion" as const,
      verbatimText: text,
    })),
    ...exclusionItems.map((text, i) => ({
      criterionId: `${trial.nctId}:exclusion:${i + 1}`,
      type: "exclusion" as const,
      verbatimText: text,
    })),
  ];

  return { ...base, criteria, segmented: true, notice: null };
}

/** True when the id is well-formed and belongs to the given study. */
export function criterionBelongsTo(criterionId: string, nctId: string): boolean {
  return criterionId.startsWith(`${nctId}:`);
}
