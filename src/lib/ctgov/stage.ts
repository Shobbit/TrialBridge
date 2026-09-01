import type { CancerStage } from "../schemas";

/**
 * Cancer-stage requirements, read out of a study's published text.
 *
 * ClinicalTrials.gov has no structured stage field, so stage has to be read
 * from the conditions list and the inclusion criteria. Across recruiting trials
 * in five cancers, an explicit "Stage I–IV" appears in only about a quarter to
 * a third of studies.
 *
 * Three rules govern this module, and each exists because the previous version
 * got it wrong:
 *
 *  1. **Negation is honoured.** "Non-metastatic", "no metastases", "Stage IV
 *     must be absent" previously all produced Stage IV — the exact inverse of
 *     the criterion.
 *
 *  2. **"Metastatic" alone is never a definite stage.** It is Stage IV in many
 *     cancers but not all: melanoma Stage III already includes regional and
 *     in-transit metastases, and AML has no I–IV staging at all. A metastatic
 *     mention is recorded as *uncertain* and never used to exclude anyone.
 *
 *  3. **Uncertainty is never rendered as a definite stage.** If wording cannot
 *     be read conservatively, the study keeps an unclear stage and stays
 *     visible.
 */

export type StageSource =
  /** A clear, positive, unambiguous accepted-stage statement. */
  | "stated"
  /** Metastatic disease mentioned, exact stage not stated. Never filters. */
  | "metastatic-unspecified"
  /** Nothing readable. */
  | "none";

export interface StageRequirement {
  /** Stages the study clearly accepts. Only ever populated for "stated". */
  stages: CancerStage[];
  source: StageSource;
  /** The wording this was read from, for display and auditing. */
  evidence: string | null;
}

const ORDER: CancerStage[] = ["0", "I", "II", "III", "IV"];

function canonical(token: string): CancerStage | null {
  const t = token.trim().toUpperCase();
  const arabic: Record<string, CancerStage> = {
    "0": "0", "1": "I", "2": "II", "3": "III", "4": "IV",
  };
  if (arabic[t]) return arabic[t];
  if (t === "I" || t === "II" || t === "III" || t === "IV") return t;
  return null;
}

const NUMERAL = "0|IV|III|II|I|[0-4]";
/** Optional substage letter: IIIA, IIB, 3c. */
const SUB = "\\s*[A-Ca-c]?\\b";

/**
 * One stage mention, with as many list/range members as the wording carries.
 *
 * Deliberately greedy about members: "Stage II/III/IV" and "Stages II and III"
 * must yield every stage named, because under-extraction causes the dangerous
 * failure — excluding a patient from a trial that actually accepts them.
 */
const STAGE_MENTION = new RegExp(
  `stages?\\s*(${NUMERAL})${SUB}` +
    `((?:\\s*(?:-|–|—|\\/|,|\\bor\\b|\\bto\\b|\\band\\b|\\bthrough\\b)\\s*(?:${NUMERAL})${SUB})*)` +
    `(\\s*(?:or|and)\\s+(?:higher|greater|above|later|more advanced|lower|earlier|less))?`,
  "gi",
);

const FOLLOWER = new RegExp(`(?:-|–|—|\\/|,|\\bor\\b|\\bto\\b|\\band\\b|\\bthrough\\b)\\s*(${NUMERAL})`, "gi");

/**
 * Wording that inverts a stage mention.
 *
 * Scanned in a window immediately before the match, and in the clause after it,
 * because both "no Stage IV disease" and "Stage IV disease must be absent"
 * occur in real criteria.
 */
const NEGATION_BEFORE =
  /\b(non|no|not|never|without|absence of|free of|exclud\w*|ineligible|must not|cannot|may not|should not)\b[^.;]{0,40}$/i;
const NEGATION_AFTER = /^[^.;]{0,40}\b(must be absent|is excluded|are excluded|not (?:be )?(?:allowed|permitted|eligible))\b/i;

/** "Metastatic" in any form, used only to mark uncertainty. */
const METASTATIC = /\b(metastatic|metastases|metastasis|metastasised|metastasized)\b/i;

function isNegated(haystack: string, start: number, end: number): boolean {
  const before = haystack.slice(Math.max(0, start - 60), start);
  const after = haystack.slice(end, end + 60);
  return NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after);
}

