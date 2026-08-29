"use client";

import { useId, useState } from "react";
import { runSearch } from "@/lib/actions";
import { RECRUITMENT_STATUSES, TRIAL_PHASES } from "@/lib/ctgov/types";
import { searchInputFromProfile, useTrialStore } from "@/lib/store";
import { Button, Panel, phaseLabel } from "./primitives";
import { statusLabel } from "./primitives";

const FIELD =
  "w-full rounded-lg border border-tb-border bg-tb-surface px-3 py-2 text-sm text-tb-text placeholder:text-tb-muted/70";
const LABEL = "block text-xs font-medium text-tb-muted mb-1";

/**
 * The visible search form.
 *
 * This is the exact surface `get_search_profile` reads and
 * `update_search_profile` writes, because both read and write the same store.
 * There is no separate agent-facing copy of these values.
 */
export function ProfileForm({ onClearRequest }: { onClearRequest: () => void }) {
  const profile = useTrialStore((s) => s.profile);
  const setProfile = useTrialStore((s) => s.setProfile);
  const searchState = useTrialStore((s) => s.searchState);
  const [treatmentDraft, setTreatmentDraft] = useState("");
  const ids = useId();

  const canSearch = profile.condition.trim().length > 0 && searchState !== "loading";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input = searchInputFromProfile(useTrialStore.getState().profile);
    if (!input) return;
    try {
      await runSearch(input);
    } catch {
      // runSearch already recorded the message in the store for the error UI.
    }
  }

  function addTreatment() {
    const value = treatmentDraft.trim();
    if (!value) return;
    if (profile.priorTreatments.includes(value)) {
      setTreatmentDraft("");
      return;
    }
    setProfile({ priorTreatments: [...profile.priorTreatments, value].slice(0, 25) });
    setTreatmentDraft("");
  }

  function toggleArrayValue<T extends string>(
    key: "recruitmentStatuses" | "phases",
    value: T,
    checked: boolean,
  ) {
    const current = profile[key] as string[];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    setProfile({ [key]: next } as never);
  }

  return (
    <Panel
      id="search-form"
      title="Your search details"
      description="Stored in this browser only. No account, no name, no email, no date of birth."
      action={
        <Button type="button" variant="ghost" onClick={onClearRequest}>
          Clear my information
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={LABEL} htmlFor={`${ids}-condition`}>
            Medical condition or diagnosis <span className="text-tb-mismatch">*</span>
          </label>
          <input
            id={`${ids}-condition`}
            className={FIELD}
            value={profile.condition}
            onChange={(e) => setProfile({ condition: e.target.value })}
            placeholder="e.g. type 2 diabetes, metastatic melanoma"
            required
            aria-describedby={`${ids}-condition-help`}
          />
          <p id={`${ids}-condition-help`} className="mt-1 text-[11px] text-tb-muted">
            Enter the condition as you would describe it. This is used only to query
            ClinicalTrials.gov.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`${ids}-age`}>
              Age in years
            </label>
            <input
              id={`${ids}-age`}
              className={FIELD}
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              value={profile.age ?? ""}
              onChange={(e) =>
                setProfile({ age: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder="e.g. 54"
              aria-describedby={`${ids}-age-help`}
            />
            <p id={`${ids}-age-help`} className="mt-1 text-[11px] text-tb-muted">
              Whole years, never a date of birth. Compared against each trial&rsquo;s published age
              range on your device — it is never sent anywhere and never hides a study.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor={`${ids}-sex`}>
              Sex
            </label>
            <select
              id={`${ids}-sex`}
              className={FIELD}
              value={profile.sex}
              onChange={(e) => setProfile({ sex: e.target.value as typeof profile.sex })}
              aria-describedby={`${ids}-sex-help`}
            >
              <option value="unspecified">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <p id={`${ids}-sex-help`} className="mt-1 text-[11px] text-tb-muted">
              Optional, and only useful because some trials restrict enrolment by sex. Like age, it
              stays on your device and never removes a study from your results.
            </p>
          </div>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Location</legend>
          <div>
            <label className={LABEL} htmlFor={`${ids}-city`}>
              City
            </label>
            <input
              id={`${ids}-city`}
              className={FIELD}
              value={profile.city}
              onChange={(e) => setProfile({ city: e.target.value })}
              placeholder="e.g. Chicago"
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${ids}-state`}>
              State or region
            </label>
            <input
              id={`${ids}-state`}
              className={FIELD}
              value={profile.state}
              onChange={(e) => setProfile({ state: e.target.value })}
              placeholder="e.g. Illinois"
              autoComplete="address-level1"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${ids}-country`}>
              Country
            </label>
            <input
              id={`${ids}-country`}
              className={FIELD}
              value={profile.country}
              onChange={(e) => setProfile({ country: e.target.value })}
              placeholder="e.g. United States"
              autoComplete="country-name"
            />
          </div>
        </fieldset>

        <div>
          <label className={LABEL} htmlFor={`${ids}-distance`}>
            Willing to travel up to {profile.travelDistanceMiles ?? "any distance"}
            {profile.travelDistanceMiles ? " miles" : ""}
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${ids}-distance`}
              className="flex-1 accent-[var(--tb-accent)]"
              type="range"
              min={5}
              max={500}
              step={5}
              value={profile.travelDistanceMiles ?? 500}
              onChange={(e) => setProfile({ travelDistanceMiles: Number(e.target.value) })}
            />
            <label className="flex items-center gap-1.5 text-xs text-tb-muted whitespace-nowrap">
              <input
                type="checkbox"
                checked={profile.travelDistanceMiles === null}
                onChange={(e) =>
                  setProfile({ travelDistanceMiles: e.target.checked ? null : 100 })
                }
              />
              No limit
            </label>
          </div>
        </div>

        <fieldset>
          <legend className={LABEL}>Recruitment status</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {RECRUITMENT_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={profile.recruitmentStatuses.includes(status)}
                  onChange={(e) => toggleArrayValue("recruitmentStatuses", status, e.target.checked)}
                />
                {statusLabel(status)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LABEL}>Preferred phase (leave empty for all)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {TRIAL_PHASES.map((phase) => (
              <label key={phase} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={profile.phases.includes(phase)}
                  onChange={(e) => toggleArrayValue("phases", phase, e.target.checked)}
                />
                {phaseLabel([phase])}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={LABEL} htmlFor={`${ids}-treatment`}>
            Relevant treatments already received
          </label>
          <div className="flex gap-2">
            <input
              id={`${ids}-treatment`}
              className={FIELD}
              value={treatmentDraft}
              onChange={(e) => setTreatmentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTreatment();
                }
              }}
              placeholder="e.g. metformin, then press Add"
              aria-describedby={`${ids}-treatment-help`}
            />
            <Button type="button" onClick={addTreatment} disabled={!treatmentDraft.trim()}>
              Add
            </Button>
          </div>
          <p id={`${ids}-treatment-help`} className="mt-1 text-[11px] text-tb-muted">
            Used only to flag where a trial&rsquo;s published criteria mention that treatment.
          </p>
          {profile.priorTreatments.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {profile.priorTreatments.map((treatment) => (
                <li key={treatment}>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile({
                        priorTreatments: profile.priorTreatments.filter((t) => t !== treatment),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-tb-border bg-tb-surface-2 px-2 py-0.5 text-[11px] hover:border-tb-mismatch/50"
                    aria-label={`Remove ${treatment}`}
                  >
                    {treatment}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-keywords`}>
            Other keywords (optional)
          </label>
          <input
            id={`${ids}-keywords`}
            className={FIELD}
            value={profile.keywords}
            onChange={(e) => setProfile({ keywords: e.target.value })}
            placeholder="e.g. BRAF, immunotherapy"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-tb-border pt-4">
          <Button type="submit" variant="primary" disabled={!canSearch}>
            {searchState === "loading" ? "Searching ClinicalTrials.gov…" : "Search trials"}
          </Button>
          {!profile.condition.trim() ? (
            <span className="text-xs text-tb-muted">Enter a condition to search.</span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
