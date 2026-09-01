import type { CancerEntry } from "../catalog/cancers";
import type { Trial } from "./types";

/**
 * Disease relevance filtering.
 *
 * ClinicalTrials.gov matches `query.cond` loosely, so a search returns studies
 * about neighbouring diseases. This module decides whether a study is **about
 * the disease that was selected**. It is a relevance check on the registry's
 * own condition list — not an eligibility judgement about a person — and it
 * never reads the free-text criteria.
 *
 * Two rules matter, and both were bugs in the previous version:
 *
 *  1. **Each condition is evaluated on its own.** Concatenating a study's
 *     conditions into one string let tokens from unrelated diseases combine to
 *     satisfy a query no single condition satisfied.
 *
 *  2. **Conflicts are checked before matching.** "Non-small cell lung cancer"
 *     contains every word of "small cell lung cancer", so token matching alone
 *     accepts it. SCLC and NSCLC are different diseases with different
 *     treatment, so a curated conflict list blocks that outright.
 */

/** Words that carry no disease meaning on their own. */
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "with", "without", "in", "for", "to",
  "disease", "diseases", "disorder", "disorders", "syndrome", "condition",
  "conditions", "patients", "participants", "adults", "subjects",
]);

/**
 * Severity and temporal qualifiers. If the person's selection carries one it is
 * a preference, not a requirement: registries routinely list plain "Melanoma"
 * for a study of metastatic melanoma, so demanding these would hide real
 * matches.
 */
const OPTIONAL_QUALIFIERS = new Set([
  "metastatic", "advanced", "recurrent", "refractory", "relapsed", "unresectable",
  "early", "chronic", "acute", "severe", "moderate", "mild", "primary",
  "secondary", "progressive", "resistant", "stage",
]);

/**
 * Qualifiers that are NOT optional, because they name a different disease
 * rather than a different severity. "Chronic" and "acute" appear above as
 * severity words for general conditions, but in leukaemia they are the whole
 * distinction — so the catalogue's conflict list, not this set, is what keeps
 * AML and CML apart.
 */
const ROMAN_TO_ARABIC: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
};

/** Common shorthand people type, expanded to registry wording. */
const ABBREVIATIONS: Record<string, string> = {
  t1d: "type 1 diabetes",
  t1dm: "type 1 diabetes mellitus",
  t2d: "type 2 diabetes",
  t2dm: "type 2 diabetes mellitus",
  nsclc: "non small cell lung cancer",
  sclc: "small cell lung cancer",
  crc: "colorectal cancer",
  tnbc: "triple negative breast cancer",
  aml: "acute myeloid leukemia",
  cml: "chronic myeloid leukemia",
  all: "acute lymphoblastic leukemia",
  cll: "chronic lymphocytic leukemia",
  sll: "small lymphocytic lymphoma",
  net: "neuroendocrine tumor",
  gepnet: "gastroenteropancreatic neuroendocrine tumor",
  pnet: "pancreatic neuroendocrine tumor",
  copd: "chronic obstructive pulmonary disease",
  ckd: "chronic kidney disease",
  ra: "rheumatoid arthritis",
  ms: "multiple sclerosis",
  ibd: "inflammatory bowel disease",
  gdm: "gestational diabetes mellitus",
};

/**
 * Splits text into comparable tokens.
 *
 * Hyphens become spaces so "non-small" yields "non" and "small" — which is what
 * lets the conflict check see the negating prefix rather than losing it.
 * British/American spelling and simple plurals are folded.
 */
