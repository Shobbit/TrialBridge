import type { Trial } from "./types";

/**
 * Condition relevance filtering.
 *
 * ClinicalTrials.gov matches `query.cond` loosely, so a search for
 * "type 2 diabetes" genuinely returns studies whose only listed condition is
 * "Healthy Participants" or "Type 1 Diabetes". Those are not near-misses; they
 * are the wrong disease, and showing them wastes the time of someone trying to
 * enrol.
 *
 * This module decides only whether a study is **about the disease that was
 * asked for**. It is a relevance check on the registry's own condition list —
 * not an eligibility judgement about a person, and it never looks at the
 * free-text criteria.
 *
 * Verified against live registry data, the matcher must cope with:
 *   "Type 2 Diabetes", "Type II Diabetes", "Diabetes Mellitus, Type 2",
 *   "Type 2 Diabetes Mellitus (T2DM)", "Diabetes Type 2"
 * while rejecting "Type 1 Diabetes" and "Healthy Participants".
 */

/** Words that carry no disease meaning on their own. */
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "with", "without", "in", "for", "to",
  "disease", "diseases", "disorder", "disorders", "syndrome", "condition",
  "conditions", "patients", "participants", "adults", "subjects",
]);

/**
 * Severity/temporal qualifiers. If the person types one it is a preference,
 * not a requirement: registries routinely list plain "Melanoma" for a study of
 * metastatic melanoma, so demanding these would hide real matches.
 */
const OPTIONAL_QUALIFIERS = new Set([
  "metastatic", "advanced", "recurrent", "refractory", "relapsed", "unresectable",
  "early", "chronic", "acute", "severe", "moderate", "mild", "primary",
  "secondary", "progressive", "resistant", "stage",
]);

/**
 * Discriminators that MUST match when present.
 *
 * This is the rule that keeps "Type 1 Diabetes" out of a "type 2 diabetes"
 * search. Roman numerals are folded to digits so "Type II Diabetes" matches.
 */
const ROMAN_TO_ARABIC: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
};

/** Common shorthand people actually type, expanded to registry wording. */
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
  cll: "chronic lymphocytic leukemia",
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
 * British/American spelling and simple plurals are folded so that "tumour" and
 * "tumors" compare equal.
 */
function tokenize(text: string): string[] {
  const expanded = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .flatMap((word) => (ABBREVIATIONS[word] ? ABBREVIATIONS[word].split(" ") : [word]));

  return expanded
    .map((w) => ROMAN_TO_ARABIC[w] ?? w)
    .map((w) => w.replace(/ae/g, "e").replace(/our\b/g, "or"))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

const isNumeric = (token: string) => /^\d+$/.test(token);

export interface ConditionMatch {
  matched: boolean;
  /** Why it was rejected, for the warning shown to the person. */
  reason: "no-condition-entered" | "no-conditions-published" | "different-disease" | null;
}

/**
 * Decides whether a study is about the condition that was searched for.
 *
 * The rule: every meaningful token of the query must appear somewhere in the
 * study's published condition list, except severity qualifiers, which are
 * treated as optional. Numeric discriminators ("type 2") are never optional.
 *
 * Deliberately permissive in one direction and strict in the other: extra
 * conditions on the study are fine (a diabetes-and-obesity study still matches
 * "diabetes"), but a missing discriminator is fatal.
 */
export function matchesCondition(trial: Trial, condition: string): ConditionMatch {
  const query = condition.trim();
  if (!query) return { matched: true, reason: "no-condition-entered" };

  // A study with no published condition list cannot be checked. Keep it and
  // let the person judge, rather than hiding it on missing metadata.
  if (!trial.conditions.length) return { matched: true, reason: "no-conditions-published" };

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return { matched: true, reason: "no-condition-entered" };

  const trialTokens = new Set(tokenize(trial.conditions.join(" ")));

  const required = queryTokens.filter((t) => !OPTIONAL_QUALIFIERS.has(t));
  // If the query is only qualifiers ("advanced"), fall back to all tokens
  // rather than matching everything.
  const mustMatch = required.length ? required : queryTokens;

  const allPresent = mustMatch.every((t) => trialTokens.has(t));
  if (!allPresent) return { matched: false, reason: "different-disease" };

  // A numeric discriminator in the query must not be contradicted. "type 2"
  // must never match a study whose conditions say only "type 1".
  for (const num of queryTokens.filter(isNumeric)) {
    if (!trialTokens.has(num)) return { matched: false, reason: "different-disease" };
  }

  return { matched: true, reason: null };
}

/**
 * Removes studies that are not about the searched condition.
 *
 * @returns the kept studies and how many were dropped, so the interface can say
 *          so plainly instead of silently shrinking the result count.
 */
export function filterByCondition(
  trials: Trial[],
  condition: string,
): { kept: Trial[]; removed: number } {
  const kept = trials.filter((t) => matchesCondition(t, condition).matched);
  return { kept, removed: trials.length - kept.length };
}
