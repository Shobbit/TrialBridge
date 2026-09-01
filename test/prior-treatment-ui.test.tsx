import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsPanel } from "@/components/ResultsPanel";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import { partitionByPriorTreatment } from "@/lib/ctgov/prior-treatment";
import type { SearchMeta, Trial } from "@/lib/ctgov/types";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import { rawStudyFixture } from "./fixtures";

/**
 * How withheld trials are disclosed.
 *
 * The rule this file exists to protect: a person is always told that something
 * was withheld, how many, why, and can read every one of them. Silently
 * shortening a list of clinical trials would be the worst thing this app could
 * do, so it is asserted against the rendered DOM rather than the store.
 */

const base = normalizeStudy(rawStudyFixture) as Trial;

function study(nctId: string, briefTitle: string, exclusion: string): Trial {
  return {
    ...base,
    nctId,
    briefTitle,
    eligibilityCriteria: ["Inclusion Criteria:", "* Confirmed NET", "", "Exclusion Criteria:", `* ${exclusion}`].join(
      "\n",
    ),
  };
}

const excluded = study("NCT10000001", "Study with a firm bar", "Prior treatment with everolimus");
const flagged = study("NCT10000002", "Study with a washout", "Everolimus within 4 weeks");
const clear = study("NCT10000003", "Study with no mention", "Pregnancy or breastfeeding");

const meta: SearchMeta = {
  totalCount: 3,
  returnedCount: 2,
  removedOffTopic: 0,
  removedByStage: 0,
  hiddenByPriorTreatment: 1,
  recordsChecked: 3,
  pagesFetched: 1,
  stopReason: "no-more-pages" as const,
  upstreamUrls: [] as string[],
  nextPageToken: null,
  retrievedAt: new Date().toISOString(),
  upstreamUrl: "https://clinicaltrials.gov/api/v2/studies?query.cond=example",
  resolvedLocation: null,
  warnings: [],
};

function seedResults(trials: Trial[], treatmentIds: string[]) {
  const { visible, hidden } = partitionByPriorTreatment(trials, treatmentIds);
  useTrialStore.setState({
    profile: EMPTY_PROFILE,
    searchState: "success",
    searchError: null,
    results: visible,
    hiddenResults: hidden,
    showHiddenResults: false,
    resultsMeta: { ...meta, returnedCount: visible.length, hiddenByPriorTreatment: hidden.length },
  });
  return { visible, hidden };
}

beforeEach(() => {
  useTrialStore.setState({
    profile: EMPTY_PROFILE,
    results: [],
    hiddenResults: [],
    showHiddenResults: false,
    resultsMeta: null,
    searchState: "idle",
    searchError: null,
    shortlist: [],
  });
});

describe("disclosing what was withheld", () => {
  it("states how many studies were withheld and why", () => {
    seedResults([excluded, flagged, clear], ["everolimus"]);
    render(<ResultsPanel />);

    expect(screen.getByText(/1 study is not shown above/i)).toBeInTheDocument();
    expect(screen.getByText(/exclusion criterion naming a treatment you entered/i)).toBeInTheDocument();
    // Never a verdict about the person.
    expect(screen.queryByText(/you are not eligible/i)).not.toBeInTheDocument();
  });

  it("keeps the withheld study out of the list until asked", async () => {
    seedResults([excluded, flagged, clear], ["everolimus"]);
    render(<ResultsPanel />);

    expect(screen.queryByText("Study with a firm bar")).not.toBeInTheDocument();
    expect(screen.getByText("Study with a washout")).toBeInTheDocument();
    expect(screen.getByText("Study with no mention")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /show possibly excluded trials \(1\)/i }));

    expect(screen.getByText("Study with a firm bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide possibly excluded trials/i })).toBeInTheDocument();
  });

  it("shows the criterion that caused it, in the registry's own words", async () => {
    seedResults([excluded], ["everolimus"]);
    render(<ResultsPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /show possibly excluded/i }));

    expect(
      screen.getByText(/Possible prior-treatment exclusion — confirm with the study team/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Prior treatment with everolimus")).toBeInTheDocument();
    expect(screen.getByText(/Everolimus \(Afinitor\)/)).toBeInTheDocument();
  });

  it("says nothing about withheld studies when none were", () => {
    seedResults([flagged, clear], ["everolimus"]);
    render(<ResultsPanel />);

    expect(screen.queryByText(/not shown above/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show possibly excluded/i })).not.toBeInTheDocument();
  });

  it("shows the disclosure even when nothing else survived the filters", () => {
    // The one case where silence would be worst: an apparently empty result
    // that is entirely withheld studies.
    seedResults([excluded], ["everolimus"]);
    render(<ResultsPanel />);

    expect(screen.getByText(/1 study is not shown above/i)).toBeInTheDocument();
    expect(screen.queryByText(/No trials were returned/i)).not.toBeInTheDocument();
  });
});

describe("flagging without hiding", () => {
  it("marks a timing-dependent criterion in the main list", () => {
    seedResults([flagged], ["everolimus"]);
    render(<ResultsPanel />);

    const card = screen.getByText("Study with a washout").closest("article") as HTMLElement;
    expect(
      within(card).getByText(/Prior-treatment timing needs confirmation/i),
    ).toBeInTheDocument();
    expect(within(card).getByText("Everolimus within 4 weeks")).toBeInTheDocument();
  });

  it("leaves an unrelated study unmarked", () => {
    seedResults([clear], ["everolimus"]);
    render(<ResultsPanel />);

    const card = screen.getByText("Study with no mention").closest("article") as HTMLElement;
    expect(within(card).queryByText(/prior-treatment/i)).not.toBeInTheDocument();
  });

  it("marks nothing when no treatments were entered", () => {
    seedResults([excluded, flagged], []);
    render(<ResultsPanel />);

    expect(screen.getByText("Study with a firm bar")).toBeInTheDocument();
    expect(screen.queryByText(/prior-treatment/i)).not.toBeInTheDocument();
  });
});