function tokenize(text: string): string[] {
  const expanded = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .flatMap((word) => (ABBREVIATIONS[word] ? ABBREVIATIONS[word].split(" ") : [word]));

  return expanded
    .map((w) => ROMAN_TO_ARABIC[w] ?? w)
    .map((w) => w.replace(/ae/g, "e").replace(/our\b/g, "or"))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

const isNumeric = (token: string) => /^\d+$/.test(token);

/** Normalised form used for whole-phrase comparison. */
const normalisePhrase = (text: string) => tokenize(text).join(" ");

export type MatchReason =
  | "no-condition-selected"
  | "no-conditions-published"
  | "different-disease"
  | "conflicting-subtype"
  | null;

export interface ConditionMatch {
  matched: boolean;
  reason: MatchReason;
  /** The study condition that satisfied the match, for explanation. */
  matchedOn: string | null;
}

/**
 * Terms that should satisfy a selection: its query wording plus curated
 * aliases. The display label is deliberately excluded — "Melanoma: Cutaneous"
 * is a UI label, not registry wording.
 */
function acceptedTerms(cancer: CancerEntry): string[] {
  return [cancer.query, ...cancer.aliases];
}

/**
 * Does one published condition string satisfy one accepted term?
 *
 * Every meaningful token of the term must appear in that single condition.
 * Severity qualifiers in the term are optional; numeric discriminators are not.
 */
function conditionSatisfies(condition: string, term: string): boolean {
  const termTokens = tokenize(term);
  if (!termTokens.length) return false;

  const conditionTokens = new Set(tokenize(condition));

  const required = termTokens.filter((t) => !OPTIONAL_QUALIFIERS.has(t));
  const mustMatch = required.length ? required : termTokens;

  if (!mustMatch.every((t) => conditionTokens.has(t))) return false;

  // "type 2" must never be satisfied by a condition saying only "type 1".
  for (const num of termTokens.filter(isNumeric)) {
    if (!conditionTokens.has(num)) return false;
  }
  return true;
}

/**
 * Does one published condition name a subtype the selection explicitly excludes?
 *
 * Checked before matching, because a conflicting phrase usually *contains* the
 * selection's own words.
 */
function conditionConflicts(condition: string, cancer: CancerEntry): boolean {
  const normalised = normalisePhrase(condition);
  return cancer.conflicts.some((conflict) => {
    const conflictTokens = tokenize(conflict);
    if (!conflictTokens.length) return false;
    // Whole-phrase containment: "non small cell lung cancer" inside the
    // condition means this condition is the excluded subtype.
    return normalised.includes(conflictTokens.join(" "));
  });
}

/**
 * Decides whether a study is about the selected cancer.
 *
 * A study qualifies when **at least one** of its published conditions both
 * satisfies an accepted term and is not itself a conflicting subtype. A study
 * listing several diseases therefore qualifies on the strength of the one that
 * matches — which is correct for basket trials — while a study listing only the
 * conflicting subtype is rejected.
 */
export function matchesCancer(trial: Trial, cancer: CancerEntry | null): ConditionMatch {
  if (!cancer) return { matched: true, reason: "no-condition-selected", matchedOn: null };

  // A study with no published condition list cannot be checked. Keep it and let
  // the person judge, rather than hiding it on missing metadata.
  if (!trial.conditions.length) {
    return { matched: true, reason: "no-conditions-published", matchedOn: null };
  }

  const terms = acceptedTerms(cancer);
  let sawConflict = false;

  for (const condition of trial.conditions) {
    if (conditionConflicts(condition, cancer)) {
      sawConflict = true;
      continue; // this condition is the wrong subtype; another may still match
    }
    for (const term of terms) {
      if (conditionSatisfies(condition, term)) {
        return { matched: true, reason: null, matchedOn: condition };
      }
    }
  }

  return {
    matched: false,
    reason: sawConflict ? "conflicting-subtype" : "different-disease",
    matchedOn: null,
  };
}

/**
 * Free-text fallback, used only by "Other cancer / not listed".
 *
 * Same per-condition rule, with the typed text as the single accepted term and
 * no curated conflicts available.
 */
export function matchesFreeText(trial: Trial, text: string): ConditionMatch {
  const query = text.trim();
  if (!query) return { matched: true, reason: "no-condition-selected", matchedOn: null };
  if (!trial.conditions.length) {
    return { matched: true, reason: "no-conditions-published", matchedOn: null };
  }

  for (const condition of trial.conditions) {
    if (conditionSatisfies(condition, query)) {
      return { matched: true, reason: null, matchedOn: condition };
    }
  }
  return { matched: false, reason: "different-disease", matchedOn: null };
}

/**
 * Removes studies that are not about the selected cancer.
 *
 * @returns the kept studies and how many were dropped, so the interface can say
 *          so plainly instead of silently shrinking the result count.
 */
export function filterByCancer(
  trials: Trial[],
  cancer: CancerEntry | null,
  freeText?: string | null,
): { kept: Trial[]; removed: number } {
  const test = (t: Trial) =>
    cancer ? matchesCancer(t, cancer).matched : matchesFreeText(t, freeText ?? "").matched;

  const kept = trials.filter(test);
  return { kept, removed: trials.length - kept.length };
}
