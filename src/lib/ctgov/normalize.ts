import { haversineMiles, isFiniteCoord, parseAgeToYears } from "../geo";
import { extractStageRequirement } from "./stage";
import {
  RECRUITMENT_STATUSES,
  SEX_ELIGIBILITY,
  TRIAL_PHASES,
  type RecruitmentStatus,
  type SexEligibility,
  type Trial,
  type TrialIntervention,
  type TrialLocation,
  type TrialPhase,
} from "./types";

/**
 * The upstream payload is untyped and every module is optional, so these
 * helpers read defensively: a missing branch yields null rather than throwing.
 * "Unknown" is a first-class outcome throughout this app, so we never
 * substitute a default that could be mistaken for real data.
 */
type Unknown = Record<string, unknown>;

const obj = (v: unknown): Unknown => (v && typeof v === "object" ? (v as Unknown) : {});

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export const trialUrl = (nctId: string) => `https://clinicaltrials.gov/study/${nctId}`;

export interface NormalizeOrigin {
  lat: number;
  lon: number;
}

/**
 * Converts one raw v2 study record into a `Trial`.
 *
 * @param origin When supplied, per-location and nearest-location distances are
 *               computed. Locations without coordinates keep `distanceMiles: null`.
 * @returns null when the record has no usable NCT id (which would make it
 *          impossible to link back to the source record).
 */
export function normalizeStudy(raw: unknown, origin?: NormalizeOrigin | null): Trial | null {
  const study = obj(raw);
  const protocol = obj(study.protocolSection);

  const identification = obj(protocol.identificationModule);
  const nctId = str(identification.nctId);
  if (!nctId) return null;

  const status = obj(protocol.statusModule);
  const sponsor = obj(protocol.sponsorCollaboratorsModule);
  const description = obj(protocol.descriptionModule);
  const conditionsModule = obj(protocol.conditionsModule);
  const design = obj(protocol.designModule);
  const armsInterventions = obj(protocol.armsInterventionsModule);
  const eligibility = obj(protocol.eligibilityModule);
  const contacts = obj(protocol.contactsLocationsModule);

  const locations: TrialLocation[] = (Array.isArray(contacts.locations) ? contacts.locations : [])
    .map((rawLoc): TrialLocation => {
      const loc = obj(rawLoc);
      const geo = obj(loc.geoPoint);
      const lat = num(geo.lat);
      const lon = num(geo.lon);
      const hasCoords = isFiniteCoord(lat, lon);
      return {
        facility: str(loc.facility),
        city: str(loc.city),
        state: str(loc.state),
        country: str(loc.country),
        zip: str(loc.zip),
        status: str(loc.status),
        lat: hasCoords ? lat : null,
        lon: hasCoords ? lon : null,
        distanceMiles:
          origin && hasCoords
            ? Math.round(haversineMiles(origin.lat, origin.lon, lat as number, lon as number) * 10) / 10
            : null,
      };
    });

  const measuredDistances = locations
    .map((l) => l.distanceMiles)
    .filter((d): d is number => d !== null);

  const interventions: TrialIntervention[] = (
    Array.isArray(armsInterventions.interventions) ? armsInterventions.interventions : []
  )
    .map((rawIntervention): TrialIntervention | null => {
      const item = obj(rawIntervention);
      const name = str(item.name);
      if (!name) return null;
      return { type: str(item.type), name, description: str(item.description) };
    })
    .filter((i): i is TrialIntervention => i !== null);

  const conditions = strArray(conditionsModule.conditions);

  const minimumAge = str(eligibility.minimumAge);
  const maximumAge = str(eligibility.maximumAge);

  return {
    nctId,
    briefTitle: str(identification.briefTitle) ?? nctId,
    officialTitle: str(identification.officialTitle),
    overallStatus:
      oneOf<RecruitmentStatus>(status.overallStatus, RECRUITMENT_STATUSES) ?? "UNKNOWN",
    statusVerifiedDate: str(status.statusVerifiedDate),
    conditions,
    interventions,
    phases: strArray(design.phases)
      .map((p) => oneOf<TrialPhase>(p, TRIAL_PHASES))
      .filter((p): p is TrialPhase => p !== null),
    studyType: str(design.studyType),
    enrollmentCount: num(obj(design.enrollmentInfo).count),
    minimumAge,
    maximumAge,
    minimumAgeYears: parseAgeToYears(minimumAge),
    maximumAgeYears: parseAgeToYears(maximumAge),
    sex: oneOf<SexEligibility>(eligibility.sex, SEX_ELIGIBILITY),
    healthyVolunteers:
      typeof eligibility.healthyVolunteers === "boolean" ? eligibility.healthyVolunteers : null,
    stdAges: strArray(eligibility.stdAges),
    eligibilityCriteria: str(eligibility.eligibilityCriteria),
    briefSummary: str(description.briefSummary),
    detailedDescription: str(description.detailedDescription),
    leadSponsor: str(obj(sponsor.leadSponsor).name),
    collaborators: (Array.isArray(sponsor.collaborators) ? sponsor.collaborators : [])
      .map((c) => str(obj(c).name))
      .filter((n): n is string => n !== null),
    locations,
    nearestLocationMiles: measuredDistances.length ? Math.min(...measuredDistances) : null,
    lastUpdatePostDate: str(obj(status.lastUpdatePostDateStruct).date),
    startDate: str(obj(status.startDateStruct).date),
    completionDate: str(obj(status.completionDateStruct).date),
    sourceUrl: trialUrl(nctId),
    retrievedAt: new Date().toISOString(),
    /*
     * Read from the conditions list and the inclusion half of the criteria
     * only. Exclusion text is left out deliberately: "patients with Stage IV
     * are excluded" must not be read as the study accepting Stage IV.
     */
    stageRequirement: extractStageRequirement(
      conditions,
      inclusionOnly(str(eligibility.eligibilityCriteria)),
    ),
  };
}

/**
 * Returns the text before any "Exclusion Criteria" heading.
 *
 * A blunt split is right here: everything after that heading describes who is
 * kept out, and reading a stage from it would invert the meaning.
 */
function inclusionOnly(criteria: string | null): string {
  if (!criteria) return "";
  const match = criteria.match(/^\s*(?:key\s+)?exclusion\s+criteria\s*:?\s*$/im);
  return match?.index !== undefined ? criteria.slice(0, match.index) : criteria;
}
