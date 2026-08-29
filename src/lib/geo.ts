const EARTH_RADIUS_MILES = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in statute miles.
 *
 * Straight-line only: it deliberately ignores roads, borders and travel time,
 * so it is presented in the UI as "approximate straight-line distance".
 */
export function haversineMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isFiniteCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/**
 * Parses a ClinicalTrials.gov age string ("18 Years", "6 Months", "30 Days")
 * into whole years. Returns null when the value is absent or unrecognised,
 * which callers must treat as "unknown", never as "no limit".
 */
export function parseAgeToYears(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(year|month|week|day|hour|minute)s?$/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  switch (m[2].toLowerCase()) {
    case "year":
      return value;
    case "month":
      return value / 12;
    case "week":
      return value / 52.1775;
    case "day":
      return value / 365.25;
    case "hour":
      return value / (365.25 * 24);
    case "minute":
      return value / (365.25 * 24 * 60);
    default:
      return null;
  }
}
