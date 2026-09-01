import { CANCERS, type CancerEntry } from "./cancers";
import { NET_TREATMENTS, type NetTreatment } from "./net-treatments";

/**
 * Name resolution for the two catalogues.
 *
 * Kept out of `cancers.ts` and `net-treatments.ts` because those are generated
 * from the supplied workbooks and are overwritten whenever the import script
 * runs.
 *
 * These resolvers exist for the agent surface. A visiting agent relays what the
 * person said — "AML", "Afinitor", "small cell lung cancer" — and should not
 * have to know this app's slugs to set a value the human form can set.
 *
 * Matching is exact after normalisation, never fuzzy or partial. "lung cancer"
 * resolving to whichever lung entry sorts first would silently search for the
 * wrong disease; being told nothing matched is far better than being quietly
 * given someone else's cancer.
 */

/** Lower-cases and reduces every run of non-alphanumerics to a single space. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolves what someone called their cancer to a catalogue entry.
 *
 * Accepts the canonical id, the display label, the workbook's original wording,
 * the query term, or any curated alias.
 */
export function resolveCancer(value: string): CancerEntry | undefined {
  const needle = normalize(value);
  if (!needle) return undefined;

  return CANCERS.find((c) =>
    [c.id, c.label, c.sourceLabel, c.query, ...c.aliases].some(
      (candidate) => normalize(candidate) === needle,
    ),
  );
}

/**
 * Resolves what someone called a treatment to a catalogue entry.
 *
 * Accepts the catalogue id, the generic name, or any brand name the workbook
 * supplied. A parenthesised alternative in the name answers on its own, so
 * "Fluorouracil (5-FU)" is found by either half.
 */
export function resolveTreatment(value: string): NetTreatment | undefined {
  const needle = normalize(value);
  if (!needle) return undefined;

  return NET_TREATMENTS.find((t) => {
    const parenthesised = t.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const names = parenthesised ? [t.name, parenthesised[1], parenthesised[2]] : [t.name];
    return [t.id, ...names, ...t.brands].some((candidate) => normalize(candidate) === needle);
  });
}
