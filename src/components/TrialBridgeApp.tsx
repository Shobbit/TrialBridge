"use client";

import { useRef, useState } from "react";
import { useTrialStore } from "@/lib/store";
import { AgentStatus } from "./AgentStatus";
import { ComparisonView } from "./ComparisonView";
import { PreScreeningPanel } from "./PreScreeningPanel";
import { ProfileForm } from "./ProfileForm";
import { QuestionsPanel } from "./QuestionsPanel";
import { ResultsPanel } from "./ResultsPanel";
import { ShortlistBar } from "./ShortlistBar";
import { ShortlistPanel } from "./ShortlistPanel";
import { TrialDetailDrawer } from "./TrialDetailDrawer";
import { Button } from "./primitives";

/** Confirmation dialog for the irreversible "Clear my information" action. */
function ClearDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-heading"
        aria-describedby="clear-body"
        className="w-full max-w-md rounded-xl border border-tb-border bg-tb-surface p-5 shadow-2xl"
      >
        <h2 id="clear-heading" className="text-sm font-semibold">
          Clear everything from this browser?
        </h2>
        <p id="clear-body" className="mt-1.5 text-xs text-tb-muted">
          This permanently removes your search details, search results, shortlist, saved questions
          and any pre-screening session from this browser. TrialBridge stored no copy anywhere
          else. If you used a browser AI agent, anything you told it is held in that agent&rsquo;s
          own conversation history, which this button cannot reach.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} autoFocus>
            Clear everything
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The whole application shell.
 *
 * Rendered by the top-level page as a client component so that WebMCP tool
 * registration (inside `AgentStatus` → `useWebMcpRegistration`) runs on the
 * top-level document.
 */
