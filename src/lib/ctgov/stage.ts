import type { CancerStage } from "../schemas";

/**
 * Cancer-stage requirements, read out of a study's published text.
 *
 * ClinicalTrials.gov has no structured stage field, so stage has to be read
 * from the conditions list and the inclusion criteria. Measured across
 * recruiting trials in five cancers, an explicit "Stage I–IV" appears in only
 * about a quarter to a third of studies.
 *
 * Treating "metastatic" as Stage IV — which is how it is staged clinically —
 * roughly doubles that coverage (colorectal goes from 2/20 to 10/20).
 *
 * The matching rule is deliberately **"if available, match"**: a study that
 * states a stage must agree with the person's stage, and a study that states
 * nothing is kept. Requiring a stage outright would hide roughly half of all
 * recruiting trials, and a hidden trial is one the person never learns exists.
 */

export type StageSource = "stated" | "metastatic" | "none";

export interface StageRequirement {
  /** Stages the study appears to accept. Empty when nothing was found. */
  stages: CancerStage[];
  source: StageSource;
  /** The wording the stages were read from, for display and auditing. */
  evidence: string | null;
}

const ORDER: CancerStage[] = ["0", "I", "II", "III", "IV"];

/** Normalises "3", "iii", "III" to the canonical roman form. */
function canonical(token: string): CancerStage | null {
  const t = token.trim().toUpperCase();
  const arabic: Record<string, CancerStage> = {
    "0": "0",
    "1": "I",
    "2": "II",
    "3": "III",
    "4": "IV",
  };
  if (arabic[t]) return arabic[t];
  if (t === "I" || t === "II" || t === "III" || t === "IV") return t;
  return null;
}

/**
 * Matches stage mentions, including the ranges and lists the registry uses:
 * "Stage IV", "Stage 3", "Stage III-IV", "Stage II/III", "Stage 3 or 4",
 * "Stage IIIb" (the sub-letter is ignored — IIIb is still III).
 */
const STAGE_PATTERN =
  /stage\s*([0-4]|IV|III|II|I)\s*[A-C]?\s*(?:\s*(?:-|–|—|\/|,|\bor\b|\bto\b|\band\b)\s*([0-4]|IV|III|II|I)\s*[A-C]?)?/gi;

const METASTATIC_PATTERN = /\b(metastatic|metastases|metastasis|stage\s*4\b|stage\s*IV\b)/i;

/** Everything between a stage range's endpoints is accepted too. */
function expandRange(from: CancerStage, to: CancerStage): CancerStage[] {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  if (a < 0 || b < 0) return [from];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return ORDER.slice(lo, hi + 1);
}

/**
 * Reads the stages a study appears to accept.
 *
 * @param conditions  The study's published condition list.
 * @param inclusionText Inclusion criteria only. Exclusion text is deliberately
 *        excluded: "patients with Stage IV disease are excluded" would
 *        otherwise be read as *accepting* Stage IV and hide the wrong people.
 */
export function extractStageRequirement(
  conditions: string[],
  inclusionText: string,
): StageRequirement {
  const haystack = `${conditions.join(" ")} ${inclusionText}`;

  const found = new Set<CancerStage>();
  let evidence: string | null = null;

  for (const match of haystack.matchAll(STAGE_PATTERN)) {
    const first = canonical(match[1]);
    if (!first) continue;
    evidence ??= match[0].trim();

    const second = match[2] ? canonical(match[2]) : null;
    if (second) {
      for (const s of expandRange(first, second)) found.add(s);
    } else {
      found.add(first);
    }
  }

  if (found.size > 0) {
    return {
      stages: ORDER.filter((s) => found.has(s)),
      source: "stated",
      evidence,
    };
  }

  // No explicit stage. "Metastatic" is Stage IV by definition — the cancer has
  // spread to distant sites — so it is a reliable stand-in.
  const metastatic = haystack.match(METASTATIC_PATTERN);
  if (metastatic) {
    return { stages: ["IV"], source: "metastatic", evidence: metastatic[0].trim() };
  }

  return { stages: [], source: "none", evidence: null };
}

/**
 * Whether a study is compatible with the person's stage.
 *
 * Returns true when the study states no stage at all — that is the
 * "if available, match" rule, and it is what keeps roughly half of all
 * recruiting trials visible.
 */
export function stageMatches(
  requirement: StageRequirement,
  patientStage: CancerStage | null | undefined,
): boolean {
  if (!patientStage || patientStage === "unspecified") return true;
  if (requirement.stages.length === 0) return true;
  return requirement.stages.includes(patientStage);
}

/** Short label for the interface, e.g. "Stage III–IV". */
export function stageLabel(requirement: StageRequirement): string | null {
  if (requirement.stages.length === 0) return null;
  if (requirement.stages.length === 1) return `Stage ${requirement.stages[0]}`;

  const first = requirement.stages[0];
  const last = requirement.stages[requirement.stages.length - 1];
  const contiguous =
    ORDER.indexOf(last) - ORDER.indexOf(first) === requirement.stages.length - 1;

  return contiguous
    ? `Stage ${first}–${last}`
    : `Stage ${requirement.stages.join(", ")}`;
}
