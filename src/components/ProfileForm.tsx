"use client";

import { useId, useState } from "react";
import { runSearch } from "@/lib/actions";
import { TRIAL_PHASES } from "@/lib/ctgov/types";
import { NET_CANCER_ID } from "@/lib/catalog/cancers";
import { OTHER_CANCER_ID } from "@/lib/schemas";
import { searchInputFromProfile, useTrialStore } from "@/lib/store";
import { CancerSelect } from "./CancerSelect";
import { NetTreatmentSelect } from "./NetTreatmentSelect";
import { Button, Panel, phaseLabel } from "./primitives";

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

  // A catalogue selection is enough on its own; the fallback also needs text.
  const hasCancer =
    profile.cancerId !== "" &&
    (profile.cancerId !== OTHER_CANCER_ID || profile.condition.trim().length > 0);
  const canSearch = hasCancer && searchState !== "loading";
  // The supplied treatment catalogue is NET-only.
  const isNet = profile.cancerId === NET_CANCER_ID;

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
        <CancerSelect
          cancerId={profile.cancerId}
          condition={profile.condition}
          onChange={(next) =>
            setProfile(
              // Treatment selections belong to the NET catalogue. Leaving them
              // behind after a change of cancer would keep a hidden control
              // driving the search.
              next.cancerId === NET_CANCER_ID ? next : { ...next, netTreatments: [] },
            )
          }
          fieldClassName={FIELD}
          labelClassName={LABEL}
        />

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

        <div>
          <label className={LABEL} htmlFor={`${ids}-stage`}>
            Cancer stage (if you have been given one)
          </label>
          <select
            id={`${ids}-stage`}
            className={FIELD}
            value={profile.cancerStage}
            onChange={(e) =>
              setProfile({ cancerStage: e.target.value as typeof profile.cancerStage })
            }
            aria-describedby={`${ids}-stage-help`}
          >
            <option value="unspecified">Not applicable or not known</option>
            <option value="0">Stage 0</option>
            <option value="I">Stage I</option>
            <option value="II">Stage II</option>
            <option value="III">Stage III</option>
            <option value="IV">Stage IV</option>
          </select>
          <p id={`${ids}-stage-help`} className="mt-1 text-[11px] text-tb-muted">
            Leave this alone for non-cancer conditions. ClinicalTrials.gov has no separate stage
            field, so stage is written into each study&rsquo;s eligibility text. Selecting a stage
            steers the search toward studies that mention it and highlights where they do —{" "}
            <strong>it never removes a study on its own</strong>, because staging language varies
            and only the study team can judge it.
          </p>
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

        {/*
          Recruiting-first. TrialBridge is for people trying to enrol now, so
          completed, terminated, withdrawn, suspended, active-not-recruiting and
          enrolling-by-invitation studies are not searchable at all — they would
          create work with no route to enrolment.
        */}
        <fieldset>
          <legend className={LABEL}>Recruitment status</legend>
          {/*
            Recruiting is now the only searchable status, so this is a
            statement rather than a control. Nobody using this app is looking
            for a study they cannot join, and every other status — including
            "not yet recruiting" — means exactly that today.
          */}
          <p className="rounded-lg border border-tb-match/30 bg-tb-match-soft px-3 py-2 text-xs">
            <span className="font-medium text-tb-match">Recruiting now — always</span>
            <span className="mt-0.5 block text-[11px] text-tb-text/85">
              Only studies currently enrolling participants are searched. Completed, terminated,
              withdrawn, suspended, active-not-recruiting, enrolling-by-invitation and
              not-yet-recruiting studies are never shown, because you could not join them today.
              A study already on your shortlist still shows its true status if that later changes.
            </span>
          </p>
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

        {/*
          The supplied treatment catalogue covers NET only, so it is offered
          only for that selection. Other cancers keep the free-text field.
        */}
        {isNet ? (
          <NetTreatmentSelect
            selected={profile.netTreatments}
            onChange={(netTreatments) => setProfile({ netTreatments })}
            fieldClassName={FIELD}
            labelClassName={LABEL}
          />
        ) : (
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
                placeholder="e.g. carboplatin, then press Add"
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
        )}

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
          {!hasCancer ? (
            <span className="text-xs text-tb-muted">Choose your cancer type to search.</span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
