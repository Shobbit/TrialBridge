"use client";

import { useMemo } from "react";
import { ELIGIBILITY_DISCLAIMER, analyzeTrial } from "@/lib/match";
import { useTrialStore } from "@/lib/store";
import { splitCriteria } from "@/webmcp/tools";
import { StatusBadge, phaseLabel } from "./primitives";

/**
 * Side-by-side comparison of shortlisted studies.
 *
 * Renders the same fields the `compare_shortlisted_trials` tool returns, so
 * what an agent describes and what the person sees cannot drift apart. The
 * table scrolls horizontally rather than letting the page do so.
 */
export function ComparisonView() {
  const shortlist = useTrialStore((s) => s.shortlist);
  const profile = useTrialStore((s) => s.profile);

  const rows = useMemo(
    () =>
      shortlist.map(({ trial }) => {
        const analysis = analyzeTrial(trial, profile);
        const { inclusion, exclusion } = splitCriteria(trial.eligibilityCriteria, 4);
        const nearest = trial.locations
          .filter((l) => l.distanceMiles !== null)
          .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0))[0];
        return { trial, analysis, inclusion, exclusion, nearest };
      }),
    [shortlist, profile],
  );

  const cellBase = "align-top border-b border-tb-border px-3 py-2 text-[11px]";
  const headBase = "sticky left-0 z-10 bg-tb-surface-2 font-medium text-tb-muted whitespace-nowrap";

  const list = (items: string[], empty: string) =>
    items.length ? (
      <ul className="list-disc space-y-0.5 pl-3.5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      <span className="text-tb-muted">{empty}</span>
    );

  return (
    <div className="rounded-lg border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-sm font-semibold">Comparison</h3>
        <p className="mt-0.5 text-[11px] text-tb-muted">{ELIGIBILITY_DISCLAIMER}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">
            Side-by-side comparison of shortlisted clinical trials
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${cellBase} ${headBase} text-left`}>
                Field
              </th>
              {rows.map(({ trial }) => (
                <th
                  key={trial.nctId}
                  scope="col"
                  className={`${cellBase} min-w-[200px] text-left font-semibold`}
                >
                  <span className="block leading-snug">{trial.briefTitle}</span>
                  <a
                    href={trial.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block font-mono text-[10px] font-normal text-tb-accent underline underline-offset-2"
                  >
                    {trial.nctId} ↗
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Status
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  <StatusBadge status={trial.overallStatus} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Phase
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {phaseLabel(trial.phases)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Sponsor
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {trial.leadSponsor ?? "Not stated"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Age range
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {trial.minimumAge ?? "No minimum"} – {trial.maximumAge ?? "No maximum"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Sex eligibility
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {trial.sex ?? "Not stated"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Nearest site
              </th>
              {rows.map(({ trial, nearest }) => (
                <td key={trial.nctId} className={cellBase}>
                  {nearest
                    ? `${[nearest.facility, nearest.city, nearest.state].filter(Boolean).join(", ")} (~${nearest.distanceMiles} mi)`
                    : trial.locations[0]
                      ? [trial.locations[0].city, trial.locations[0].country]
                          .filter(Boolean)
                          .join(", ")
                      : "No sites published"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Interventions
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {list(
                    trial.interventions.slice(0, 5).map((i) => `${i.type ?? "Other"}: ${i.name}`),
                    "Not stated",
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Major inclusion criteria
              </th>
              {rows.map(({ trial, inclusion }) => (
                <td key={trial.nctId} className={cellBase}>
                  {list(inclusion, "Not published in a parseable form")}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Major exclusion criteria
              </th>
              {rows.map(({ trial, exclusion }) => (
                <td key={trial.nctId} className={cellBase}>
                  {list(exclusion, "Not published in a parseable form")}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left text-tb-mismatch`}>
                Apparent mismatches
              </th>
              {rows.map(({ trial, analysis }) => (
                <td key={trial.nctId} className={cellBase}>
                  {list(
                    analysis.mismatches.map((f) => f.detail),
                    "None identified",
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left text-tb-unknown`}>
                Still unknown
              </th>
              {rows.map(({ trial, analysis }) => (
                <td key={trial.nctId} className={cellBase}>
                  {list(
                    analysis.unknowns.map((f) => f.detail),
                    "None identified",
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${cellBase} ${headBase} text-left`}>
                Last updated on registry
              </th>
              {rows.map(({ trial }) => (
                <td key={trial.nctId} className={cellBase}>
                  {trial.lastUpdatePostDate ?? "Not stated"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
