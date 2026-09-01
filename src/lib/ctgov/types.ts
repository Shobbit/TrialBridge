import type { PriorTreatmentAssessment } from "./prior-treatment";
import type { StageRequirement } from "./stage";

/**
 * Normalised, UI- and agent-facing shapes.
 *
 * The raw ClinicalTrials.gov v2 payload is deeply nested and every field is
 * optional in practice, so we normalise once at the edge (see `normalize.ts`)
 * and every consumer works with these flat types instead.
 */

/**
 * Every status ClinicalTrials.gov can report.
 *
 * This list stays complete because it is what we *display*: a study that is
 * already shortlisted can later be terminated or completed, and hiding that
 * would be worse than showing it. `normalizeStudy` validates against this list,
 * and the UI renders whatever comes back.
 */
export const RECRUITMENT_STATUSES = [
  "RECRUITING",
  "NOT_YET_RECRUITING",
  "ENROLLING_BY_INVITATION",
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "SUSPENDED",
  "TERMINATED",
  "WITHDRAWN",
  "UNKNOWN",
] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

/**
 * The only statuses a *search* may filter on.
 *
 * TrialBridge is for people trying to enrol now, so searching for completed,
 * terminated, withdrawn, suspended or active-not-recruiting studies would
 * generate work with no route to enrolment. `ENROLLING_BY_INVITATION` is
 * excluded as well: participants cannot refer themselves into those studies,
 * so offering them would mislead.
 *
 * `RECRUITING` is the only searchable status. Everything else — including
 * `NOT_YET_RECRUITING`, which was previously offered as an advanced choice —
 * cannot enrol someone today, and nobody searching this app is looking for a
 * study they cannot join.
 *
 * This restriction applies to searching only. `get_trial_details` retrieves any
 * valid NCT record whatever its status, and a study already on the shortlist
 * still displays its true status if that later changes.
 */
export const SEARCHABLE_RECRUITMENT_STATUSES = ["RECRUITING"] as const;
export type SearchableRecruitmentStatus = (typeof SEARCHABLE_RECRUITMENT_STATUSES)[number];

/** Applied when a caller omits the status filter entirely. */
export const DEFAULT_SEARCH_STATUS: SearchableRecruitmentStatus = "RECRUITING";

export const TRIAL_PHASES = [
  "EARLY_PHASE1",
  "PHASE1",
  "PHASE2",
  "PHASE3",
  "PHASE4",
  "NA",
] as const;
export type TrialPhase = (typeof TRIAL_PHASES)[number];

export const SEX_ELIGIBILITY = ["ALL", "MALE", "FEMALE"] as const;
export type SexEligibility = (typeof SEX_ELIGIBILITY)[number];

export interface TrialLocation {
  facility: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  status: string | null;
  lat: number | null;
  lon: number | null;
  /** Straight-line miles from the profile location, when both are known. */
  distanceMiles: number | null;
}

export interface TrialIntervention {
  type: string | null;
  name: string;
  description: string | null;
}

export interface Trial {
  nctId: string;
  briefTitle: string;
  officialTitle: string | null;
  overallStatus: RecruitmentStatus | "UNKNOWN";
  statusVerifiedDate: string | null;
  conditions: string[];
  interventions: TrialIntervention[];
  phases: TrialPhase[];
  studyType: string | null;
  enrollmentCount: number | null;
  minimumAge: string | null;
  maximumAge: string | null;
  /** Parsed from `minimumAge` into whole years; null when absent/unparseable. */
  minimumAgeYears: number | null;
  maximumAgeYears: number | null;
  sex: SexEligibility | null;
  healthyVolunteers: boolean | null;
  stdAges: string[];
  eligibilityCriteria: string | null;
  briefSummary: string | null;
  detailedDescription: string | null;
  leadSponsor: string | null;
  collaborators: string[];
  locations: TrialLocation[];
  /** Closest known location to the profile, when distance is computable. */
  nearestLocationMiles: number | null;
  lastUpdatePostDate: string | null;
  startDate: string | null;
  completionDate: string | null;
  /** Canonical public record. Always populated. */
  sourceUrl: string;
  /** ISO-8601 timestamp of the fetch that produced this object. */
  retrievedAt: string;
  /**
   * Stages this study appears to accept, read from its conditions and
   * inclusion criteria. Empty when the study states none.
   */
  stageRequirement: StageRequirement;
  /**
   * How this study's published exclusion criteria read against the treatments
   * the person entered.
   *
   * Optional because it depends on the profile, not on the registry record:
   * `normalizeStudy` never sets it, and it is absent whenever no treatments
   * were supplied. Absent means "not screened", never "clear".
   */
  priorTreatment?: PriorTreatmentAssessment;
}

export interface SearchMeta {
  totalCount: number | null;
  returnedCount: number;
  /** Studies dropped because they were not about the searched condition. */
  removedOffTopic: number;
  /** Studies dropped because they state a stage that excludes the one entered. */
  removedByStage: number;
  /**
   * Studies moved out of the main list because an exclusion criterion names a
   * treatment the person has had. They are returned in `hiddenTrials`, not
   * discarded, so the person can always read them.
   */
  hiddenByPriorTreatment: number;
  nextPageToken: string | null;
  retrievedAt: string;
  /** The exact upstream URL used, so results are auditable. */
  upstreamUrl: string;
  /** Populated when a place name was resolved to coordinates. */
  resolvedLocation: {
    label: string;
    lat: number;
    lon: number;
  } | null;
  /** Non-fatal problems (e.g. geocoding failed, so distance filter skipped). */
  warnings: string[];
}

export interface SearchResponse {
  trials: Trial[];
  /**
   * Trials withheld from the main list by the prior-treatment screen.
   *
   * Sent with the response rather than requiring a second request, so "Show
   * possibly excluded trials" is instant and the person is never left guessing
   * what was withheld.
   */
  hiddenTrials: Trial[];
  meta: SearchMeta;
}
