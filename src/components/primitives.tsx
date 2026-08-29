"use client";

import type { ReactNode } from "react";
import type { RecruitmentStatus } from "@/lib/ctgov/types";

/** Small shared presentational building blocks. */

export function Panel({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className="rounded-xl border border-tb-border bg-tb-surface shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-tb-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={id ? `${id}-heading` : undefined} className="text-base font-semibold">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-tb-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "match" | "mismatch" | "unknown" | "agent";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-tb-surface-2 text-tb-muted border-tb-border",
    accent: "bg-tb-accent-soft text-tb-accent border-tb-accent/30",
    match: "bg-tb-match-soft text-tb-match border-tb-match/30",
    mismatch: "bg-tb-mismatch-soft text-tb-mismatch border-tb-mismatch/30",
    unknown: "bg-tb-unknown-soft text-tb-unknown border-tb-unknown/30",
    agent: "bg-tb-agent-soft text-tb-agent border-tb-agent/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  RECRUITING: "Recruiting",
  NOT_YET_RECRUITING: "Not yet recruiting",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  COMPLETED: "Completed",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "Status unknown",
};

export function statusLabel(status: RecruitmentStatus | "UNKNOWN"): string {
  return STATUS_LABELS[status] ?? status;
}

export function StatusBadge({ status }: { status: RecruitmentStatus | "UNKNOWN" }) {
  const tone =
    status === "RECRUITING"
      ? "match"
      : status === "NOT_YET_RECRUITING" || status === "ENROLLING_BY_INVITATION"
        ? "accent"
        : status === "UNKNOWN"
          ? "unknown"
          : "neutral";
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}

export function Button({
  variant = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-tb-accent text-white border-tb-accent hover:opacity-90 disabled:opacity-50",
    secondary:
      "bg-tb-surface text-tb-text border-tb-border-strong hover:bg-tb-surface-2 disabled:opacity-50",
    ghost: "bg-transparent text-tb-muted border-transparent hover:bg-tb-surface-2",
    danger:
      "bg-transparent text-tb-mismatch border-tb-mismatch/40 hover:bg-tb-mismatch-soft disabled:opacity-50",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${props.className ?? ""}`}
    />
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-tb-border px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-xs text-tb-muted">{children}</p> : null}
    </div>
  );
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function phaseLabel(phases: string[]): string {
  if (!phases.length) return "Not stated";
  return phases
    .map((p) =>
      p === "NA"
        ? "Not applicable"
        : p.replace("EARLY_PHASE1", "Early Phase 1").replace("PHASE", "Phase "),
    )
    .join(" / ");
}
