"use client";

import { useId, useMemo, useState } from "react";
import { CANCERS } from "@/lib/catalog/cancers";
import { OTHER_CANCER_ID } from "@/lib/schemas";

/**
 * Cancer selector.
 *
 * Replaces the free-text condition box so spelling can no longer decide whether
 * a search works, and so the app has a canonical concept to match against —
 * "Small Cell Lung Cancer" becomes a selection with curated aliases and
 * conflicts rather than four tokens to fuzzy-match.
 *
 * Deliberately built from a filter box plus a native `<select>`: no new
 * dependency, keyboard and screen-reader behaviour comes free from the
 * platform, and it works identically on mobile. The list is the supplied
 * demonstration catalogue, not an exhaustive cancer ontology, so an
 * "Other cancer / not listed" fallback keeps free text available.
 */
export function CancerSelect({
  cancerId,
  condition,
  onChange,
  fieldClassName,
  labelClassName,
}: {
  cancerId: string;
  /** Free text, used only by the fallback. */
  condition: string;
  onChange: (next: { cancerId: string; condition: string }) => void;
  fieldClassName: string;
  labelClassName: string;
}) {
  const ids = useId();
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return CANCERS;
    return CANCERS.filter((c) =>
      [c.label, c.sourceLabel, ...c.aliases].some((term) =>
        term.toLowerCase().includes(needle),
      ),
    );
  }, [filter]);

  const isOther = cancerId === OTHER_CANCER_ID;
  // A saved selection can be filtered out of view; keep it selectable so
  // typing in the filter never silently changes what is chosen.
  const selectedStillVisible = visible.some((c) => c.id === cancerId);
  const selected = CANCERS.find((c) => c.id === cancerId);

  return (
    <div>
      <label className={labelClassName} htmlFor={`${ids}-cancer`}>
        Type of cancer <span className="text-tb-mismatch">*</span>
      </label>

      <input
        id={`${ids}-filter`}
        type="search"
        className={`${fieldClassName} mb-1.5`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search the list, e.g. neuroendocrine, lung, AML"
        aria-label="Filter the cancer list"
        aria-describedby={`${ids}-cancer-help`}
      />

      <select
        id={`${ids}-cancer`}
        className={fieldClassName}
        value={cancerId}
        onChange={(e) => onChange({ cancerId: e.target.value, condition })}
        required
        aria-describedby={`${ids}-cancer-help`}
      >
        <option value="">Select your cancer type…</option>
        {visible.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        {selected && !selectedStillVisible ? (
          <option value={selected.id}>{selected.label}</option>
        ) : null}
        <option value={OTHER_CANCER_ID}>Other cancer / not listed…</option>
      </select>

      <p id={`${ids}-cancer-help`} className="mt-1 text-[11px] text-tb-muted">
        {filter.trim() && visible.length !== CANCERS.length
          ? `${visible.length} of ${CANCERS.length} shown. `
          : null}
        Choosing from the list avoids spelling mistakes and lets TrialBridge tell
        closely-related cancers apart. This is the catalogue supplied for the
        demonstration, not a complete list of every cancer subtype.
      </p>

      {isOther ? (
        <div className="mt-2">
          <label className={labelClassName} htmlFor={`${ids}-other`}>
            Describe your cancer
          </label>
          <input
            id={`${ids}-other`}
            className={fieldClassName}
            value={condition}
            onChange={(e) => onChange({ cancerId: OTHER_CANCER_ID, condition: e.target.value })}
            placeholder="e.g. salivary gland carcinoma"
            aria-describedby={`${ids}-other-help`}
          />
          <p id={`${ids}-other-help`} className="mt-1 text-[11px] text-tb-muted">
            Fallback for cancers not in the list. Matching is less precise here,
            because there are no curated alternative spellings for it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