function expandRange(from: CancerStage, to: CancerStage): CancerStage[] {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  if (a < 0 || b < 0) return [from];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return ORDER.slice(lo, hi + 1);
}

/**
 * Reads the stages a study clearly accepts.
 *
 * @param conditions    The study's published condition list.
 * @param inclusionText Inclusion criteria only. Exclusion text is deliberately
 *        excluded by the caller: "patients with Stage IV disease are excluded"
 *        must never be read as the study *accepting* Stage IV.
 */
export function extractStageRequirement(
  conditions: string[],
  inclusionText: string,
): StageRequirement {
  const haystack = `${conditions.join(". ")}. ${inclusionText}`;

  const found = new Set<CancerStage>();
  let evidence: string | null = null;

  for (const match of haystack.matchAll(STAGE_MENTION)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isNegated(haystack, start, end)) continue;

    const first = canonical(match[1]);
    if (!first) continue;

    const members: CancerStage[] = [first];
    for (const follower of (match[2] ?? "").matchAll(FOLLOWER)) {
      const next = canonical(follower[1]);
      if (next) members.push(next);
    }

    const threshold = (match[3] ?? "").toLowerCase();
    let stages: CancerStage[];

    if (/higher|greater|above|later|more advanced/.test(threshold)) {
      // "Stage IIB or higher" accepts everything from II upward.
      stages = expandRange(members[members.length - 1], "IV");
    } else if (/lower|earlier|less/.test(threshold)) {
      stages = expandRange("0", members[0]);
    } else if (members.length >= 2 && /-|–|—|\bto\b|\bthrough\b/.test(match[2] ?? "")) {
      // A dash or "through" is a range; a slash, comma or "and" is a list.
      stages = expandRange(members[0], members[members.length - 1]);
    } else {
      stages = members;
    }

    for (const s of stages) found.add(s);
    evidence ??= match[0].trim();
  }

  if (found.size > 0) {
    return { stages: ORDER.filter((s) => found.has(s)), source: "stated", evidence };
  }

  /*
   * No clear stage. A metastatic mention is recorded as uncertain, never as a
   * definite Stage IV: it is Stage IV in many cancers but not all, and this
   * module has no idea which cancer it is looking at. It must not filter.
   */
  const metastatic = haystack.match(METASTATIC);
  if (metastatic && !isNegated(haystack, metastatic.index ?? 0, (metastatic.index ?? 0) + metastatic[0].length)) {
    return {
      stages: [],
      source: "metastatic-unspecified",
      evidence: metastatic[0].trim(),
    };
  }

  return { stages: [], source: "none", evidence: null };
}

/**
 * Whether a study is compatible with the person's stage.
 *
 * Hard filtering happens **only** against a clear positive statement. Anything
 * uncertain — no stage, or metastatic without a stage — keeps the study
 * visible. That is the "if available, match" rule, and it is what keeps roughly
 * half of all recruiting oncology trials in the results.
 */
export function stageMatches(
  requirement: StageRequirement,
  patientStage: CancerStage | null | undefined,
): boolean {
  if (!patientStage || patientStage === "unspecified") return true;
  if (requirement.source !== "stated") return true;
  if (requirement.stages.length === 0) return true;
  return requirement.stages.includes(patientStage);
}

/**
 * Label for the interface. Never presents uncertainty as a definite stage.
 */
export function stageLabel(requirement: StageRequirement): string {
  if (requirement.source === "metastatic-unspecified") {
    return "Metastatic disease mentioned; exact stage not clearly stated";
  }
  if (requirement.source !== "stated" || requirement.stages.length === 0) {
    return "Stage not clearly stated";
  }

  const { stages } = requirement;
  if (stages.length === 1) return `Stage ${stages[0]}`;

  const first = stages[0];
  const last = stages[stages.length - 1];
  const contiguous = ORDER.indexOf(last) - ORDER.indexOf(first) === stages.length - 1;

  return contiguous ? `Stage ${first}–${last}` : `Stage ${stages.join(", ")}`;
}

/** True when the study made a clear enough statement to filter on. */
export function hasDefiniteStage(requirement: StageRequirement): boolean {
  return requirement.source === "stated" && requirement.stages.length > 0;
}
