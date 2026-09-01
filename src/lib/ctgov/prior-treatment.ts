import { findTreatment, type NetTreatment } from "@/lib/catalog/net-treatments";
import { parseCriteria } from "@/lib/criteria";
import type { Trial } from "./types";

/**
 * Prior-treatment screening.
 *
 * Trials routinely exclude people who have already had a particular drug or
 * drug class. Showing someone a trial they were disqualified from before they
 * read the first line wastes the scarcest thing they have, so a clear
 * unconditional exclusion hides the study by default.
 *
 * That is a strong action, so this module is deliberately narrow about when it
 * takes it. Three things had to be true before anything is hidden:
 *
 *  1. **The text really is an exclusion criterion.** Only items the criteria
 *     parser labelled `exclusion` are read. A drug named in the intervention
 *     list, the title, the summary, or an *inclusion* criterion granting
 *     permission ("prior everolimus allowed") is a mention, not a bar.
 *  2. **The match is on something specific.** Generic name, a brand name the
 *     workbook actually supplied, or a curated mechanism phrase. Never the
 *     broad `category` — "Chemotherapy" appears in almost every oncology
 *     exclusion list and matching it would hide most of the registry.
 *  3. **The criterion is unconditional.** Anything time-qualified or
 *     conditional ("within 4 weeks", "unless", "washout", "permitted after")
 *     is flagged for confirmation and left visible, because whether it applies
 *     depends on dates only the person and the study team know.
 *
 * Everything this module cannot read confidently stays visible. A trial wrongly
 * hidden is an opportunity silently destroyed; a trial wrongly shown costs a
 * few minutes of reading.
 *
 * Nothing here decides eligibility. The output is "this may not apply to you,
 * confirm with the study team", never "you are ineligible".
 */

export type PriorTreatmentFinding = "excluded" | "timing-unclear";

export type PriorTreatmentStatus = "clear" | "timing-unclear" | "excluded";

export interface PriorTreatmentMatch {
  treatmentId: string;
  /** Display name, e.g. "Everolimus (Afinitor)". */
  treatmentLabel: string;
  /** The literal phrase found in the criterion. */
  matchedText: string;
  matchedVia: "name" | "brand" | "mechanism";
  finding: PriorTreatmentFinding;
  /** Id of the criterion, so the UI can link to the exact item. */
  criterionId: string;
  /** The registry's own wording, unmodified apart from length. */
  excerpt: string;
}

export interface PriorTreatmentAssessment {
  status: PriorTreatmentStatus;
  matches: PriorTreatmentMatch[];
  /**
   * True only for an unconditional exclusion on a drug — the one case where
   * hiding the study by default is justified. The route, not this module,
   * decides what to do with it.
   */
  hideRecommended: boolean;
  /**
   * True when no screen was performed: no treatments were entered, none of them
   * were in the catalogue, or the eligibility text could not be split into
   * inclusion and exclusion criteria.
   *
   * Distinct from a clear result, and never evidence of anything. Such a study
   * is always shown — an unreadable record is not evidence of exclusion.
   */
  notAssessed: boolean;
}

/** The criteria were read and nothing matched. */
export const CLEAR_ASSESSMENT: PriorTreatmentAssessment = {
  status: "clear",
  matches: [],
  hideRecommended: false,
  notAssessed: false,
};

/**
 * No screen was performed at all.
 *
 * Kept distinct from `CLEAR_ASSESSMENT`, which means the criteria were read and
 * nothing matched. Collapsing the two would let a caller report "no exclusions
 * found" about a study nobody checked.
 */
export const NOT_ASSESSED: PriorTreatmentAssessment = {
  status: "clear",
  matches: [],
  hideRecommended: false,
  notAssessed: true,
};

