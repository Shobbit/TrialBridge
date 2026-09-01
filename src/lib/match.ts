import type { SearchProfile } from "./schemas";
import type { Trial } from "./ctgov/types";
import { parseCriteria } from "./criteria";

/**
 * Deterministic, rule-based comparison between a self-entered profile and the
 * *structured* eligibility fields a trial publishes.
 *
 * PRODUCT BOUNDARY - this module deliberately does not:
 *   - decide whether someone is eligible,
 *   - score or rank medical suitability,
 *   - interpret the free-text inclusion/exclusion criteria.
 *
 * It only reports three things: what appears to line up, what appears not to,
 * and what could not be checked at all. Every finding is phrased as an
 * observation about published data, never as a conclusion about the person.
 * Final eligibility is determined solely by the trial investigators after
 * medical screening.
 */

export type FindingKind = "match" | "mismatch" | "unknown";

export type FindingField =
  | "recruitmentStatus"
  | "age"
  | "sex"
  | "distance"
  | "phase"
  | "condition"
  | "eligibilityCriteria"
  | "priorTreatments"
  | "cancerStage";

export interface Finding {
  field: FindingField;
  kind: FindingKind;
  /** Short, non-diagnostic statement of the observation. */
  detail: string;
}

export interface TrialAnalysis {
  nctId: string;
  matches: Finding[];
  mismatches: Finding[];
  unknowns: Finding[];
}

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Splits the eligibility text into its inclusion and exclusion halves.
 *
 * Only used to decide *where* a prior treatment is mentioned. The text itself
 * is never interpreted; a mention is reported, not judged.
 */
function criteriaSections(trial: Trial): { inclusionText: string; exclusionText: string } {
  const parsed = parseCriteria(trial);
  const join = (type: "inclusion" | "exclusion") =>
    norm(
      parsed.criteria
        .filter((c) => c.type === type)
        .map((c) => c.verbatimText)
        .join(" "),
    );

  // When the registry text could not be segmented, treat the whole block as
  // inclusion so nothing is wrongly reported as an exclusion conflict.
  if (!parsed.segmented) {
    return { inclusionText: norm(trial.eligibilityCriteria ?? ""), exclusionText: "" };
  }
  return { inclusionText: join("inclusion"), exclusionText: join("exclusion") };
}

/**
 * Whether the criteria text names a given stage.
 *
 * Handles the arabic/roman forms that appear in practice ("Stage 4",
 * "Stage IV", "stage iv"). Deliberately conservative: no match means "not
 * recognised", never "not applicable".
 */
function mentionsStage(criteriaText: string, stage: string): boolean {
  const arabic: Record<string, string> = { "0": "0", I: "1", II: "2", III: "3", IV: "4" };
  const roman = stage;
  const digit = arabic[stage] ?? stage;
  const pattern = new RegExp(`stage\\s*(?:${roman}|${digit})\\b`, "i");
  return pattern.test(criteriaText);
}

/** True when any meaningful token of the query appears in the studied conditions. */
function conditionOverlap(trial: Trial, condition: string): boolean {
  const tokens = norm(condition)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  if (!tokens.length) return false;
  const haystack = norm(trial.conditions.join(" "));
  return tokens.some((t) => haystack.includes(t));
}

/**
 * Analyses one trial against one profile.
 *
 * Fields left blank in the profile produce an `unknown` finding rather than
 * being skipped, so the agent and the user can see exactly which checks were
 * not possible.
 */
