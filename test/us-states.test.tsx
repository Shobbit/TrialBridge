import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "@/components/ProfileForm";
import {
  US_STATES,
  canonicalStateName,
  isUnitedStates,
  resolveUsState,
} from "@/lib/catalog/us-states";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { migratePersistedState, useTrialStore } from "@/lib/store";

/**
 * The state selector.
 *
 * A typo in this field is not cosmetic: `state` feeds the geocoder and the
 * place-name fallback used when geocoding fails, so "Illinios" narrows the
 * search without ever saying why. The dropdown removes that failure for US
 * searches; these tests hold the two edges in place — that it really is a
 * fixed list for the United States, and that it really does get out of the way
 * for anywhere else.
 */

function setProfile(patch: Partial<typeof EMPTY_PROFILE>) {
  useTrialStore.setState({ profile: { ...EMPTY_PROFILE, ...patch } });
}

beforeEach(() => {
  useTrialStore.setState({ profile: EMPTY_PROFILE });
});

describe("the catalogue", () => {
  it("holds 50 states, the District of Columbia and 5 territories", () => {
    expect(US_STATES).toHaveLength(56);
    expect(US_STATES.filter((s) => s.kind === "territory")).toHaveLength(5);
    expect(US_STATES.filter((s) => s.kind === "state")).toHaveLength(51);
  });

  it("has no duplicate codes or names", () => {
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(56);
    expect(new Set(US_STATES.map((s) => s.name)).size).toBe(56);
  });

  it("stores the full name, which is what ClinicalTrials.gov publishes", () => {
    expect(canonicalStateName("IL")).toBe("Illinois");
    expect(canonicalStateName("ny")).toBe("New York");
  });
});

describe("resolving a state name", () => {
  it("accepts the full name, the code and a short form", () => {
    expect(resolveUsState("Illinois")?.code).toBe("IL");
    expect(resolveUsState("illinois")?.code).toBe("IL");
    expect(resolveUsState("IL")?.code).toBe("IL");
    expect(resolveUsState(" il ")?.code).toBe("IL");
    expect(resolveUsState("Ill")?.code).toBe("IL");
  });

  it("keeps Washington the state distinct from Washington DC", () => {
    expect(resolveUsState("Washington")?.code).toBe("WA");
    expect(resolveUsState("Washington DC")?.code).toBe("DC");
    expect(resolveUsState("Washington, D.C.")?.code).toBe("DC");
    expect(resolveUsState("District of Columbia")?.code).toBe("DC");
  });

  it("does not let one state be satisfied by a longer one", () => {
    // "Virginia" and "West Virginia" are different places.
    expect(resolveUsState("Virginia")?.code).toBe("VA");
    expect(resolveUsState("West Virginia")?.code).toBe("WV");
  });

  it("refuses a typo rather than guessing", () => {
    for (const typo of ["Illinios", "Californa", "New Yrok", "Ontario", "", "   "]) {
      expect(resolveUsState(typo), typo).toBeUndefined();
    }
  });

  it("resolves the territories", () => {
    expect(resolveUsState("Puerto Rico")?.code).toBe("PR");
    expect(resolveUsState("USVI")?.code).toBe("VI");
    expect(resolveUsState("Guam")?.code).toBe("GU");
  });
});

describe("recognising the United States", () => {
  it("accepts the spellings people actually type", () => {
    for (const value of ["United States", "united states", "USA", "usa", "US", "U.S.A."]) {
      expect(isUnitedStates(value), value).toBe(true);
    }
  });

  it("treats anywhere else as another country", () => {
    for (const value of ["India", "Canada", "United Kingdom", ""]) {
      expect(isUnitedStates(value), value).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// In the form
// ---------------------------------------------------------------------------

describe("the form control", () => {
  it("offers a dropdown while the country is the United States", () => {
    render(<ProfileForm onClearRequest={() => {}} />);

    const select = screen.getByLabelText(/^state$/i);
    expect(select.tagName).toBe("SELECT");
    // Every state is selectable, so no spelling is possible.
    expect(within(select as HTMLElement).getAllByRole("option")).toHaveLength(57);
  });

  it("writes the full state name to the profile", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.selectOptions(screen.getByLabelText(/^state$/i), "Illinois");
    expect(useTrialStore.getState().profile.state).toBe("Illinois");
  });

  it("falls back to free text for any other country", async () => {
    const user = userEvent.setup();
    setProfile({ country: "India" });
    render(<ProfileForm onClearRequest={() => {}} />);

    const field = screen.getByLabelText(/state or region/i);
    expect(field.tagName).toBe("INPUT");

    await user.type(field, "Maharashtra");
    expect(useTrialStore.getState().profile.state).toBe("Maharashtra");
  });

  it("switches control as the person edits the country", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    expect(screen.getByLabelText(/^state$/i).tagName).toBe("SELECT");

    const country = screen.getByLabelText(/country/i);
    await user.clear(country);
    await user.type(country, "Canada");

    expect(screen.getByLabelText(/state or region/i).tagName).toBe("INPUT");
    expect(screen.queryByLabelText(/^state$/i)).not.toBeInTheDocument();
  });

  it("keeps the city field as free text throughout", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    const city = screen.getByLabelText(/city/i);
    expect(city.tagName).toBe("INPUT");

    await user.type(city, "Chicago");
    expect(useTrialStore.getState().profile.city).toBe("Chicago");
    // Typing a city never touches the state: too many cities share a name for
    // a guess to be safe.
    expect(useTrialStore.getState().profile.state).toBe("");
  });

  it("preserves a value that is not in the list rather than dropping it", () => {
    setProfile({ country: "United States", state: "Ontario" });
    render(<ProfileForm onClearRequest={() => {}} />);

    const select = screen.getByLabelText(/^state$/i) as HTMLSelectElement;
    expect(select.value).toBe("Ontario");
    expect(screen.getByText(/kept exactly as entered/i)).toBeInTheDocument();
  });

  it("shows a saved short form as the matching state", () => {
    setProfile({ country: "United States", state: "IL" });
    render(<ProfileForm onClearRequest={() => {}} />);

    expect((screen.getByLabelText(/^state$/i) as HTMLSelectElement).value).toBe("Illinois");
  });
});

// ---------------------------------------------------------------------------
// Saved profiles
// ---------------------------------------------------------------------------

describe("migrating a saved profile", () => {
  const migrate = (profile: Record<string, unknown>) =>
    (migratePersistedState({ profile }, 3) as { profile: Record<string, unknown> }).profile;

  it("canonicalises a saved state that names a real one", () => {
    expect(migrate({ state: "IL", country: "United States" }).state).toBe("Illinois");
    expect(migrate({ state: "illinois", country: "USA" }).state).toBe("Illinois");
  });

  it("treats a profile saved before the country field as a US profile", () => {
    expect(migrate({ state: "TX" }).state).toBe("Texas");
  });

  it("keeps anything it does not recognise exactly as typed", () => {
    // Someone's own words about where they live are theirs to correct.
    expect(migrate({ state: "Ontario", country: "United States" }).state).toBe("Ontario");
    expect(migrate({ state: "Maharashtra", country: "India" }).state).toBe("Maharashtra");
  });

  it("leaves an empty state empty", () => {
    expect(migrate({ state: "", country: "United States" }).state).toBe("");
  });

  it("never throws on a malformed saved state", () => {
    for (const state of [null, 42, {}, []]) {
      expect(() => migrate({ state })).not.toThrow();
    }
  });
});
