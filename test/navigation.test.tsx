import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrialBridgeApp } from "@/components/TrialBridgeApp";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial, TrialLocation } from "@/lib/ctgov/types";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import { rawStudyFixture, rawStudyFixtureB } from "./fixtures";

/**
 * Navigation and scrolling behaviour.
 *
 * The results page runs to many screens, so the shortlist and Compare controls
 * have to remain reachable, the comparison has to get the full page width, and
 * the detail dialog must not stack scrollbars inside itself.
 *
 * All fixtures are fictional.
 */

const trialA = normalizeStudy(rawStudyFixture) as Trial;
const trialB = normalizeStudy(rawStudyFixtureB) as Trial;

// jsdom has no layout engine, so scrollIntoView is stubbed rather than
// asserted on. requestAnimationFrame is deliberately NOT stubbed: the app
// schedules focus in a frame so the new view has rendered first, and a
// synchronous stub would fire before React commits, leaving the ref null.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();

  useTrialStore.setState({
    profile: EMPTY_PROFILE,
    results: [],
    resultsMeta: null,
    searchState: "idle",
    searchError: null,
    detailCache: {},
    shortlist: [],
    questions: [],
    openTrialId: null,
    comparisonOpen: false,
    preScreening: null,
    lastAgentActionAt: null,
    lastAgentAction: null,
  });
});

function shortlist(...trials: Trial[]) {
  for (const t of trials) useTrialStore.getState().addToShortlist(t, null, "human");
}

/** The persistent bar, which only exists once something is shortlisted. */
const bar = () => screen.queryByRole("region", { name: /Shortlist actions/i });

// --------------------------------------------------------------------------

