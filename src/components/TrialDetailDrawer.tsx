"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTrialDetail } from "@/lib/actions";
import type { Trial } from "@/lib/ctgov/types";
import { ELIGIBILITY_DISCLAIMER, analyzeTrial } from "@/lib/match";
import { useTrialStore } from "@/lib/store";
import { Findings } from "./Findings";
import { Badge, Button, StatusBadge, formatTimestamp, phaseLabel } from "./primitives";

/** How many sites to show before asking. */
const LOCATION_PREVIEW_COUNT = 5;

/**
 * Full record for one study, including verbatim eligibility criteria.
 *
 * Opened by the human via "View eligibility criteria" and by the agent via the
 * `get_trial_details` tool, so the person can see exactly which study an agent
 * is reasoning about at any moment.
 */
export function TrialDetailDrawer() {
  const openTrialId = useTrialStore((s) => s.openTrialId);
  const setOpenTrialId = useTrialStore((s) => s.setOpenTrialId);
  const detailCache = useTrialStore((s) => s.detailCache);
  const profile = useTrialStore((s) => s.profile);
  const shortlist = useTrialStore((s) => s.shortlist);
  const addToShortlist = useTrialStore((s) => s.addToShortlist);
  const removeFromShortlist = useTrialStore((s) => s.removeFromShortlist);

  // The failure is stored against the study it belongs to, so switching
  // studies clears it without an extra state reset inside the effect.
  const [failure, setFailure] = useState<{ nctId: string; message: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Keyed to the study rather than a plain boolean, so opening a different
  // study collapses the list again without an effect that resets state.
  const [locationsExpandedFor, setLocationsExpandedFor] = useState<string | null>(null);
  const showAllLocations = locationsExpandedFor === openTrialId;

  const trial: Trial | null = openTrialId ? (detailCache[openTrialId] ?? null) : null;

  // Nearest first, so the preview shows the sites that actually matter.
  const sortedLocations = useMemo(
    () =>
      (trial?.locations ?? [])
        .slice()
        .sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9)),
    [trial],
  );
  const hiddenLocationCount = Math.max(0, sortedLocations.length - LOCATION_PREVIEW_COUNT);
  const error = failure && failure.nctId === openTrialId ? failure.message : null;
  // Derived rather than stored: if the record is neither cached nor failed,
  // a fetch for it is necessarily still in flight.
  const loading = Boolean(openTrialId) && !trial?.eligibilityCriteria && !error;

  // Load the record if it is not already cached with full criteria.
  useEffect(() => {
    if (!openTrialId) return;
    const cached = useTrialStore.getState().detailCache[openTrialId];
    if (cached?.eligibilityCriteria) return;

    let cancelled = false;
    fetchTrialDetail(openTrialId).catch((e: unknown) => {
      if (cancelled) return;
      setFailure({
        nctId: openTrialId,
        message: e instanceof Error ? e.message : "Could not load this study.",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [openTrialId]);

  // Close on Escape, and move focus into the dialog when it opens.
  useEffect(() => {
    if (!openTrialId) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenTrialId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openTrialId, setOpenTrialId]);

  const analysis = useMemo(
    () => (trial ? analyzeTrial(trial, profile) : null),
    [trial, profile],
  );

  if (!openTrialId) return null;

  const isShortlisted = shortlist.some((e) => e.trial.nctId === openTrialId);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpenTrialId(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-detail-heading"
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-tb-surface shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-tb-border bg-tb-surface px-4 py-3">
          <div className="min-w-0">
            <h2 id="trial-detail-heading" className="text-sm font-semibold leading-snug">
              {trial?.briefTitle ?? openTrialId}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-tb-muted">{openTrialId}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpenTrialId(null)}
            className="shrink-0 rounded-lg border border-tb-border-strong bg-tb-surface px-3 py-1.5 text-sm font-medium hover:bg-tb-surface-2"
          >
            Close
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          {loading ? (
            <p role="status" className="text-sm text-tb-muted">
              Loading the full record from ClinicalTrials.gov…
            </p>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-tb-mismatch/40 bg-tb-mismatch-soft px-3 py-2"
            >
              <p className="text-xs font-medium text-tb-mismatch">Could not load this study</p>
              <p className="mt-1 text-[11px]">{error}</p>
              <a
                className="mt-2 inline-block text-[11px] text-tb-accent underline"
                href={`https://clinicaltrials.gov/study/${openTrialId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {openTrialId} on ClinicalTrials.gov ↗
              </a>
            </div>
          ) : trial ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={trial.overallStatus} />
                <Badge tone="accent">{phaseLabel(trial.phases)}</Badge>
                {trial.studyType ? <Badge>{trial.studyType.toLowerCase()}</Badge> : null}
                {trial.enrollmentCount !== null ? (
                  <Badge>{trial.enrollmentCount} participants planned</Badge>
                ) : null}
              </div>

              {trial.officialTitle ? (
                <p className="text-xs leading-relaxed text-tb-muted">{trial.officialTitle}</p>
              ) : null}

              {analysis ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold">How this compares to your details</h3>
                  <Findings analysis={analysis} />
                  <p className="mt-2 text-[11px] text-tb-muted">{ELIGIBILITY_DISCLAIMER}</p>
                </section>
              ) : null}

              {trial.briefSummary ? (
                <section>
                  <h3 className="mb-1 text-xs font-semibold">Brief summary</h3>
                  <p className="text-[11px] leading-relaxed whitespace-pre-line text-tb-text/85">
                    {trial.briefSummary}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="mb-1 text-xs font-semibold">
                  Eligibility criteria (verbatim from ClinicalTrials.gov)
                </h3>
                {trial.eligibilityCriteria ? (
                  // No max-height here: a scrollable box inside an already
                  // scrollable dialog produces two scrollbars and makes long
                  // criteria genuinely hard to read. The dialog itself scrolls.
                  <pre className="rounded-lg border border-tb-border bg-tb-surface-2 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {trial.eligibilityCriteria}
                  </pre>
                ) : (
                  <p className="text-[11px] text-tb-muted">
                    This study does not publish detailed criteria in a readable form.
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-tb-muted">
                  Criteria are shown exactly as published. TrialBridge does not interpret them.
                  Ages {trial.minimumAge ?? "not stated"} to {trial.maximumAge ?? "not stated"} ·
                  Sex: {trial.sex ?? "not stated"} · Accepts healthy volunteers:{" "}
                  {trial.healthyVolunteers === null
                    ? "not stated"
                    : trial.healthyVolunteers
                      ? "yes"
                      : "no"}
                </p>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-semibold">
                  Study locations ({trial.locations.length})
                </h3>
                {trial.locations.length ? (
                  <>
                    {/*
                      Some studies publish nearly 200 sites. Rendering them all
                      buried the actions below and needed its own scrollbar, so
                      only the nearest few are shown until asked for.
                    */}
                    <ul className="space-y-1">
                      {sortedLocations
                        .slice(0, showAllLocations ? undefined : LOCATION_PREVIEW_COUNT)
                        .map((l, i) => (
                          <li
                            key={`${l.facility ?? "site"}-${i}`}
                            className="rounded border border-tb-border px-2 py-1 text-[11px]"
                          >
                            <span className="font-medium">{l.facility ?? "Unnamed site"}</span>
                            <span className="text-tb-muted">
                              {" — "}
                              {[l.city, l.state, l.country].filter(Boolean).join(", ")}
                              {l.distanceMiles !== null ? ` · ~${l.distanceMiles} mi` : ""}
                              {l.status ? ` · ${l.status.toLowerCase().replace(/_/g, " ")}` : ""}
                            </span>
                          </li>
                        ))}
                    </ul>
                    {hiddenLocationCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLocationsExpandedFor(showAllLocations ? null : openTrialId)
                        }
                        aria-expanded={showAllLocations}
                        className="mt-1.5 text-[11px] font-medium text-tb-accent underline underline-offset-2"
                      >
                        {showAllLocations
                          ? "Show fewer locations"
                          : `Show all ${trial.locations.length} locations`}
                      </button>
                    ) : null}
                    {!showAllLocations && hiddenLocationCount > 0 ? (
                      <p className="mt-1 text-[11px] text-tb-muted">
                        Showing the {LOCATION_PREVIEW_COUNT} nearest of {trial.locations.length}{" "}
                        published sites.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[11px] text-tb-muted">No locations are published.</p>
                )}
              </section>

              <section className="text-[11px] text-tb-muted">
                <p>
                  Sponsor: {trial.leadSponsor ?? "not stated"}
                  {trial.collaborators.length
                    ? ` · Collaborators: ${trial.collaborators.join(", ")}`
                    : ""}
                </p>
                <p className="mt-0.5">
                  Registry last updated: {trial.lastUpdatePostDate ?? "not stated"} · Retrieved by
                  TrialBridge: {formatTimestamp(trial.retrievedAt)}
                </p>
              </section>

              <div className="flex flex-wrap gap-2 border-t border-tb-border pt-3">
                {isShortlisted ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => removeFromShortlist(trial.nctId)}
                  >
                    Remove from shortlist
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => addToShortlist(trial, null, "human")}
                  >
                    Add to shortlist
                  </Button>
                )}
                <a
                  href={trial.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg border border-tb-border-strong px-3 py-1.5 text-sm font-medium text-tb-accent"
                >
                  Full record on ClinicalTrials.gov ↗
                </a>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