export function analyzeTrial(trial: Trial, profile: SearchProfile): TrialAnalysis {
  const findings: Finding[] = [];
  const add = (field: FindingField, kind: FindingKind, detail: string) =>
    findings.push({ field, kind, detail });

  // --- Recruitment status -------------------------------------------------
  if (trial.overallStatus === "UNKNOWN") {
    add("recruitmentStatus", "unknown", "The trial does not publish a current recruitment status.");
  } else if (trial.overallStatus === "RECRUITING") {
    add("recruitmentStatus", "match", "The trial is listed as currently recruiting.");
  } else if (trial.overallStatus === "NOT_YET_RECRUITING") {
    add(
      "recruitmentStatus",
      "unknown",
      "The trial is not yet recruiting, so it is unclear when enrolment opens.",
    );
  } else {
    const readable = trial.overallStatus.replace(/_/g, " ").toLowerCase();
    add(
      "recruitmentStatus",
      "mismatch",
      `The trial is listed as ${readable}, so it may not be enrolling new participants.`,
    );
  }

  // --- Age ----------------------------------------------------------------
  if (profile.age === null) {
    add("age", "unknown", "No age was entered, so the published age range was not checked.");
  } else if (trial.minimumAgeYears === null && trial.maximumAgeYears === null) {
    add("age", "unknown", "The trial does not publish a machine-readable age range.");
  } else {
    const belowMin = trial.minimumAgeYears !== null && profile.age < trial.minimumAgeYears;
    const aboveMax = trial.maximumAgeYears !== null && profile.age > trial.maximumAgeYears;
    const range = `${trial.minimumAge ?? "no stated minimum"} to ${trial.maximumAge ?? "no stated maximum"}`;
    if (belowMin || aboveMax) {
      add(
        "age",
        "mismatch",
        `The entered age (${profile.age}) falls outside the published range of ${range}.`,
      );
    } else {
      add(
        "age",
        "match",
        `The entered age (${profile.age}) falls within the published range of ${range}.`,
      );
    }
    if (trial.minimumAgeYears === null || trial.maximumAgeYears === null) {
      add("age", "unknown", `Only part of the age range is published (${range}).`);
    }
  }

  // --- Sex ----------------------------------------------------------------
  if (trial.sex === null) {
    add("sex", "unknown", "The trial does not publish a sex eligibility field.");
  } else if (trial.sex === "ALL") {
    add("sex", "match", "The trial accepts participants of any sex.");
  } else if (profile.sex === "unspecified") {
    add(
      "sex",
      "unknown",
      `The trial restricts enrolment to ${trial.sex.toLowerCase()} participants, but no sex was entered.`,
    );
  } else if (norm(trial.sex) === profile.sex) {
    add(
      "sex",
      "match",
      `The trial enrols ${trial.sex.toLowerCase()} participants, matching the value entered.`,
    );
  } else {
    add(
      "sex",
      "mismatch",
      `The trial enrols only ${trial.sex.toLowerCase()} participants, which differs from the value entered.`,
    );
  }

  // --- Distance -----------------------------------------------------------
  if (!trial.locations.length) {
    add("distance", "unknown", "The trial does not publish any study locations.");
  } else if (trial.nearestLocationMiles === null) {
    add(
      "distance",
      "unknown",
      "No location coordinates were available, so travel distance could not be estimated.",
    );
  } else if (profile.travelDistanceMiles === null) {
    add(
      "distance",
      "unknown",
      `The nearest site is about ${trial.nearestLocationMiles} miles away, but no travel limit was entered.`,
    );
  } else if (trial.nearestLocationMiles <= profile.travelDistanceMiles) {
    add(
      "distance",
      "match",
      `The nearest site is about ${trial.nearestLocationMiles} miles away, within the ${profile.travelDistanceMiles}-mile limit entered.`,
    );
  } else {
    add(
      "distance",
      "mismatch",
      `The nearest site is about ${trial.nearestLocationMiles} miles away, beyond the ${profile.travelDistanceMiles}-mile limit entered.`,
    );
  }

  // --- Phase --------------------------------------------------------------
  if (!profile.phases.length) {
    add("phase", "unknown", "No phase preference was entered, so phase was not checked.");
  } else if (!trial.phases.length) {
    add("phase", "unknown", "The trial does not publish a phase (common for observational studies).");
  } else if (trial.phases.some((p) => profile.phases.includes(p))) {
    add("phase", "match", `The trial phase (${trial.phases.join(", ")}) matches the preference entered.`);
  } else {
    add(
      "phase",
      "mismatch",
      `The trial phase (${trial.phases.join(", ")}) is not among the phases selected.`,
    );
  }

  // --- Condition ----------------------------------------------------------
  if (!profile.condition) {
    add("condition", "unknown", "No condition was entered, so condition overlap was not checked.");
  } else if (!trial.conditions.length) {
    add("condition", "unknown", "The trial does not publish a structured condition list.");
  } else if (conditionOverlap(trial, profile.condition)) {
    add(
      "condition",
      "match",
      `The condition entered shares wording with the conditions studied (${trial.conditions.slice(0, 3).join(", ")}).`,
    );
  } else {
    add(
      "condition",
      "unknown",
      `The condition entered does not literally match the conditions studied (${trial.conditions.slice(0, 3).join(", ")}). Wording differences are common and do not by themselves indicate a mismatch.`,
    );
  }

  // --- Cancer stage -------------------------------------------------------
  if (profile.cancerStage !== "unspecified") {
    const criteria = trial.eligibilityCriteria ?? "";
    if (!criteria) {
      add(
        "cancerStage",
        "unknown",
        `You entered stage ${profile.cancerStage}, but this study publishes no readable eligibility text to check it against.`,
      );
    } else if (mentionsStage(criteria, profile.cancerStage)) {
      add(
        "cancerStage",
        "match",
        `The eligibility text mentions stage ${profile.cancerStage}. Whether it is included or excluded there is for the study team to confirm.`,
      );
    } else {
      add(
        "cancerStage",
        "unknown",
        `The eligibility text does not name stage ${profile.cancerStage} in a form this page can recognise. Staging is written many different ways, so this is not evidence either way — ask the study team.`,
      );
    }
  }

  // --- Prior treatments ---------------------------------------------------
  if (profile.priorTreatments.length) {
    const { inclusionText, exclusionText } = criteriaSections(trial);

    const inExclusion = profile.priorTreatments.filter(
      (t) => t && exclusionText.includes(norm(t)),
    );
    const inInclusion = profile.priorTreatments.filter(
      (t) => t && inclusionText.includes(norm(t)) && !exclusionText.includes(norm(t)),
    );
    const unmentioned = profile.priorTreatments.filter(
      (t) => t && !inclusionText.includes(norm(t)) && !exclusionText.includes(norm(t)),
    );

    /*
     * A prior treatment named in the exclusion section is the single most
     * useful thing this page can surface, so it is raised to a mismatch rather
     * than buried among the unknowns.
     *
     * It is still phrased as something to check, not a verdict. Exclusion text
     * is full of conditions and exceptions ("no prior X within 6 months",
     * "unless Y"), which this page does not read — so a mention is a reason to
     * ask, never a reason to rule the study out.
     */
    if (inExclusion.length) {
      add(
        "priorTreatments",
        "mismatch",
        `The exclusion criteria mention ${inExclusion.join(", ")}, which you listed as prior treatment. Exclusions often carry time limits or exceptions that are not read here, so raise this with the study team before ruling the study out.`,
      );
    }
    if (inInclusion.length) {
      add(
        "priorTreatments",
        "unknown",
        `The inclusion criteria mention ${inInclusion.join(", ")}. Prior therapy is sometimes required rather than disqualifying, and only the study team can say which applies.`,
      );
    }
    if (unmentioned.length) {
      add(
        "priorTreatments",
        "unknown",
        `${unmentioned.join(", ")} ${unmentioned.length === 1 ? "was" : "were"} not found in the eligibility text. That does not mean ${unmentioned.length === 1 ? "it is" : "they are"} acceptable, only that the text does not name ${unmentioned.length === 1 ? "it" : "them"}.`,
      );
    }
  }

  // --- Free-text criteria (never auto-interpreted) -------------------------
  add(
    "eligibilityCriteria",
    "unknown",
    trial.eligibilityCriteria
      ? "Detailed inclusion and exclusion criteria are published but are not evaluated automatically. They must be reviewed with the study team."
      : "The trial does not publish detailed eligibility criteria in a readable form.",
  );

  return {
    nctId: trial.nctId,
    matches: findings.filter((f) => f.kind === "match"),
    mismatches: findings.filter((f) => f.kind === "mismatch"),
    unknowns: findings.filter((f) => f.kind === "unknown"),
  };
}

/** Standard wording reused wherever an analysis is surfaced. */
export const ELIGIBILITY_DISCLAIMER =
  "TrialBridge does not determine eligibility and does not provide medical advice. These observations compare self-entered information against published trial data only. Final eligibility can be determined only by the clinical-trial investigators after medical screening.";
