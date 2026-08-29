import { z } from "zod";
import { RECRUITMENT_STATUSES, TRIAL_PHASES } from "./ctgov/types";

/**
 * Validation schemas shared by the HTTP routes, the React form and the WebMCP
 * tool handlers. Keeping one definition means an agent cannot push a value
 * through a tool that a human could not have typed into the form.
 */

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
  recruitmentStatuses: z.array(z.enum(RECRUITMENT_STATUSES)).max(9),
  phases: z.array(z.enum(TRIAL_PHASES)).max(6),
  // Committed atomically via the "Add" button, so trimming is safe here.
  priorTreatments: z.array(z.string().trim().max(120)).max(25),
  keywords: z.string().max(200),
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
  recruitmentStatuses: profileFields.recruitmentStatuses.default(["RECRUITING"]),
  phases: profileFields.phases.default([]),
  priorTreatments: profileFields.priorTreatments.default([]),
  keywords: profileFields.keywords.default(""),
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
  condition: z.string().trim().min(1, "A condition or diagnosis is required").max(200),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(100).nullish(),
  country: z.string().trim().max(100).nullish(),
  travelDistanceMiles: z.number().int().min(1).max(3000).nullish(),
  recruitmentStatuses: z.array(z.enum(RECRUITMENT_STATUSES)).max(9).optional(),
  phases: z.array(z.enum(TRIAL_PHASES)).max(6).optional(),
  intervention: z.string().trim().max(120).nullish(),
  keywords: z.string().trim().max(200).nullish(),
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