/**
 * Categories specific enough that an unconditional exclusion can hide a study.
 *
 * These are drugs: a person either received the named agent or did not, and the
 * criterion is about that agent. The remaining categories are procedures and
 * care pathways — surgery, radiation, ablation, embolisation, watch-and-wait,
 * supportive care, taking part in another trial. Nearly every oncology study
 * mentions those in a washout clause, and "you have had surgery" is not a
 * disqualification in the way "you have had everolimus" is. They are still
 * flagged when they match; they are never hidden.
 */
const HIDEABLE_CATEGORIES = new Set([
  "Chemotherapy",
  "Chemotherapy regimen",
  "Chemotherapy adjunct",
  "Targeted therapy",
  "Immunotherapy",
  "SSTR-targeted therapy",
]);

/**
 * Entries whose names are ordinary clinical English rather than identifiers.
 *
 * "Clinical trials", "Watch and wait", "Open surgery" and "Ablation" appear in
 * exclusion criteria constantly and almost never refer to what this person had.
 * Matching them would produce a flag on nearly every study, which is the same
 * as no flag at all.
 */
const UNMATCHABLE_IDS = new Set([
  "clinical-trials",
  "watch-and-wait",
  "supportive-palliative-care",
  "open-surgery",
  "minimally-invasive-surgery",
  "endoscopic-resection",
  "ablation",
]);

/**
 * Mechanism phrases specific enough to match on, keyed by `mechanismKey`.
 *
 * Curated rather than derived, because the workbook's mechanism column mixes
 * matchable drug-class names ("mTOR inhibitor") with descriptive prose
 * ("Tumor destruction via cold, heat, radio/microwaves, or chemicals") that
 * would either never match or match far too much. A key absent from this map
 * simply gets no mechanism matching; its drugs are still matched by name and
 * brand.
 *
 * Deliberately omitted: `investigational-treatment` ("investigational" appears
 * in most exclusion lists), `surgical-procedural`, `external-radiation`,
 * `observation-no-active-treatment`, `symptom-quality-of-life-management`, and
 * the `combination-*` regimens, whose own names (FOLFOX, CAPEOX) are matched
 * directly.
 */
const MECHANISM_PHRASES: Record<string, string[]> = {
  "mtor-inhibitor": ["mTOR inhibitor"],
  "braf-inhibitor": ["BRAF inhibitor"],
  "mek-inhibitor": ["MEK inhibitor"],
  "ret-inhibitor": ["RET inhibitor"],
  "trk-inhibitor": ["TRK inhibitor", "NTRK inhibitor"],
  "ros1-trk-inhibitor": ["ROS1 inhibitor", "TRK inhibitor", "NTRK inhibitor"],
  "trk-ros1-alk-inhibitor": ["TRK inhibitor", "NTRK inhibitor", "ROS1 inhibitor", "ALK inhibitor"],
  "multi-kinase-inhibitor": ["multikinase inhibitor", "multi-kinase inhibitor"],
  "pd-1-inhibitor": ["PD-1 inhibitor", "anti-PD-1", "checkpoint inhibitor"],
  "ctla-4-inhibitor": ["CTLA-4 inhibitor", "anti-CTLA-4", "checkpoint inhibitor"],
  "somatostatin-analog": ["somatostatin analog", "somatostatin analogue"],
  "prrt-radiolabeled-somatostatin-analog": ["PRRT", "peptide receptor radionuclide therapy"],
  "topoisomerase-i-inhibitor": ["topoisomerase I inhibitor"],
  "topoisomerase-ii-inhibitor": ["topoisomerase II inhibitor"],
  "platinum-based-alkylating-agent": [
    "platinum-based",
    "platinum-containing",
    "platinum agent",
    "platinum chemotherapy",
    "platinum doublet",
  ],
  "alkylating-agent": ["alkylating agent"],
  antimetabolite: ["fluoropyrimidine"],
};

