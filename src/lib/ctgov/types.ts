/**
 * Normalised, UI- and agent-facing shapes.
 *
 * The raw ClinicalTrials.gov v2 payload is deeply nested and every field is
 * optional in practice, so we normalise once at the edge (see `normalize.ts`)
 * and every consumer works with these flat types instead.
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
}

export interface SearchMeta {
  totalCount: number | null;
  returnedCount: number;
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
  meta: SearchMeta;
}
