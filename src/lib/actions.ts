"use client";

import type { SearchResponse, Trial } from "./ctgov/types";
import type { SearchInput } from "./schemas";
import { useTrialStore } from "./store";

/**
 * Application actions shared by the human interface and the WebMCP tools.
 *
 * Both entry points call exactly these functions, so a tool call and a button
 * click produce identical state transitions. This is what guarantees the
 * requirement that agent activity is immediately visible on screen.
 */

export class ActionError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

async function readError(response: Response, fallback: string): Promise<ActionError> {
  try {
    const body = (await response.json()) as { error?: unknown; retryable?: unknown };
    const message = typeof body.error === "string" ? body.error : fallback;
    return new ActionError(message, body.retryable === true);
  } catch {
    return new ActionError(fallback, response.status >= 500);
  }
}

/**
 * Runs a search against the proxy route and writes the results into the store.
 *
 * Sets `searchState` to "loading" first and to "error" on failure, so every
 * caller gets the loading and error UI without extra work.
 */
export async function runSearch(input: SearchInput): Promise<SearchResponse> {
  const store = useTrialStore.getState();
  store.setSearchState("loading");

  let response: Response;
  try {
    response = await fetch("/api/trials/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    const error = new ActionError(
      "Could not reach the TrialBridge search service. Check your connection and try again.",
      true,
    );
    store.setSearchState("error", error.message);
    throw error;
  }

  if (!response.ok) {
    const error = await readError(response, "The search could not be completed.");
    store.setSearchState("error", error.message);
    throw error;
  }

  const data = (await response.json()) as SearchResponse;
  useTrialStore.getState().setResults(data.trials, data.meta, data.hiddenTrials ?? []);
  return data;
}

/**
 * Fetches one full study record, preferring the cache.
 *
 * @param force Bypasses the cache to re-read live data from ClinicalTrials.gov.
 */
export async function fetchTrialDetail(nctId: string, force = false): Promise<Trial> {
  const id = nctId.trim().toUpperCase();
  const store = useTrialStore.getState();

  if (!force) {
    const cached = store.detailCache[id];
    if (cached?.eligibilityCriteria) return cached;
  }

  const params = new URLSearchParams();
  const resolved = store.resultsMeta?.resolvedLocation;
  if (resolved) {
    params.set("lat", String(resolved.lat));
    params.set("lon", String(resolved.lon));
  }
  const qs = params.toString();

  let response: Response;
  try {
    response = await fetch(`/api/trials/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`);
  } catch {
    throw new ActionError("Could not reach the TrialBridge service to load trial details.", true);
  }

  if (!response.ok) {
    throw await readError(response, `Could not load details for ${id}.`);
  }

  const data = (await response.json()) as { trial: Trial };
  useTrialStore.getState().cacheDetail(data.trial);
  return data.trial;
}

/**
 * Finds a trial already known to the app (results, cache, or shortlist)
 * without going to the network.
 */
export function findKnownTrial(nctId: string): Trial | null {
  const id = nctId.trim().toUpperCase();
  const { results, detailCache, shortlist } = useTrialStore.getState();
  return (
    detailCache[id] ??
    results.find((t) => t.nctId === id) ??
    shortlist.find((e) => e.trial.nctId === id)?.trial ??
    null
  );
}

/** Resolves a trial from local state, falling back to a live fetch. */
export async function resolveTrial(nctId: string): Promise<Trial> {
  const known = findKnownTrial(nctId);
  if (known?.eligibilityCriteria) return known;
  return fetchTrialDetail(nctId);
}