export function TrialBridgeApp() {
  const clearEverything = useTrialStore((s) => s.clearEverything);
  const shortlistCount = useTrialStore((s) => s.shortlist.length);
  const [confirmClear, setConfirmClear] = useState(false);

  // Comparison is view state, not application data, so it stays in React and
  // is never persisted.
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const comparisonRef = useRef<HTMLElement>(null);
  const shortlistRef = useRef<HTMLDivElement>(null);

  // Derived rather than stored: if the shortlist drops below two studies the
  // comparison simply stops rendering, instead of stranding the user on a view
  // that no longer has anything to compare.
  const showComparison = comparisonOpen && shortlistCount >= 2;

  function openComparison() {
    setComparisonOpen(true);
    // Move focus as well as scroll: a keyboard user must land on the new view,
    // not be left at the bottom of the page they came from.
    requestAnimationFrame(() => {
      comparisonRef.current?.focus();
      comparisonRef.current?.scrollIntoView({ block: "start" });
    });
  }

  function closeComparison() {
    setComparisonOpen(false);
    requestAnimationFrame(() => {
      shortlistRef.current?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:py-10 lg:pb-28">
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">TrialBridge</h1>
          <p className="text-xs text-tb-muted">
            Explore clinical trials that may be relevant to you
          </p>
        </div>
      </header>

      {/* The disclaimer is placed above everything and is not dismissible. */}
      <div
        role="note"
        className="mb-5 rounded-xl border border-tb-mismatch/30 bg-tb-mismatch-soft px-4 py-3"
      >
        <h2 className="text-xs font-semibold text-tb-mismatch">
          This is not medical advice, and it cannot tell you whether you are eligible
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-tb-text/85">
          TrialBridge searches the public ClinicalTrials.gov registry and points out what appears to
          line up with the details you enter, what appears not to, and what remains unknown. It does
          not diagnose conditions, recommend treatment, or confirm eligibility.{" "}
          <strong>
            Final eligibility can be determined only by the clinical-trial investigators after
            medical screening.
          </strong>{" "}
          Never start, stop or change any treatment based on what you read here — talk to your own
          doctor.
        </p>
      </div>

      <div className="mb-5">
        <AgentStatus />
      </div>

      {/*
        The comparison is a full-width mode, not a panel inside the left column.
        A side-by-side table of several studies cannot be read in a half-width
        column: it forced horizontal scrolling inside an already narrow box.
        Here it gets the whole content width, and the results grid is hidden
        while it is open so there is one thing to read at a time.
      */}
      {showComparison ? (
        <section ref={comparisonRef} aria-labelledby="comparison-heading" tabIndex={-1}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="comparison-heading" className="text-base font-semibold">
              Comparing your shortlist
            </h2>
            <Button type="button" onClick={closeComparison}>
              ← Back to results
            </Button>
          </div>
          <ComparisonView />
          <div className="mt-3">
            <Button type="button" onClick={closeComparison}>
              ← Back to results
            </Button>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="space-y-5 lg:sticky lg:top-6">
            <ProfileForm onClearRequest={() => setConfirmClear(true)} />
            <div ref={shortlistRef}>
              <ShortlistPanel comparisonOpen={showComparison} onCompare={openComparison} />
            </div>
            <QuestionsPanel />
          </div>
          <div className="space-y-5">
            {/* Only rendered while a pre-screening session is open. */}
            <PreScreeningPanel />
            <ResultsPanel />
          </div>
        </div>
      )}

      <footer className="mt-8 border-t border-tb-border pt-4 text-[11px] leading-relaxed text-tb-muted">
        <p>
          Trial information is retrieved live from the{" "}
          <a
            className="text-tb-accent underline underline-offset-2"
            href="https://clinicaltrials.gov/data-api/api"
            target="_blank"
            rel="noopener noreferrer"
          >
            ClinicalTrials.gov API v2
          </a>
          , a service of the U.S. National Library of Medicine. TrialBridge is an independent project
          and is <strong>not affiliated with, endorsed by, or sponsored by</strong> ClinicalTrials.gov,
          the National Library of Medicine, the National Institutes of Health, any government agency,
          or any trial sponsor or investigator. Retrieval timestamps are shown with each result, and
          every study links back to its original record.
        </p>
        <p className="mt-2">
          Place names are converted to coordinates by{" "}
          <a
            className="text-tb-accent underline underline-offset-2"
            href="https://nominatim.openstreetmap.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Nominatim
          </a>
          . Geocoding data ©{" "}
          <a
            className="text-tb-accent underline underline-offset-2"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap contributors
          </a>
          , available under the{" "}
          <a
            className="text-tb-accent underline underline-offset-2"
            href="https://opendatacommons.org/licenses/odbl/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Database License
          </a>
          . Distances are approximate straight-line estimates, not travel distances.
        </p>
        <p className="mt-2">
          Your search details, shortlist, questions and pre-screening answers are stored only in
          this browser&rsquo;s local storage. There is no account, no database and no server-side
          persistence. Of the information you enter, only the coarse search terms needed for one
          registry query are ever sent to TrialBridge&rsquo;s search API, and{" "}
          <strong>
            nothing you enter is ever sent to ClinicalTrials.gov beyond those search terms
          </strong>
          . Your age, sex and pre-screening answers are never sent to either.
        </p>
        <p className="mt-2">
          <strong>One important exception.</strong> If you use a browser AI agent with this page,
          that agent can read and write what is on it — including pre-screening questions and
          answers — because that is how the pre-screening workflow works. Those exchanges are
          handled by whoever provides your agent, under their terms, not by TrialBridge. While
          TrialBridge is in beta, use fictional information only.
        </p>
      </footer>

      <ShortlistBar
        comparisonOpen={showComparison}
        onViewShortlist={() => shortlistRef.current?.scrollIntoView({ block: "start" })}
        onCompare={openComparison}
        onBackToResults={closeComparison}
      />

      <TrialDetailDrawer />

      {confirmClear ? (
        <ClearDialog
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            clearEverything();
            setConfirmClear(false);
          }}
        />
      ) : null}
    </div>
  );
}
