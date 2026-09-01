import { z } from "zod";
import {
  DEFAULT_SEARCH_STATUS,
  SEARCHABLE_RECRUITMENT_STATUSES,
  TRIAL_PHASES,
} from "./ctgov/types";

/**
 * Validation schemas shared by the HTTP routes, the React form and the WebMCP
 * tool handlers. Keeping one definition means an agent cannot push a value
 * through a tool that a human could not have typed into the form.
 */

/**
 * Cancer stage, as patients are told it.
 *
 * ClinicalTrials.gov has no structured stage field - stage lives inside the
 * free-text eligibility criteria - so this is used to bias the query and to
 * flag where a study mentions the stage, never to compute eligibility.
 */
export const cancerStageSchema = z.enum([
  "unspecified",
  "0",
  "I",
  "II",
  "III",
  "IV",
]);
export type CancerStage = z.infer<typeof cancerStageSchema>;

/** Sex is collected only because trials themselves restrict on it. */
export const profileSexSchema = z.enum(["unspecified", "male", "female"]);

/**
 * Field definitions without defaults.
 *
 * Kept separate because Zod applies a field's `.default()` even after
 * `.partial()`. Deriving the update schema from a defaulted schema would make
 * `update_search_profile({ city })` silently reset every other field to its
 * default - so the two schemas are built from this shared, default-free base.
 */
const profileFields = {
  // Free-text fields are NOT trimmed here. The profile is re-parsed on every
  // keystroke, so trimming would swallow the space the moment it is typed and
  // turn "type 2 diabetes" into "type2diabetes". Whitespace is instead
  // normalised at the boundary where it matters: `searchInputSchema` trims,
  // and the Essie escaper collapses runs of whitespace.
  condition: z.string().max(200),
  age: z.number().int().min(0).max(120).nullable(),
  sex: profileSexSchema,
  city: z.string().max(100),
  state: z.string().max(100),
  country: z.string().max(100),
  travelDistanceMiles: z.number().int().min(1).max(3000).nullable(),
  // Searching is restricted to enrolling statuses — see
  // SEARCHABLE_RECRUITMENT_STATUSES. Unsupported values are rejected with an
  // explicit error rather than quietly dropped, so a caller always learns that
  // its filter was not honoured.
  recruitmentStatuses: z
    .array(z.enum(SEARCHABLE_RECRUITMENT_STATUSES))
    .max(SEARCHABLE_RECRUITMENT_STATUSES.length),
  phases: z.array(z.enum(TRIAL_PHASES)).max(6),
  // Committed atomically via the "Add" button, so trimming is safe here.
  priorTreatments: z.array(z.string().trim().max(120)).max(25),
  keywords: z.string().max(200),
  cancerStage: cancerStageSchema,
} as const;

/**
 * The complete profile, with defaults applied for anything absent.
 *
 * Deliberately excluded: name, email, date of birth, medical record number, or
 * any other direct identifier. Age is a whole number, not a birth date, so it
 * cannot be used to re-identify anyone.
 */
export const profileSchema = z.object({
  condition: profileFields.condition.default(""),
  age: profileFields.age.default(null),
  sex: profileFields.sex.default("unspecified"),
  city: profileFields.city.default(""),
  state: profileFields.state.default(""),
  country: profileFields.country.default("United States"),
  travelDistanceMiles: profileFields.travelDistanceMiles.default(100),
  recruitmentStatuses: profileFields.recruitmentStatuses.default([DEFAULT_SEARCH_STATUS]),
  phases: profileFields.phases.default([]),
  priorTreatments: profileFields.priorTreatments.default([]),
  keywords: profileFields.keywords.default(""),
  cancerStage: profileFields.cancerStage.default("unspecified"),
});

export type SearchProfile = z.infer<typeof profileSchema>;

/**
 * Fields an agent may write via `update_search_profile`.
 *
 * Every key is optional with no default, so an absent key means "leave this
 * field alone" rather than "reset it".
 */
export const profileUpdateSchema = z.object(profileFields).partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const EMPTY_PROFILE: SearchProfile = profileSchema.parse({});

/**
 * Inputs accepted by the search route and the `search_clinical_trials` tool.
 *
 * DATA MINIMISATION — `age` and `sex` are deliberately absent.
 *
 * ClinicalTrials.gov has no age or sex query filter that we want to use: hiding
 * a study because of a published age range would be the app making an
 * eligibility decision, which the product boundary forbids. Those two values are
 * therefore only ever used by `analyzeTrial`, which runs in the browser.
 *
 * Since the server has no use for them, they are never put on the wire at all.
 * The most sensitive fields in the profile never leave the device.
 */
