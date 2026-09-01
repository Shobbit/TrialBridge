"use client";

import { useId } from "react";
import { US_STATES, isUnitedStates, resolveUsState } from "@/lib/catalog/us-states";

/**
 * State or region.
 *
 * A dropdown for the United States, because a typo here quietly degrades the
 * search: `state` feeds both the geocoder and the place-name fallback used when
 * geocoding fails, so "Illinios" narrows results without ever saying why.
 * Selecting from a list makes that impossible.
 *
 * For any other country it falls back to a free-text input. The list is US-only,
 * and offering "Illinois" to someone searching in India would be worse than
 * asking them to type. TrialBridge searches a worldwide registry; the
 * convenience of a dropdown must not quietly become a restriction to one
 * country.
 */
export function StateSelect({
  state,
  country,
  onChange,
  fieldClassName,
  labelClassName,
}: {
  state: string;
  country: string;
  onChange: (state: string) => void;
  fieldClassName: string;
  labelClassName: string;
}) {
  const ids = useId();
  const usa = isUnitedStates(country);

  if (!usa) {
    return (
      <div>
        <label className={labelClassName} htmlFor={`${ids}-state`}>
          State or region
        </label>
        <input
          id={`${ids}-state`}
          className={fieldClassName}
          value={state}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Ontario"
          autoComplete="address-level1"
          aria-describedby={`${ids}-state-help`}
        />
        <p id={`${ids}-state-help`} className="mt-1 text-[11px] text-tb-muted">
          TrialBridge has a fixed list only for the United States. Type the region
          as it is normally written.
        </p>
      </div>
    );
  }

  // A value saved before this list existed, or set while another country was
  // selected, stays selectable rather than being silently dropped.
  const recognised = resolveUsState(state);
  const unrecognised = state !== "" && !recognised;

  const states = US_STATES.filter((s) => s.kind === "state");
  const territories = US_STATES.filter((s) => s.kind === "territory");

  return (
    <div>
      <label className={labelClassName} htmlFor={`${ids}-state`}>
        State
      </label>
      <select
        id={`${ids}-state`}
        className={fieldClassName}
        value={recognised ? recognised.name : state}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="address-level1"
        aria-describedby={unrecognised ? `${ids}-state-help` : undefined}
      >
        <option value="">Select your state…</option>
        <optgroup label="States and District of Columbia">
          {states.map((s) => (
            <option key={s.code} value={s.name}>
              {s.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Territories">
          {territories.map((s) => (
            <option key={s.code} value={s.name}>
              {s.name}
            </option>
          ))}
        </optgroup>
        {unrecognised ? <option value={state}>{state} (as you entered it)</option> : null}
      </select>
      {unrecognised ? (
        <p id={`${ids}-state-help`} className="mt-1 text-[11px] text-tb-muted">
          &ldquo;{state}&rdquo; is not one of the states listed. It has been kept
          exactly as entered — choose from the list if you would rather replace it.
        </p>
      ) : null}
    </div>
  );
}
