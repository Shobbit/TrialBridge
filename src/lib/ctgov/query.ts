import type { SearchInput } from "../schemas";

export const CTGOV_API_BASE = "https://clinicaltrials.gov/api/v2";

/**
 * Fields requested from the upstream search endpoint.
 *
 * Restricting the field set keeps payloads small enough to stay well inside
 * ClinicalTrials.gov's informal rate limits, and guarantees every attribute the
 * UI renders is actually present in the response.
 */
export const SEARCH_FIELDS = [
  "protocolSection.identificationModule",
  "protocolSection.statusModule",
  "protocolSection.sponsorCollaboratorsModule",
  "protocolSection.descriptionModule",
  "protocolSection.conditionsModule",
  "protocolSection.designModule",
  "protocolSection.armsInterventionsModule",
  "protocolSection.eligibilityModule",
  "protocolSection.contactsLocationsModule",
].join(",");

export interface BuildSearchUrlOptions {
  input: SearchInput;
  /** Curated query term for the selected cancer, when one was chosen. */
  cancerQuery?: string | null;
  /** Resolved coordinates for the geo filter; omitted when geocoding failed. */
  origin?: { lat: number; lon: number } | null;
}

/**
 * Escapes Essie query-syntax metacharacters so free text from the user cannot
 * alter the structure of the upstream query.
 */
function escapeEssie(term: string): string {
  return term.replace(/["()\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Builds the ClinicalTrials.gov v2 `/studies` URL.
 *
 * Notes on the upstream API, verified against the live service:
 *  - `filter.overallStatus` accepts pipe-separated enum values.
 *  - `filter.advanced` accepts Essie `AREA[Phase]` expressions; multiple
 *    phases are OR'd inside parentheses.
 *  - `filter.geo` uses `distance(lat,lon,<n>mi)` and requires coordinates,
 *    so we fall back to `query.locn` text matching when geocoding fails.
 *  - Only "simple" CORS requests succeed: an `OPTIONS` preflight is rejected
 *    with 403, so no custom request headers may ever be added browser-side.
 */
export function buildSearchUrl({ input, origin, cancerQuery }: BuildSearchUrlOptions): string {
  const url = new URL(`${CTGOV_API_BASE}/studies`);
  const params = url.searchParams;

  params.set("format", "json");
  params.set("countTotal", "true");
  params.set("pageSize", String(input.pageSize ?? 20));
  params.set("fields", SEARCH_FIELDS);
  // A selected cancer carries a curated query term; the free-text fallback
  // uses whatever was typed.
  params.set("query.cond", escapeEssie(cancerQuery ?? input.condition));

  /*
   * Stage is deliberately NOT sent upstream. ClinicalTrials.gov has no stage
   * field, so adding it to query.term only biased the free-text search - it cut
   * the candidate pool by about a third and removed studies that state no
   * stage, before the local "keep unknown stage" rule could run. Stage is
   * filtered locally instead.
   */
  const terms: string[] = [];
  if (input.keywords) terms.push(escapeEssie(input.keywords));
  if (input.intervention) terms.push(escapeEssie(input.intervention));
  if (terms.length) params.set("query.term", terms.join(" "));

  if (input.recruitmentStatuses?.length) {
    params.set("filter.overallStatus", input.recruitmentStatuses.join("|"));
  }

  if (input.phases?.length) {
    const expr = input.phases.map((p) => `AREA[Phase]${p}`).join(" OR ");
    params.set("filter.advanced", input.phases.length > 1 ? `(${expr})` : expr);
  }

  if (origin && input.travelDistanceMiles) {
    params.set(
      "filter.geo",
      `distance(${origin.lat.toFixed(5)},${origin.lon.toFixed(5)},${input.travelDistanceMiles}mi)`,
    );
  } else {
    // No coordinates: fall back to matching the location text instead of
    // silently dropping the user's location preference entirely.
    const locn = [input.city, input.state, input.country].filter(Boolean).join(" ");
    if (locn) params.set("query.locn", escapeEssie(locn));
  }

  if (input.pageToken) params.set("pageToken", input.pageToken);

  return url.toString();
}

export function buildStudyUrl(nctId: string): string {
  return `${CTGOV_API_BASE}/studies/${encodeURIComponent(nctId)}?format=json`;
}
