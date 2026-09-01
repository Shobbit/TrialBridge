"use client";

import { useMemo } from "react";
import type { Trial } from "@/lib/ctgov/types";
import { stageLabel } from "@/lib/ctgov/stage";
import { analyzeTrial } from "@/lib/match";
import { useTrialStore } from "@/lib/store";
import { Findings } from "./Findings";
import { Badge, Button, StatusBadge, phaseLabel } from "./primitives";

/**
 * One trial rendered as a card.
 *
 * Everything shown here comes from the ClinicalTrials.gov record, with the
 * exception of the three-way analysis, which is computed locally by
 * `analyzeTrial` and clearly labelled as an observation rather than a verdict.
 */
export function TrialCard({ trial }: { trial: Trial }) {
  const profile = useTrialStore((s) => s.profile);
  const shortlist = useTrialStore((s) => s.shortlist);
  const addToShortlist = useTrialStore((s) => s.addToShortlist);
  const removeFromShortlist = useTrialStore((s) => s.removeFromShortlist);
  const setOpenTrialId = useTrialStore((s) => s.setOpenTrialId);

  const analysis = useMemo(() => analyzeTrial(trial, profile), [trial, profile]);
  const isShortlisted = shortlist.some((e) => e.trial.nctId === trial.nctId);
  const stageText = stageLabel(trial.stageRequirement);

  const nearest = trial.locations
    .filter((l) => l.distanceMiles !== null)
    .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0))[0];
  const displayLocation =
    nearest ?? trial.locations[0] ?? null;

  return (
    <article className="rounded-xl border border-tb-border bg-tb-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={trial.overallStatus} />
        <Badge tone="accent">{phaseLabel(trial.phases)}</Badge>
        {trial.nearestLocationMiles !== null ? (
          <Badge>~{trial.nearestLocationMiles} mi to nearest site</Badge>
        ) : null}
        {/*
          Stage is shown on the card because in oncology it is the first thing
          a patient checks. Where the study never states one, that is said
          plainly rather than left blank — a missing stage is information too.
        */}
        {stageText ? (
          <Badge tone="accent">
            {stageText}
            {trial.stageRequirement.source === "metastatic" ? " (metastatic)" : ""}
          </Badge>
        ) : (
          <Badge>Stage not stated</Badge>
        )}
        {isShortlisted ? <Badge tone="agent">On shortlist</Badge> : null}
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug">{trial.briefTitle}</h3>

      <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-tb-muted">NCT number</dt>
          <dd className="font-mono">{trial.nctId}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-tb-muted">Sponsor</dt>
          <dd className="truncate">{trial.leadSponsor ?? "Not stated"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-tb-muted">Ages</dt>
          <dd>
            {trial.minimumAge ?? "No minimum stated"} – {trial.maximumAge ?? "No maximum stated"}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-tb-muted">Sex</dt>
          <dd>
            {trial.sex === "ALL"
              ? "All"
              : trial.sex
                ? trial.sex.charAt(0) + trial.sex.slice(1).toLowerCase()
                : "Not stated"}
          </dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 font-medium text-tb-muted">Conditions</dt>
          <dd className="min-w-0">{trial.conditions.join(", ") || "Not stated"}</dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 font-medium text-tb-muted">Interventions</dt>
          <dd className="min-w-0">
            {trial.interventions.length
              ? trial.interventions
                  .slice(0, 4)
                  .map((i) => `${i.type ? `${i.type.toLowerCase()}: ` : ""}${i.name}`)
                  .join("; ")
              : "Not stated"}
          </dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 font-medium text-tb-muted">Locations</dt>
          <dd className="min-w-0">
            {displayLocation
              ? `${[displayLocation.facility, displayLocation.city, displayLocation.state, displayLocation.country]
                  .filter(Boolean)
                  .join(", ")}${
                  trial.locations.length > 1 ? ` and ${trial.locations.length - 1} more` : ""
                }`
              : "No locations published"}
          </dd>
        </div>
      </dl>

      {trial.briefSummary ? (
        <details className="group mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-tb-accent">
            Brief summary
          </summary>
          <p className="mt-1 text-[11px] leading-relaxed whitespace-pre-line text-tb-muted">
            {trial.briefSummary}
          </p>
        </details>
      ) : null}

      <div className="mt-3">
        <Findings analysis={analysis} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-tb-border pt-3">
        <Button type="button" onClick={() => setOpenTrialId(trial.nctId)}>
          View eligibility criteria
        </Button>
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
          className="ml-auto text-[11px] font-medium text-tb-accent underline underline-offset-2"
        >
          ClinicalTrials.gov record ↗
        </a>
      </div>
    </article>
  );
}
