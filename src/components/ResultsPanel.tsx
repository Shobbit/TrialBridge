"use client";

import { useTrialStore } from "@/lib/store";
import { TrialCard } from "./TrialCard";
import { Badge, EmptyState, Panel, formatTimestamp } from "./primitives";

/** Skeleton rows shown while a search is in flight. */
function LoadingResults() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Searching ClinicalTrials.gov…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-tb-border bg-tb-surface p-4">
          <div className="h-4 w-24 rounded bg-tb-surface-2" />
          <div className="mt-3 h-4 w-3/4 rounded bg-tb-surface-2" />
          <div className="mt-2 h-3 w-1/2 rounded bg-tb-surface-2" />
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="h-16 rounded bg-tb-surface-2" />
            <div className="h-16 rounded bg-tb-surface-2" />
            <div className="h-16 rounded bg-tb-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsPanel() {
  const results = useTrialStore((s) => s.results);
  const meta = useTrialStore((s) => s.resultsMeta);
  const searchState = useTrialStore((s) => s.searchState);
  const searchError = useTrialStore((s) => s.searchError);

  return (
    <Panel
      id="results"
      title="Search results"
      description={
        meta ? (
          <>
            Source:{" "}
            <a
              className="text-tb-accent underline underline-offset-2"
              href="https://clinicaltrials.gov/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ClinicalTrials.gov
            </a>{" "}
            API v2 · Retrieved {formatTimestamp(meta.retrievedAt)}
          </>
        ) : (
          "Live data from the ClinicalTrials.gov API v2."
        )
      }
      action={
        meta ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="accent">
              Showing {meta.returnedCount}
              {meta.totalCount !== null ? ` of ${meta.totalCount.toLocaleString()}` : ""}
            </Badge>
            {meta.resolvedLocation ? (
              <Badge>Centred on {meta.resolvedLocation.label.split(",")[0]}</Badge>
            ) : null}
          </div>
        ) : null
      }
    >
      {meta?.warnings.length ? (
        <div
          role="status"
          className="mb-3 rounded-lg border border-tb-unknown/30 bg-tb-unknown-soft px-3 py-2 text-[11px] text-tb-unknown"
        >
          {meta.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      ) : null}

      {searchState === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-tb-mismatch/40 bg-tb-mismatch-soft px-4 py-3"
        >
          <p className="text-sm font-medium text-tb-mismatch">The search could not be completed</p>
          <p className="mt-1 text-xs text-tb-text/80">{searchError}</p>
          <p className="mt-2 text-[11px] text-tb-muted">
            ClinicalTrials.gov is a public service with no guaranteed availability. If this
            persists, you can search the registry directly at clinicaltrials.gov.
          </p>
        </div>
      ) : searchState === "loading" ? (
        <LoadingResults />
      ) : results.length ? (
        <div className="space-y-3">
          {results.map((trial) => (
            <TrialCard key={trial.nctId} trial={trial} />
          ))}
        </div>
      ) : searchState === "success" ? (
        <EmptyState title="No studies matched those criteria">
          Try widening the travel distance, removing the phase filter, including more recruitment
          statuses, or using a broader term for the condition.
        </EmptyState>
      ) : (
        <EmptyState title="No search has run yet">
          Fill in at least a condition above and select “Search trials”, or ask a connected browser
          agent to search on your behalf.
        </EmptyState>
      )}
    </Panel>
  );
}
