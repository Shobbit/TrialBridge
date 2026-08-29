"use client";

import type { TrialAnalysis } from "@/lib/match";

/**
 * Renders the three-way analysis for one trial.
 *
 * The headings are fixed wording: "may be relevant", "apparent mismatches" and
 * "still unknown". They are never phrased as eligibility, and the "unknown"
 * column is given equal visual weight so it cannot be read as a minor caveat.
 */
export function Findings({
  analysis,
  compact = false,
}: {
  analysis: TrialAnalysis;
  compact?: boolean;
}) {
  const groups = [
    {
      key: "match" as const,
      heading: "Reasons it may be relevant",
      items: analysis.matches.map((f) => f.detail),
      classes: "border-tb-match/30 bg-tb-match-soft",
      label: "text-tb-match",
      icon: "✓",
    },
    {
      key: "mismatch" as const,
      heading: "Apparent mismatches",
      items: analysis.mismatches.map((f) => f.detail),
      classes: "border-tb-mismatch/30 bg-tb-mismatch-soft",
      label: "text-tb-mismatch",
      icon: "✕",
    },
    {
      key: "unknown" as const,
      heading: "Still unknown",
      items: analysis.unknowns.map((f) => f.detail),
      classes: "border-tb-unknown/30 bg-tb-unknown-soft",
      label: "text-tb-unknown",
      icon: "?",
    },
  ];

  return (
    <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
      {groups.map((group) => (
        <div key={group.key} className={`rounded-lg border p-3 ${group.classes}`}>
          <h4 className={`text-xs font-semibold ${group.label}`}>
            <span aria-hidden="true" className="mr-1">
              {group.icon}
            </span>
            {group.heading}
            <span className="ml-1 font-normal opacity-70">({group.items.length})</span>
          </h4>
          {group.items.length ? (
            <ul className="mt-1.5 space-y-1">
              {group.items.map((item, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-tb-text/85">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] text-tb-muted">None identified.</p>
          )}
        </div>
      ))}
    </div>
  );
}
