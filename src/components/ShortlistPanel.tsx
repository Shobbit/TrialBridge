"use client";

import { useTrialStore } from "@/lib/store";
import { Badge, Button, EmptyState, Panel, StatusBadge, phaseLabel } from "./primitives";

/**
 * The shortlist and its comparison view.
 *
 * Agent-added entries are visibly marked so the person always knows which
 * studies they chose themselves and which an agent proposed.
 */
/**
 * @param comparisonOpen Whether the full-width comparison view is showing.
 * @param onCompare      Opens it. Owned by the app shell rather than this panel
 *                       because the comparison needs the whole page width — a
 *                       side-by-side table is unreadable in this narrow column.
 */
export function ShortlistPanel({
  comparisonOpen,
  onCompare,
}: {
  comparisonOpen: boolean;
  onCompare: () => void;
}) {
  const shortlist = useTrialStore((s) => s.shortlist);
  const removeFromShortlist = useTrialStore((s) => s.removeFromShortlist);
  const setOpenTrialId = useTrialStore((s) => s.setOpenTrialId);

  const canCompare = shortlist.length >= 2;

  return (
    <Panel
      id="shortlist"
      title="Your shortlist"
      description="Saved in this browser only. Clearing your information removes it."
      action={
        <div className="flex items-center gap-2">
          <Badge tone={shortlist.length ? "accent" : "neutral"}>
            {shortlist.length} {shortlist.length === 1 ? "study" : "studies"}
          </Badge>
          <Button
            type="button"
            variant={canCompare ? "primary" : "secondary"}
            onClick={onCompare}
            disabled={!canCompare || comparisonOpen}
            title={canCompare ? undefined : "Shortlist a second study to compare"}
          >
            Compare
          </Button>
        </div>
      }
    >
      {shortlist.length === 0 ? (
        <EmptyState title="Nothing shortlisted yet">
          Add studies from the results above, or ask a connected agent to shortlist ones worth a
          closer look. Shortlisting does not mean you qualify for a study.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {shortlist.map((entry) => (
            <li
              key={entry.trial.nctId}
              className="rounded-lg border border-tb-border bg-tb-surface-2 p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={entry.trial.overallStatus} />
                <Badge tone="accent">{phaseLabel(entry.trial.phases)}</Badge>
                {entry.source === "agent" ? <Badge tone="agent">Added by agent</Badge> : null}
              </div>
              <p className="mt-1.5 text-xs font-medium leading-snug">{entry.trial.briefTitle}</p>
              <p className="mt-0.5 font-mono text-[11px] text-tb-muted">{entry.trial.nctId}</p>
              {entry.note ? (
                <p className="mt-1.5 rounded border-l-2 border-tb-agent/50 bg-tb-agent-soft px-2 py-1 text-[11px] text-tb-text/85">
                  {entry.note}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => setOpenTrialId(entry.trial.nctId)}>
                  Details
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => removeFromShortlist(entry.trial.nctId)}
                >
                  Remove
                </Button>
                <a
                  href={entry.trial.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[11px] font-medium text-tb-accent underline underline-offset-2"
                >
                  Source ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
