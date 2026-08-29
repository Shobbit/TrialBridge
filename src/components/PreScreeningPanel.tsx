"use client";

import type { Criterion } from "@/lib/criteria";
import { AGENT_COMPARISON_LABEL, PRESCREENING_DISCLAIMER } from "@/lib/safety";
import type { Comparison, PreScreeningResponse } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import { Badge, Button, Panel, formatTimestamp } from "./primitives";

/**
 * The guided pre-screening view for one study.
 *
 * Every conclusion shown here was supplied by the visiting AI agent, not
 * computed by TrialBridge — the app performs no clinical interpretation of
 * free-text criteria. So each recorded item is displayed directly beneath the
 * registry's own wording, labelled as an agent-assisted preliminary comparison,
 * with the criterion, the question asked and the person's answer all visible.
 *
 * There is deliberately no progress bar, no count of criteria met and no score:
 * a tally would read as an eligibility verdict.
 */

const COMPARISON_PRESENTATION: Record<
  Comparison,
  { label: string; className: string; icon: string }
> = {
  appears_consistent: {
    label: "Appears consistent with this criterion",
    className: "border-tb-match/30 bg-tb-match-soft text-tb-match",
    icon: "✓",
  },
  potential_conflict: {
    label: "Potential point to discuss with the study team",
    className: "border-tb-mismatch/30 bg-tb-mismatch-soft text-tb-mismatch",
    icon: "!",
  },
  unresolved: {
    label: "Still unknown",
    className: "border-tb-unknown/30 bg-tb-unknown-soft text-tb-unknown",
    icon: "?",
  },
};

function answerText(response: PreScreeningResponse): string {
  if (response.answerType === "skipped") return "Skipped";
  if (response.answerType === "unknown" || response.patientAnswer === null) return "Not known";
  if (typeof response.patientAnswer === "boolean") return response.patientAnswer ? "Yes" : "No";
  return String(response.patientAnswer);
}

function CriterionRow({
  criterion,
  response,
}: {
  criterion: Criterion;
  response: PreScreeningResponse | undefined;
}) {
  const presentation = response ? COMPARISON_PRESENTATION[response.comparison] : null;

  return (
    <li className="rounded-lg border border-tb-border bg-tb-surface p-3">
      {/* The registry's own wording, always shown, never paraphrased. */}
      <blockquote className="border-l-2 border-tb-border-strong pl-2.5 text-[11px] leading-relaxed whitespace-pre-line text-tb-text/90">
        {criterion.verbatimText}
      </blockquote>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {response ? (
          <Badge tone={response.comparison === "appears_consistent" ? "match" : response.comparison === "potential_conflict" ? "mismatch" : "unknown"}>
            <span aria-hidden="true">{presentation!.icon}</span>
            {presentation!.label}
          </Badge>
        ) : (
          <Badge>Not yet discussed</Badge>
        )}
      </div>

      {response ? (
        <div className={`mt-2 rounded-md border p-2.5 ${presentation!.className}`}>
          <p className="text-[10px] font-semibold tracking-wide uppercase">
            {AGENT_COMPARISON_LABEL}
          </p>
          <dl className="mt-1.5 space-y-1 text-[11px] text-tb-text/85">
            <div>
              <dt className="inline font-medium text-tb-muted">Asked: </dt>
              <dd className="inline">{response.questionAsked}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-tb-muted">You answered: </dt>
              <dd className="inline">{answerText(response)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-tb-muted">Agent&rsquo;s note: </dt>
              <dd className="inline">{response.explanation}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[10px] text-tb-muted">
            Recorded {formatTimestamp(response.recordedAt)}. Not a decision about eligibility.
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function PreScreeningPanel() {
  const session = useTrialStore((s) => s.preScreening);
  const clearPreScreening = useTrialStore((s) => s.clearPreScreening);

  if (!session) return null;

  const inclusion = session.criteria.filter((c) => c.type === "inclusion");
  const exclusion = session.criteria.filter((c) => c.type === "exclusion");
  const unsegmented = session.criteria.filter((c) => c.type === "unsegmented");

  const row = (c: Criterion) => (
    <CriterionRow key={c.criterionId} criterion={c} response={session.responses[c.criterionId]} />
  );

  return (
    <Panel
      id="prescreening"
      title="Pre-screening"
      description={
        <>
          {session.trialTitle} ·{" "}
          <a
            className="font-mono text-tb-accent underline underline-offset-2"
            href={session.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {session.nctId} ↗
          </a>{" "}
          · Criteria retrieved {formatTimestamp(session.retrievedAt)}
        </>
      }
      action={
        <Button type="button" variant="danger" onClick={clearPreScreening}>
          Clear pre-screening
        </Button>
      }
    >
      <div
        role="note"
        className="mb-3 rounded-lg border border-tb-unknown/40 bg-tb-unknown-soft px-3 py-2"
      >
        <p className="text-[11px] font-semibold text-tb-unknown">
          Beta — use fictional information only
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-tb-text/85">
          Do not enter real medical details. {PRESCREENING_DISCLAIMER}
        </p>
      </div>

      {session.notice ? (
        <div
          role="status"
          className="mb-3 rounded-lg border border-tb-border bg-tb-surface-2 px-3 py-2 text-[11px] text-tb-muted"
        >
          {session.notice}
        </div>
      ) : null}

      {session.criteria.length === 0 ? (
        <p className="rounded-lg border border-dashed border-tb-border px-3 py-6 text-center text-xs text-tb-muted">
          This study publishes no eligibility criteria that TrialBridge can display. Open the
          ClinicalTrials.gov record above and ask the study team directly.
        </p>
      ) : null}

      {unsegmented.length ? (
        <section className="mb-4">
          <h3 className="mb-1.5 text-xs font-semibold">
            Full eligibility text{" "}
            <span className="font-normal text-tb-muted">— needs manual review</span>
          </h3>
          <ul className="space-y-2">{unsegmented.map(row)}</ul>
        </section>
      ) : null}

      {inclusion.length ? (
        <section className="mb-4">
          <h3 className="mb-1.5 text-xs font-semibold">
            Inclusion criteria{" "}
            <span className="font-normal text-tb-muted">({inclusion.length} published)</span>
          </h3>
          <ul className="space-y-2">{inclusion.map(row)}</ul>
        </section>
      ) : null}

      {exclusion.length ? (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold">
            Exclusion criteria{" "}
            <span className="font-normal text-tb-muted">({exclusion.length} published)</span>
          </h3>
          <ul className="space-y-2">{exclusion.map(row)}</ul>
        </section>
      ) : null}

      <p className="mt-4 border-t border-tb-border pt-3 text-[11px] text-tb-muted">
        Criteria are quoted exactly as published on ClinicalTrials.gov. TrialBridge does not
        interpret them. Comparisons above were prepared with an AI agent from answers you gave and
        are not a decision about whether you can take part — only the study team can determine that,
        after medical screening.
      </p>
    </Panel>
  );
}