/**
 * Criteria whose subject is a reaction or a physiological state, not a
 * treatment history.
 *
 * Both of these were found hiding real trials during live testing:
 *
 *   "Known hypersensitivity to ipilimumab or nivolumab or their excipients"
 *   "Pregnant women are excluded ... breastfeeding should be discontinued if
 *    the mother is treated with everolimus or sunitinib"
 *
 * Neither is about having already had the drug. The first is an allergy — most
 * people who received nivolumab are not hypersensitive to it — and the second
 * names the study's own arms while describing a pregnancy restriction. A drug
 * appearing in either kind of criterion is a mention, so the study is left
 * visible.
 *
 * The veto covers the whole criterion, which could in principle suppress a
 * genuine bar written in the same bullet. That error points towards showing a
 * trial rather than hiding one, which is the direction this module errs in
 * everywhere else.
 */
const NOT_A_TREATMENT_HISTORY: RegExp[] = [
  /\b(?:hypersensitiv|allerg|anaphyla|intoleran|contraindicat|excipient)/i,
  /\b(?:pregnan|breast\s?-?feed|lactat|teratogen|abortifacient|nursing)/i,
];

/**
 * Phrases that mark a criterion as being about what someone has already had.
 *
 * An exclusion that bars someone *because they received a drug* says so — this
 * is how registries write it, without exception in the live records checked.
 * Requiring one of these turns a drug mention into evidence, and stops a drug
 * named incidentally (in a dosing note, a rationale, an unrelated clause) from
 * withholding a study.
 */
const TREATMENT_HISTORY_CUES: RegExp[] = [
  /\bprior\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bhistory of\b/i,
  /\bpre-?treated\b/i,
  /\breceiv(?:ed|ing)\b/i,
  /\btreat(?:ed|ment) with\b/i,
  /\btherapy with\b/i,
  /\bexposure to\b/i,
  /\brefractory to\b/i,
  /\bprogress(?:ed|ion) (?:on|after|following)\b/i,
  /\bongoing (?:treatment|therapy|use)\b/i,
  /\bcurrent(?:ly)? (?:taking|on|treated)\b/i,
  /\blines? of (?:therapy|treatment)\b/i,
  /\bat any time (?:before|prior)\b/i,
  /\bwash\s?-?out\b/i,
  /\bwithin\s+\d+\s*(?:day|week|month|year)/i,
];

/**
 * Markers that make a criterion conditional rather than absolute.
 *
 * Each of these means the bar depends on *when* or *whether* something
 * happened, which this app cannot know. A trial matching one of these is shown
 * with a note asking the person to confirm the timing, never hidden.
 */
const CONDITIONAL_MARKERS: RegExp[] = [
  /\bwithin\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/i,
  /\bwash\s?-?out\b/i,
  /\bunless\b/i,
  /\bexcept(?:ing)?\b/i,
  /\bother than\b/i,
  /\b(?:allowed|permitted|eligible|acceptable)\s+(?:if|after|once|when|provided)\b/i,
  /\bmay be (?:allowed|permitted|eligible|considered)\b/i,
  /\bprovided (?:that|they|the)\b/i,
  /\bat least\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:day|week|month|year)/i,
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:days?|weeks?|months?|years?)\s+(?:prior|before|preceding|of)\b/i,
  /\b(?:less|fewer|more)\s+than\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:day|week|month|year)/i,
  /\bin the (?:last|past|preceding|previous)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/i,
  /\b(?:≤|≥|<|>)\s*\d+\s*(?:day|week|month|year)/i,
];

/** Longer than this and the excerpt stops being an excerpt. */
const MAX_EXCERPT = 320;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a matcher for one term.
 *
 * Spaces and hyphens are treated as interchangeable, because registries write
 * "PD-1 inhibitor", "PD1 inhibitor" and "anti PD-1" indiscriminately. The
 * boundaries reject `\w` and `-` on both sides so "5-FU" does not match inside
 * "5-FUDR", and "PRRT" does not match inside a longer token.
 */
