"use client";

import { useId, useMemo, useState } from "react";
import { NET_TREATMENTS, findTreatment } from "@/lib/catalog/net-treatments";
import { Badge } from "./primitives";

/**
 * Treatments the person has received, for the NET demonstration catalogue.
 *
 * Shown only when Neuroendocrine Tumors is the selected cancer: the supplied
 * workbook covers NET alone, and offering NET drugs for an unrelated cancer
 * would be misleading.
 *
 * A filtered checkbox list rather than a custom combobox — searchable by
 * generic name, brand and regimen, keyboard-navigable, and no new dependency.
 * Selections display as the generic name with the brand in parentheses, which
 * is how a patient recognises what they were actually given.
 */
export function NetTreatmentSelect({
  selected,
  onChange,
  fieldClassName,
  labelClassName,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  fieldClassName: string;
  labelClassName: string;
}) {
  const ids = useId();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return NET_TREATMENTS;
    // `notes` is searched too, so someone told only "I had FOLFOX" also finds
    // its components (oxaliplatin, fluorouracil) rather than the regimen alone.
    return NET_TREATMENTS.filter((t) =>
      [t.name, ...t.brands, t.mechanism, t.category, t.notes].some((term) =>
        term.toLowerCase().includes(needle),
      ),
    );
  }, [filter]);

  // Collapsed by default so 39 checkboxes do not dominate the form.
  const shown = expanded || filter.trim() ? visible : visible.slice(0, 6);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((s) => s !== id));
  }

  const label = (id: string) => {
    const t = findTreatment(id);
    if (!t) return id;
    return t.brands.length ? `${t.name} (${t.brands[0]})` : t.name;
  };

  return (
    <div>
      <label className={labelClassName} htmlFor={`${ids}-filter`}>
        Treatments received or currently taking
      </label>

      {selected.length > 0 ? (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id, false)}
                className="inline-flex items-center gap-1 rounded-full border border-tb-accent/40 bg-tb-accent-soft px-2 py-0.5 text-[11px] text-tb-accent hover:border-tb-mismatch/50"
                aria-label={`Remove ${label(id)}`}
              >
                {label(id)}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={`${ids}-filter`}
        type="search"
        className={fieldClassName}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search by drug, brand or regimen — e.g. everolimus, Afinitor, FOLFOX"
        aria-describedby={`${ids}-help`}
      />

      <fieldset className="mt-1.5 rounded-lg border border-tb-border px-3 py-2">
        <legend className="px-1 text-[11px] text-tb-muted">
          {filter.trim()
            ? `${visible.length} of ${NET_TREATMENTS.length} match`
            : `${NET_TREATMENTS.length} treatments`}
        </legend>

        {shown.length === 0 ? (
          <p className="py-1 text-[11px] text-tb-muted">
            Nothing matches “{filter.trim()}”. Try a generic name, a brand, or a regimen such as
            FOLFOX.
          </p>
        ) : (
          <ul className="space-y-1">
            {shown.map((t) => (
              <li key={t.id}>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.includes(t.id)}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">{t.name}</span>
                    {t.brands.length ? (
                      <span className="text-tb-muted"> ({t.brands.join(", ")})</span>
                    ) : null}
                    <span className="block text-[11px] text-tb-muted">
                      {t.category}
                      {t.mechanism ? ` · ${t.mechanism}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {!filter.trim() && visible.length > shown.length ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1.5 text-[11px] font-medium text-tb-accent underline underline-offset-2"
          >
            Show all {visible.length} treatments
          </button>
        ) : null}
        {expanded && !filter.trim() ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1.5 text-[11px] font-medium text-tb-accent underline underline-offset-2"
          >
            Show fewer
          </button>
        ) : null}
      </fieldset>

      <p id={`${ids}-help`} className="mt-1 text-[11px] text-tb-muted">
        Used only to identify possible trial exclusions. Timing, dosage, washout periods and
        exceptions may still require review by the study team.{" "}
        <Badge>Demonstration catalogue</Badge>{" "}
        Drawn from NCCN Guidelines for Patients: Neuroendocrine Tumors. Not every treatment applies
        to every NET type, primary site or patient.
      </p>
    </div>
  );
}
