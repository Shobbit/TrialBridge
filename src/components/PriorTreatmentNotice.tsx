"use client";

import type { PriorTreatmentAssessment } from "@/lib/ctgov/prior-treatment";

/**
 * The prior-treatment flag on a trial card.
 *
 * Shows the registry's own wording of the criterion that matched, so the person
 * can judge it themselves rather than trusting a label. The heading never says
 * anyone is ineligible: this app compared two pieces of text, and only the
 * study team can say whether the criterion applies.
 */
export function PriorTreatmentNotice({
  assessment,
}: {
  assessment: PriorTreatmentAssessment | undefined;
}) {
  if (!assessment || assessment.status === "clear" || !assessment.matches.length) return null;

  const excluded = assessment.status === "excluded";
  const heading = excluded
    ? "Possible prior-treatment exclusion — confirm with the study team"
    : "Prior-treatment timing needs confirmation";
  const explanation = excluded
    ? "This study's published exclusion criteria name a treatment you entered. Whether that rules you out depends on details only the study team can confirm."
    : "This study's exclusion criteria mention a treatment you entered, but the criterion depends on timing or a condition — such as how long ago it was, or a washout period. Only the study team can confirm whether it applies to you.";

  const tone = excluded
    ? "border-tb-mismatch/40 bg-tb-mismatch-soft text-tb-mismatch"
    : "border-tb-unknown/30 bg-tb-unknown-soft text-tb-unknown";

  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-[11px] font-semibold">{heading}</p>
      <p className="mt-1 text-[11px] text-tb-text/80">{explanation}</p>

      <ul className="mt-2 space-y-2">
        {assessment.matches.map((match) => (
          <li key={`${match.treatmentId}:${match.criterionId}`}>
            <p className="text-[11px] font-medium text-tb-text/90">
              {match.treatmentLabel}
              {match.matchedVia === "mechanism" ? (
                <span className="font-normal text-tb-muted">
                  {" "}
                  — matched on the drug class “{match.matchedText}”
                </span>
              ) : null}
            </p>
            {/* Verbatim, so nothing is lost in paraphrase. */}
            <blockquote className="mt-0.5 border-l-2 border-current/30 pl-2 text-[11px] leading-relaxed text-tb-muted">
              {match.excerpt}
            </blockquote>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] text-tb-muted">
        Quoted from this study&rsquo;s eligibility criteria on ClinicalTrials.gov.
      </p>
    </div>
  );
}