function termPattern(term: string): RegExp {
  const body = escapeRegExp(term.trim()).replace(/(?:\\ |\s|-)+/g, "[\\s-]?");
  return new RegExp(`(?<![\\w-])${body}(?:s|es)?(?![\\w-])`, "i");
}

interface SearchTerm {
  pattern: RegExp;
  via: PriorTreatmentMatch["matchedVia"];
}

/**
 * The phrases that may identify this treatment in an exclusion criterion.
 *
 * A parenthesised alternative in the supplied name is split out as its own
 * term, so "Fluorouracil (5-FU)" is found whether the registry wrote the full
 * name or the abbreviation.
 */
export function exclusionSearchTerms(treatment: NetTreatment): SearchTerm[] {
  if (UNMATCHABLE_IDS.has(treatment.id)) return [];

  const terms: SearchTerm[] = [];
  const seen = new Set<string>();

  const add = (raw: string, via: PriorTreatmentMatch["matchedVia"]) => {
    const value = raw.trim();
    // Two characters cannot identify a drug; they can only produce noise.
    if (value.length < 3) return;
    const key = `${via}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ pattern: termPattern(value), via });
  };

  const parenthesised = treatment.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenthesised) {
    add(parenthesised[1], "name");
    add(parenthesised[2], "name");
  } else {
    add(treatment.name, "name");
  }

  for (const brand of treatment.brands) add(brand, "brand");
  for (const phrase of MECHANISM_PHRASES[treatment.mechanismKey] ?? []) add(phrase, "mechanism");

  return terms;
}

function label(treatment: NetTreatment): string {
  return treatment.brands.length ? `${treatment.name} (${treatment.brands[0]})` : treatment.name;
}

/**
 * The criterion as it will be quoted.
 *
 * Only the registry's own list marker and line wrapping are removed — those are
 * layout, not wording, and a blockquote supplies its own. Every word is the
 * registry's.
 *
 * When the criterion is too long to quote whole, the window is centred on the
 * phrase that matched rather than taken from the start. Registries publish
 * criteria hundreds of words long, and truncating from the front produced
 * quotes that did not contain the drug they were offered as evidence for —
 * measured live, three of thirteen. A quote that does not support the flag
 * beside it is worse than no quote.
 */
function excerpt(text: string, pattern?: RegExp): string {
  const collapsed = text
    .replace(/^\s*(?:[-*•‣▪]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (collapsed.length <= MAX_EXCERPT) return collapsed;

  const hit = pattern ? collapsed.match(pattern) : null;
  if (!hit || hit.index === undefined) return `${collapsed.slice(0, MAX_EXCERPT - 1)}…`;

  const centre = hit.index + Math.floor(hit[0].length / 2);
  let end = Math.min(collapsed.length, centre + Math.ceil(MAX_EXCERPT / 2));
  let start = Math.max(0, end - MAX_EXCERPT);
  end = Math.min(collapsed.length, start + MAX_EXCERPT);

  // Snap outwards to whitespace so the quote never begins or ends mid-word,
  // but never so far that the matched phrase itself is cut.
  if (start > 0) {
    const space = collapsed.indexOf(" ", start);
    if (space !== -1 && space < hit.index) start = space + 1;
  }
  if (end < collapsed.length) {
    const space = collapsed.lastIndexOf(" ", end);
    if (space > hit.index + hit[0].length) end = space;
  }

  return `${start > 0 ? "…" : ""}${collapsed.slice(start, end).trim()}${
    end < collapsed.length ? "…" : ""
  }`;
}

/** True when the criterion's bar depends on timing or a condition. */
export function isConditional(criterionText: string): boolean {
  return CONDITIONAL_MARKERS.some((marker) => marker.test(criterionText));
}

/**
 * True when this criterion is about treatment already received.
 *
 * A drug named in a criterion that fails this test is a mention, not a bar:
 * an allergy, a pregnancy restriction, a dosing note, or the study describing
 * its own arms.
 */
export function isAboutTreatmentHistory(criterionText: string): boolean {
  if (NOT_A_TREATMENT_HISTORY.some((veto) => veto.test(criterionText))) return false;
  return TREATMENT_HISTORY_CUES.some((cue) => cue.test(criterionText));
}

/**
 * Assesses one trial against the treatments a person says they have had.
 *
 * Two distinct kinds of "nothing found" come back, and the difference matters:
 * `notAssessed` means no screen happened — no treatments were entered, none of
 * them were in the catalogue, or the criteria could not be read — while
 * `status: "clear"` with `notAssessed: false` means the exclusion criteria were
 * read and none matched. Neither means the person is eligible.
 */
export function assessPriorTreatments(
  trial: Trial,
  treatmentIds: readonly string[],
): PriorTreatmentAssessment {
  if (!treatmentIds.length) return NOT_ASSESSED;

  const treatments = treatmentIds
    .map((id) => findTreatment(id))
    .filter((t): t is NetTreatment => t !== undefined);
  // Nothing resolvable to screen against; saying "clear" would be a claim.
  if (!treatments.length) return NOT_ASSESSED;

  const parsed = parseCriteria(trial);
  const exclusionItems = parsed.criteria.filter((c) => c.type === "exclusion");

  // No exclusion section this app can identify — including the `unsegmented`
  // fallback, where inclusion and exclusion text are indistinguishable. Reading
  // an exclusion into that would be guessing, so nothing is claimed.
  if (!parsed.segmented || exclusionItems.length === 0) {
    return NOT_ASSESSED;
  }

  const matches: PriorTreatmentMatch[] = [];

  for (const treatment of treatments) {
    const terms = exclusionSearchTerms(treatment);
    if (!terms.length) continue;

    for (const item of exclusionItems) {
      // The criterion must be about treatment already received. Without this,
      // a drug named in an allergy or pregnancy clause withheld the study.
      if (!isAboutTreatmentHistory(item.verbatimText)) continue;

      const found = terms.find((term) => term.pattern.test(item.verbatimText));
      if (!found) continue;

      const hit = item.verbatimText.match(found.pattern);
      matches.push({
        treatmentId: treatment.id,
        treatmentLabel: label(treatment),
        matchedText: hit ? hit[0] : "",
        matchedVia: found.via,
        finding: isConditional(item.verbatimText) ? "timing-unclear" : "excluded",
        criterionId: item.criterionId,
        excerpt: excerpt(item.verbatimText, found.pattern),
      });
      // One criterion per treatment is enough evidence; repeating the same
      // finding for every restatement would bury it.
      break;
    }
  }

  if (!matches.length) return CLEAR_ASSESSMENT;

  const unconditional = matches.filter((m) => m.finding === "excluded");
  const status: PriorTreatmentStatus = unconditional.length
    ? "excluded"
    : "timing-unclear";

  const hideRecommended = unconditional.some((m) => {
    const treatment = findTreatment(m.treatmentId);
    return treatment ? HIDEABLE_CATEGORIES.has(treatment.category) : false;
  });

  return { status, matches, hideRecommended, notAssessed: false };
}

/**
 * Splits a result list into what to show and what to hide.
 *
 * The assessment is attached to every trial either way, so a study that is
 * merely flagged carries its evidence into the UI, and a hidden study arrives
 * with the reason already computed if the person asks to see it.
 */
export function partitionByPriorTreatment(
  trials: readonly Trial[],
  treatmentIds: readonly string[],
): { visible: Trial[]; hidden: Trial[] } {
  const visible: Trial[] = [];
  const hidden: Trial[] = [];

  for (const trial of trials) {
    const priorTreatment = assessPriorTreatments(trial, treatmentIds);
    const annotated: Trial = { ...trial, priorTreatment };
    if (priorTreatment.hideRecommended) hidden.push(annotated);
    else visible.push(annotated);
  }

  return { visible, hidden };
}