describe("persistent shortlist bar", () => {
  it("is absent while the shortlist is empty", () => {
    render(<TrialBridgeApp />);
    expect(bar()).not.toBeInTheDocument();
  });

  it("appears as soon as one study is shortlisted, with the count", async () => {
    render(<TrialBridgeApp />);
    shortlist(trialA);

    await waitFor(() => expect(bar()).toBeInTheDocument());
    expect(within(bar()!).getByText(/1 study shortlisted/i)).toBeInTheDocument();
    expect(within(bar()!).getByRole("button", { name: /View shortlist \(1\)/i })).toBeInTheDocument();
  });

  it("pluralises and updates the count as the shortlist grows", async () => {
    render(<TrialBridgeApp />);
    shortlist(trialA, trialB);

    await waitFor(() => expect(within(bar()!).getByText(/2 studies shortlisted/i)).toBeInTheDocument());
    expect(within(bar()!).getByRole("button", { name: /View shortlist \(2\)/i })).toBeInTheDocument();
  });

  it("disappears again when the last study is removed", async () => {
    render(<TrialBridgeApp />);
    shortlist(trialA);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    useTrialStore.getState().removeFromShortlist(trialA.nctId);
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
  });

  it("offers Compare only once two studies are shortlisted", async () => {
    render(<TrialBridgeApp />);

    shortlist(trialA);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    expect(within(bar()!).getByRole("button", { name: /^Compare$/i })).toBeDisabled();

    shortlist(trialB);
    await waitFor(() =>
      expect(within(bar()!).getByRole("button", { name: /^Compare$/i })).toBeEnabled(),
    );
  });

  it("is reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<TrialBridgeApp />);
    shortlist(trialA, trialB);
    await waitFor(() => expect(bar()).toBeInTheDocument());

    const compare = within(bar()!).getByRole("button", { name: /^Compare$/i });
    compare.focus();
    expect(compare).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: /Comparing your shortlist/i })).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("comparison opens as a full-width view", () => {
  async function openComparison() {
    const user = userEvent.setup();
    render(<TrialBridgeApp />);
    shortlist(trialA, trialB);
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await user.click(within(bar()!).getByRole("button", { name: /^Compare$/i }));
    return user;
  }

  it("shows the comparison and hides the results grid", async () => {
    await openComparison();

    expect(
      await screen.findByRole("heading", { name: /Comparing your shortlist/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();

    // The narrow two-column layout is gone while comparing.
    expect(screen.queryByRole("region", { name: /Search results/i })).not.toBeInTheDocument();
    // Exact name: "Comparing your shortlist" would match a loose pattern too.
    expect(screen.queryByRole("region", { name: "Your shortlist" })).not.toBeInTheDocument();
  });

  it("moves focus to the comparison so keyboard users land there", async () => {
    await openComparison();
    const section = screen
      .getByRole("heading", { name: /Comparing your shortlist/i })
      .closest("section");
    expect(section).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(section).toHaveFocus());
  });

  it("offers Back to results at the top and the bottom", async () => {
    await openComparison();
    expect(screen.getAllByRole("button", { name: /Back to results/i })).toHaveLength(3); // 2 in view + 1 in the bar
  });

  it("returns to the results grid", async () => {
    const user = await openComparison();
    await user.click(screen.getAllByRole("button", { name: /Back to results/i })[0]);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /Search results/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("closes itself if the shortlist drops below two studies", async () => {
    await openComparison();
    expect(screen.getByRole("table")).toBeInTheDocument();

    useTrialStore.getState().removeFromShortlist(trialB.nctId);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /Your shortlist/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the table in its own horizontally scrollable container", async () => {
    await openComparison();
    // The page must never scroll sideways; only this wrapper may.
    const scroller = screen.getByRole("table").parentElement;
    expect(scroller?.className).toContain("overflow-x-auto");
  });

  it("still carries the non-eligibility disclaimer", async () => {
    await openComparison();
    expect(screen.getByText(/does not determine eligibility/i)).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("shortlist panel Compare button", () => {
  it("is disabled with one study and enabled with two", async () => {
    render(<TrialBridgeApp />);
    const panel = () => screen.getByRole("region", { name: /Your shortlist/i });

    shortlist(trialA);
    await waitFor(() =>
      expect(within(panel()).getByRole("button", { name: /^Compare$/i })).toBeDisabled(),
    );

    shortlist(trialB);
    await waitFor(() =>
      expect(within(panel()).getByRole("button", { name: /^Compare$/i })).toBeEnabled(),
    );
  });

  it("opens the same full-width comparison", async () => {
    const user = userEvent.setup();
    render(<TrialBridgeApp />);
    shortlist(trialA, trialB);

    const panel = screen.getByRole("region", { name: /Your shortlist/i });
    await user.click(within(panel).getByRole("button", { name: /^Compare$/i }));

    expect(
      await screen.findByRole("heading", { name: /Comparing your shortlist/i }),
    ).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("trial detail dialog scrolling", () => {
  /** A study with more sites than the preview shows. */
  function trialWithManyLocations(count: number): Trial {
    const locations: TrialLocation[] = Array.from({ length: count }, (_, i) => ({
      facility: `Example Site ${i + 1}`,
      city: `City ${i + 1}`,
      state: "Example State",
      country: "United States",
      zip: null,
      status: "RECRUITING",
      lat: null,
      lon: null,
      distanceMiles: i + 1,
    }));
    return { ...trialA, locations, nearestLocationMiles: 1 };
  }

  it("has a single scroll container: the dialog itself", async () => {
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(trialA);
    useTrialStore.getState().setOpenTrialId(trialA.nctId);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("overflow-y-auto");

    // Nothing inside it may introduce a second vertical scrollbar.
    const nested = dialog.querySelectorAll('[class*="overflow-y-auto"], [class*="max-h-"]');
    expect(nested).toHaveLength(0);
  });

  it("keeps Close reachable in a sticky header", async () => {
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(trialA);
    useTrialStore.getState().setOpenTrialId(trialA.nctId);

    const dialog = await screen.findByRole("dialog");
    const close = within(dialog).getByRole("button", { name: /^Close$/i });
    expect(close.closest("header")?.className).toContain("sticky");
  });

  it("shows only the nearest few locations, with a control to reveal the rest", async () => {
    const user = userEvent.setup();
    const many = trialWithManyLocations(40);
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(many);
    useTrialStore.getState().setOpenTrialId(many.nctId);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Example Site 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Example Site 5")).toBeInTheDocument();
    expect(within(dialog).queryByText("Example Site 6")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Showing the 5 nearest of 40/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Show all 40 locations/i }));

    expect(within(dialog).getByText("Example Site 40")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Show fewer locations/i }),
    ).toBeInTheDocument();
  });

  it("offers no expand control when every location already fits", async () => {
    const few = trialWithManyLocations(3);
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(few);
    useTrialStore.getState().setOpenTrialId(few.nctId);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Example Site 3")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Show all/i })).not.toBeInTheDocument();
  });

  it("starts a different study collapsed, even after expanding another", async () => {
    const user = userEvent.setup();
    const manyA = trialWithManyLocations(40);
    // Expansion is tracked per study, so a second study must open collapsed.
    const manyB = { ...trialWithManyLocations(40), nctId: trialB.nctId };

    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(manyA);
    useTrialStore.getState().cacheDetail(manyB);
    useTrialStore.getState().setOpenTrialId(manyA.nctId);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Show all 40 locations/i }));
    expect(within(dialog).getByText("Example Site 40")).toBeInTheDocument();

    useTrialStore.getState().setOpenTrialId(manyB.nctId);

    await waitFor(() => expect(screen.queryByText("Example Site 40")).not.toBeInTheDocument());
    expect(screen.getByText(/Showing the 5 nearest of 40/i)).toBeInTheDocument();
  });

  it("keeps a study expanded if you return to it", async () => {
    const user = userEvent.setup();
    const manyA = trialWithManyLocations(40);
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(manyA);
    useTrialStore.getState().setOpenTrialId(manyA.nctId);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Show all 40 locations/i }));

    // Close and reopen the same study: the choice is remembered.
    useTrialStore.getState().setOpenTrialId(null);
    useTrialStore.getState().setOpenTrialId(manyA.nctId);

    await waitFor(() => expect(screen.getByText("Example Site 40")).toBeInTheDocument());
  });

  it("renders the full criteria without its own scrollbar", async () => {
    render(<TrialBridgeApp />);
    useTrialStore.getState().cacheDetail(trialA);
    useTrialStore.getState().setOpenTrialId(trialA.nctId);

    const dialog = await screen.findByRole("dialog");
    const criteria = within(dialog).getByText(/Prior treatment with an example compound/);
    expect(criteria.className).not.toContain("overflow-y-auto");
    expect(criteria.className).not.toContain("max-h-");
  });
});
