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
  const hiddenResults = useTrialStore((s) => s.hiddenResults);
  const showHiddenResults = useTrialStore((s) => s.showHiddenResults);
  const setShowHiddenResults = useTrialStore((s) => s.setShowHiddenResults);
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
      ) : results.length || hiddenResults.length ? (
        <div className="space-y-3">
          {results.map((trial) => (
            <TrialCard key={trial.nctId} trial={trial} />
          ))}

          {/*
            Withheld studies are disclosed, never silently dropped. The count
            and the reason are stated before the toggle, so someone who wants
            to judge for themselves always can.
          */}
          {hiddenResults.length ? (
            <div className="rounded-xl border border-dashed border-tb-border bg-tb-surface-2 p-4">
              <p className="text-xs font-semibold">
                {hiddenResults.length}{" "}
                {hiddenResults.length === 1 ? "study is" : "studies are"} not shown above
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-tb-muted">
                Each one publishes an exclusion criterion naming a treatment you entered, with no
                timing or condition attached. That is a strong signal, but it is not a decision:
                only the study team can confirm whether the criterion applies to you.
              </p>
              <button
                type="button"
                onClick={() => setShowHiddenResults(!showHiddenResults)}
                aria-expanded={showHiddenResults}
                className="mt-2 text-[11px] font-medium text-tb-accent underline underline-offset-2"
              >
                {showHiddenResults
                  ? "Hide possibly excluded trials"
                  : `Show possibly excluded trials (${hiddenResults.length})`}
              </button>

              {showHiddenResults ? (
                <div className="mt-3 space-y-3">
                  {hiddenResults.map((trial) => (
                    <TrialCard key={trial.nctId} trial={trial} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : searchState === "success" ? (
        <EmptyState title="No trials were returned for this search and its selected filters">
          Try widening the travel distance, removing the phase filter, choosing a broader cancer
          type, or clearing the stage. Nothing here means no suitable trial exists — only that this
          search returned none.
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