export const searchInputSchema = z.object({
  /**
   * The selected cancer's catalogue id. When present it drives both the
   * upstream query and local relevance matching, using that entry's curated
   * aliases and conflicts.
   *
   * Absent only for the "Other cancer / not listed" fallback, where `condition`
   * carries the typed text instead.
   */
  cancerId: z.string().trim().max(80).nullish(),
  condition: z.string().trim().min(1, "A condition or diagnosis is required").max(200),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(100).nullish(),
  country: z.string().trim().max(100).nullish(),
  travelDistanceMiles: z.number().int().min(1).max(3000).nullish(),
  // Omitting this is not the same as "no filter": the route injects
  // DEFAULT_SEARCH_STATUS so a bare search can never return studies that are
  // closed to enrolment.
  recruitmentStatuses: z
    .array(z.enum(SEARCHABLE_RECRUITMENT_STATUSES))
    .min(1, "At least one recruitment status is required")
    .max(SEARCHABLE_RECRUITMENT_STATUSES.length)
    .optional(),
  phases: z.array(z.enum(TRIAL_PHASES)).max(6).optional(),
  intervention: z.string().trim().max(120).nullish(),
  keywords: z.string().trim().max(200).nullish(),
  cancerStage: cancerStageSchema.nullish(),
  pageSize: z.number().int().min(1).max(50).optional(),
  pageToken: z.string().trim().max(400).nullish(),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export const nctIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NCT\d{8}$/, "Must be an 8-digit NCT identifier, e.g. NCT01234567");

export const screeningQuestionSchema = z.object({
  question: z.string().trim().min(5).max(500),
  nctId: nctIdSchema.nullish(),
  rationale: z.string().trim().max(500).nullish(),
});

export interface ScreeningQuestion {
  id: string;
  question: string;
  nctId: string | null;
  rationale: string | null;
  createdAt: string;
  source: "agent" | "human";
}

// ---------------------------------------------------------------------------
// Pre-screening
// ---------------------------------------------------------------------------

/**
 * How the visiting agent characterises one answer against one criterion.
 *
 * TrialBridge cannot compute this — it performs no clinical interpretation of
 * free-text criteria. The agent supplies the comparison; this app stores it,
 * labels it as agent-assisted, and displays it beside the verbatim criterion.
 */
export const comparisonSchema = z.enum([
  "appears_consistent",
  "potential_conflict",
  "unresolved",
]);
export type Comparison = z.infer<typeof comparisonSchema>;

export const answerTypeSchema = z.enum(["text", "number", "boolean", "unknown", "skipped"]);
export type AnswerType = z.infer<typeof answerTypeSchema>;

/** Bounded so a single call cannot flood the session or the display. */
export const MAX_RESPONSES_PER_CALL = 10;

const responseBase = z.object({
  criterionId: z.string().trim().min(3).max(120),
  questionAsked: z.string().trim().min(5).max(400),
  patientAnswer: z.union([z.string().trim().max(400), z.number(), z.boolean(), z.null()]),
  answerType: answerTypeSchema,
  comparison: comparisonSchema,
  explanation: z.string().trim().min(5).max(600),
});

/**
 * A single recorded response.
 *
 * The refinement enforces the rule that makes this safe: an answer the person
 * did not actually give cannot support a conclusion. If the answer is unknown,
 * skipped, or absent, the comparison must stay `unresolved`. The contradiction
 * is rejected outright rather than silently corrected, so the agent is told
 * plainly and can restate its own reasoning.
 */
export const prescreeningResponseSchema = responseBase.refine(
  (r) => {
    const answerIsAbsent =
      r.answerType === "unknown" ||
      r.answerType === "skipped" ||
      r.patientAnswer === null ||
      (typeof r.patientAnswer === "string" && r.patientAnswer.length === 0);
    return !answerIsAbsent || r.comparison === "unresolved";
  },
  {
    message:
      "When answerType is 'unknown' or 'skipped', or patientAnswer is null or empty, comparison must be 'unresolved'. An answer that was not given cannot support 'appears_consistent' or 'potential_conflict'.",
    path: ["comparison"],
  },
);

export type PrescreeningResponseInput = z.infer<typeof prescreeningResponseSchema>;

export const recordResponsesInputSchema = z.object({
  nctId: nctIdSchema,
  responses: z.array(prescreeningResponseSchema).min(1).max(MAX_RESPONSES_PER_CALL),
});

/** A response as stored and displayed, with provenance attached. */
export interface PreScreeningResponse {
  criterionId: string;
  questionAsked: string;
  patientAnswer: string | number | boolean | null;
  answerType: AnswerType;
  comparison: Comparison;
  explanation: string;
  recordedAt: string;
}

export type ResponseStatus = "unanswered" | "answered" | "skipped";
