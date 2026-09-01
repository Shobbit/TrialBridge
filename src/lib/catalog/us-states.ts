/**
 * United States states, the District of Columbia, and the five inhabited
 * territories.
 *
 * Hand-written rather than generated: this list has not changed since 1959 and
 * is not derived from either supplied workbook, so it does not belong with the
 * generated catalogues.
 *
 * `name` is the canonical stored value — the full name, not the two-letter
 * code — because that is the form ClinicalTrials.gov publishes in
 * `locations[].state`, the form the geocoder resolves most reliably, and the
 * form a person recognises. The code is kept for resolution, so an agent or a
 * saved profile carrying "IL" still finds Illinois.
 */

export interface UsState {
  /** USPS two-letter code. */
  code: string;
  /** Canonical name, as ClinicalTrials.gov publishes it. */
  name: string;
  kind: "state" | "territory";
  /**
   * Extra wordings accepted when resolving. The name and code are always
   * accepted and are not repeated here.
   */
  aliases: string[];
}

export const US_STATES: readonly UsState[] = [
  { code: "AL", name: "Alabama", kind: "state", aliases: [] },
  { code: "AK", name: "Alaska", kind: "state", aliases: [] },
  { code: "AZ", name: "Arizona", kind: "state", aliases: [] },
  { code: "AR", name: "Arkansas", kind: "state", aliases: [] },
  { code: "CA", name: "California", kind: "state", aliases: ["Calif"] },
  { code: "CO", name: "Colorado", kind: "state", aliases: [] },
  { code: "CT", name: "Connecticut", kind: "state", aliases: ["Conn"] },
  { code: "DE", name: "Delaware", kind: "state", aliases: [] },
  {
    code: "DC",
    name: "District of Columbia",
    kind: "state",
    // "Washington DC" must resolve here, while a bare "Washington" resolves to
    // the state — which it does, because that is the state's exact name.
    aliases: ["Washington DC", "Washington D.C.", "D.C."],
  },
  { code: "FL", name: "Florida", kind: "state", aliases: [] },
  { code: "GA", name: "Georgia", kind: "state", aliases: [] },
  { code: "HI", name: "Hawaii", kind: "state", aliases: [] },
  { code: "ID", name: "Idaho", kind: "state", aliases: [] },
  { code: "IL", name: "Illinois", kind: "state", aliases: ["Ill"] },
  { code: "IN", name: "Indiana", kind: "state", aliases: [] },
  { code: "IA", name: "Iowa", kind: "state", aliases: [] },
  { code: "KS", name: "Kansas", kind: "state", aliases: [] },
  { code: "KY", name: "Kentucky", kind: "state", aliases: [] },
  { code: "LA", name: "Louisiana", kind: "state", aliases: [] },
  { code: "ME", name: "Maine", kind: "state", aliases: [] },
  { code: "MD", name: "Maryland", kind: "state", aliases: [] },
  { code: "MA", name: "Massachusetts", kind: "state", aliases: ["Mass"] },
  { code: "MI", name: "Michigan", kind: "state", aliases: [] },
  { code: "MN", name: "Minnesota", kind: "state", aliases: ["Minn"] },
  { code: "MS", name: "Mississippi", kind: "state", aliases: [] },
  { code: "MO", name: "Missouri", kind: "state", aliases: [] },
  { code: "MT", name: "Montana", kind: "state", aliases: [] },
  { code: "NE", name: "Nebraska", kind: "state", aliases: [] },
  { code: "NV", name: "Nevada", kind: "state", aliases: [] },
  { code: "NH", name: "New Hampshire", kind: "state", aliases: [] },
  { code: "NJ", name: "New Jersey", kind: "state", aliases: [] },
  { code: "NM", name: "New Mexico", kind: "state", aliases: [] },
  { code: "NY", name: "New York", kind: "state", aliases: [] },
  { code: "NC", name: "North Carolina", kind: "state", aliases: [] },
  { code: "ND", name: "North Dakota", kind: "state", aliases: [] },
  { code: "OH", name: "Ohio", kind: "state", aliases: [] },
  { code: "OK", name: "Oklahoma", kind: "state", aliases: [] },
  { code: "OR", name: "Oregon", kind: "state", aliases: [] },
  { code: "PA", name: "Pennsylvania", kind: "state", aliases: ["Penn"] },
  { code: "RI", name: "Rhode Island", kind: "state", aliases: [] },
  { code: "SC", name: "South Carolina", kind: "state", aliases: [] },
  { code: "SD", name: "South Dakota", kind: "state", aliases: [] },
  { code: "TN", name: "Tennessee", kind: "state", aliases: ["Tenn"] },
  { code: "TX", name: "Texas", kind: "state", aliases: [] },
  { code: "UT", name: "Utah", kind: "state", aliases: [] },
  { code: "VT", name: "Vermont", kind: "state", aliases: [] },
  { code: "VA", name: "Virginia", kind: "state", aliases: [] },
  { code: "WA", name: "Washington", kind: "state", aliases: ["Washington State"] },
  { code: "WV", name: "West Virginia", kind: "state", aliases: [] },
  { code: "WI", name: "Wisconsin", kind: "state", aliases: ["Wisc"] },
  { code: "WY", name: "Wyoming", kind: "state", aliases: [] },

  { code: "PR", name: "Puerto Rico", kind: "territory", aliases: [] },
  { code: "GU", name: "Guam", kind: "territory", aliases: [] },
  {
    code: "VI",
    name: "U.S. Virgin Islands",
    kind: "territory",
    aliases: ["Virgin Islands", "US Virgin Islands", "USVI"],
  },
  { code: "AS", name: "American Samoa", kind: "territory", aliases: [] },
  {
    code: "MP",
    name: "Northern Mariana Islands",
    kind: "territory",
    aliases: ["CNMI", "Commonwealth of the Northern Mariana Islands"],
  },
] as const;

/** Lower-cases and reduces every run of non-alphanumerics to a single space. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Wordings that mean the United States.
 *
 * The country field stays free text so someone can search anywhere, which
 * means this has to tolerate the handful of spellings a person actually types.
 * Anything else is treated as another country, and the state field falls back
 * to free text — offering "Illinois" to someone in India would be nonsense.
 */
const UNITED_STATES_NAMES = new Set(
  [
    "united states",
    "united states of america",
    "usa",
    "us",
    "u s",
    "u s a",
    "america",
  ].map(normalize),
);

/** True when this country field means the United States. */
export function isUnitedStates(country: string): boolean {
  return UNITED_STATES_NAMES.has(normalize(country));
}

/**
 * Resolves what someone called a state to a catalogue entry.
 *
 * Accepts the full name, the USPS code, or a curated alias. Exact after
 * normalisation, never partial: "Virginia" must not be satisfied by "West
 * Virginia", and a half-remembered name is better refused than guessed.
 */
export function resolveUsState(value: string): UsState | undefined {
  const needle = normalize(value);
  if (!needle) return undefined;

  return US_STATES.find((s) =>
    [s.code, s.name, ...s.aliases].some((candidate) => normalize(candidate) === needle),
  );
}

/** The canonical name for a recognised state, or null. */
export function canonicalStateName(value: string): string | null {
  return resolveUsState(value)?.name ?? null;
}
