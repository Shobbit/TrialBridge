import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "@/components/ProfileForm";
import { NET_CANCER_ID } from "@/lib/catalog/cancers";
import { NET_TREATMENTS } from "@/lib/catalog/net-treatments";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { searchInputFromProfile, useTrialStore } from "@/lib/store";

/**
 * The NET treatment selector, exercised through the real form.
 *
 * The selector exists so prior-treatment exclusions can be matched against a
 * curated catalogue rather than guessed from free text, so these tests care
 * about two things: that it appears only where that catalogue applies, and that
 * a person can find a drug by any of the names they might have been given it
 * under — generic, brand, or the regimen it was part of.
 */

const TREATMENT_LABEL = /treatments received or currently taking/i;
const FREE_TEXT_LABEL = /relevant treatments already received/i;

function setCancer(cancerId: string) {
  useTrialStore.setState({ profile: { ...EMPTY_PROFILE, cancerId } });
}

function treatmentList() {
  // The checkbox list lives in the fieldset that follows the filter box.
  return screen.getByRole("group", { name: /treatments?$|of \d+ match/i });
}

beforeEach(() => {
  useTrialStore.setState({ profile: EMPTY_PROFILE });
});

describe("which control is offered", () => {
  it("shows the catalogue selector when neuroendocrine tumors is selected", () => {
    setCancer(NET_CANCER_ID);
    render(<ProfileForm onClearRequest={() => {}} />);

    expect(screen.getByLabelText(TREATMENT_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(FREE_TEXT_LABEL)).not.toBeInTheDocument();
  });

  it("keeps the free-text field for every other cancer", () => {
    // The supplied catalogue is NET-only; offering NET drugs for breast cancer
    // would imply a clinical relevance the data does not carry.
    setCancer("breast-cancer");
    render(<ProfileForm onClearRequest={() => {}} />);

    expect(screen.getByLabelText(FREE_TEXT_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(TREATMENT_LABEL)).not.toBeInTheDocument();
  });

  it("shows neither catalogue nor stale selections before a cancer is chosen", () => {
    render(<ProfileForm onClearRequest={() => {}} />);
    expect(screen.queryByLabelText(TREATMENT_LABEL)).not.toBeInTheDocument();
  });
});

describe("finding a treatment", () => {
  beforeEach(() => setCancer(NET_CANCER_ID));

  it("finds a drug by its generic name", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "everolimus");
    expect(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ })).toBeInTheDocument();
  });

  it("finds the same drug by its brand name", async () => {
    // Patients are far more likely to remember "Afinitor" than "everolimus".
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "Afinitor");
    expect(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ })).toBeInTheDocument();
  });

  it("finds regimen components when only the regimen name is known", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "FOLFOX");
    const names = within(treatmentList())
      .getAllByRole("checkbox")
      .map((box) => box.closest("label")?.textContent ?? "");

    expect(names.some((n) => /FOLFOX/i.test(n))).toBe(true);
    expect(names.some((n) => /Oxaliplatin/i.test(n))).toBe(true);
  });

  it("says so plainly when nothing matches, instead of showing an empty box", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "zzzzz");
    expect(screen.getByText(/Nothing matches/i)).toBeInTheDocument();
  });

  it("collapses the list by default and expands on request", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    expect(within(treatmentList()).getAllByRole("checkbox")).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: /show all \d+ treatments/i }));
    expect(within(treatmentList()).getAllByRole("checkbox")).toHaveLength(NET_TREATMENTS.length);
  });
});

describe("selecting a treatment", () => {
  beforeEach(() => setCancer(NET_CANCER_ID));

  it("writes catalogue ids to the profile, not display text", async () => {
    // Exclusion matching keys off the id, so the stored value must be stable
    // even if the label is reworded.
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "Afinitor");
    await user.click(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ }));

    expect(useTrialStore.getState().profile.netTreatments).toEqual(["everolimus"]);
  });

  it("shows the selection as generic name with the brand, and removes it again", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "Afinitor");
    await user.click(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ }));

    const chip = screen.getByRole("button", { name: /Remove Everolimus \(Afinitor\)/ });
    expect(chip).toBeInTheDocument();

    await user.click(chip);
    expect(useTrialStore.getState().profile.netTreatments).toEqual([]);
  });

  it("keeps a selection visible after the filter is cleared", async () => {
    // A selection scrolled out of the filtered view must not look lost.
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    const filter = screen.getByLabelText(TREATMENT_LABEL);
    await user.type(filter, "Afinitor");
    await user.click(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ }));
    await user.clear(filter);

    expect(
      screen.getByRole("button", { name: /Remove Everolimus \(Afinitor\)/ }),
    ).toBeInTheDocument();
    expect(useTrialStore.getState().profile.netTreatments).toEqual(["everolimus"]);
  });

  it("drops the selections when the person changes to another cancer", async () => {
    const user = userEvent.setup();
    render(<ProfileForm onClearRequest={() => {}} />);

    await user.type(screen.getByLabelText(TREATMENT_LABEL), "Afinitor");
    await user.click(within(treatmentList()).getByRole("checkbox", { name: /Everolimus/ }));
    expect(useTrialStore.getState().profile.netTreatments).toEqual(["everolimus"]);

    await user.selectOptions(screen.getByLabelText(/type of cancer/i), "breast-cancer");
    expect(useTrialStore.getState().profile.netTreatments).toEqual([]);
  });

  it("never sends NET treatment ids for a different cancer", () => {
    // Belt and braces for the agent path, which does not go through the form:
    // update_search_profile can set both fields independently.
    useTrialStore.setState({
      profile: { ...EMPTY_PROFILE, cancerId: "breast-cancer", netTreatments: ["everolimus"] },
    });
    expect(searchInputFromProfile(useTrialStore.getState().profile)?.netTreatments).toEqual([]);

    useTrialStore.setState({
      profile: { ...EMPTY_PROFILE, cancerId: NET_CANCER_ID, netTreatments: ["everolimus"] },
    });
    expect(searchInputFromProfile(useTrialStore.getState().profile)?.netTreatments).toEqual([
      "everolimus",
    ]);
  });

  it("states that the catalogue is a demonstration, not clinical advice", () => {
    render(<ProfileForm onClearRequest={() => {}} />);
    expect(screen.getByText(/Demonstration catalogue/i)).toBeInTheDocument();
    expect(screen.getByText(/require review by the study team/i)).toBeInTheDocument();
  });
});
