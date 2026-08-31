"use client";

import { useTrialStore } from "@/lib/store";

/**
 * Persistent shortlist bar.
 *
 * Results pages run to many screens, and the shortlist and Compare control live
 * in the left column near the top — so once someone has scrolled into the
 * results they are effectively unreachable. This bar pins them to the viewport
 * as soon as there is anything to act on, and disappears again when the
 * shortlist is empty.
 *
 * It is a real element in the document flow order (rendered late in the tree,
 * reachable by Tab) rather than a decorative overlay, and the page reserves
 * space for it so it never covers the footer.
 */
export function ShortlistBar({
  comparisonOpen,
  onViewShortlist,
  onCompare,
  onBackToResults,
}: {
  comparisonOpen: boolean;
  onViewShortlist: () => void;
  onCompare: () => void;
  onBackToResults: () => void;
}) {
  const count = useTrialStore((s) => s.shortlist.length);

  if (count === 0) return null;

  const canCompare = count >= 2;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 print:hidden"
      // The wrapper spans the viewport but must not swallow clicks on the page
      // behind it; only the pill itself is interactive.
      style={{ pointerEvents: "none" }}
    >
      <div
        role="region"
        aria-label="Shortlist actions"
        style={{ pointerEvents: "auto" }}
        className="flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-xl border border-tb-border-strong bg-tb-surface/95 px-3 py-2 shadow-lg backdrop-blur"
      >
        <p className="text-xs font-medium" aria-live="polite">
          {count} {count === 1 ? "study" : "studies"} shortlisted
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {comparisonOpen ? (
            <button
              type="button"
              onClick={onBackToResults}
              className="rounded-lg border border-tb-border-strong bg-tb-surface px-3 py-1.5 text-sm font-medium hover:bg-tb-surface-2"
            >
              ← Back to results
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onViewShortlist}
                className="rounded-lg border border-tb-border-strong bg-tb-surface px-3 py-1.5 text-sm font-medium hover:bg-tb-surface-2"
              >
                View shortlist ({count})
              </button>
              <button
                type="button"
                onClick={onCompare}
                disabled={!canCompare}
                title={canCompare ? undefined : "Shortlist a second study to compare"}
                className="rounded-lg border border-tb-accent bg-tb-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Compare
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
