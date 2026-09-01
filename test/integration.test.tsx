import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrialBridgeApp } from "@/components/TrialBridgeApp";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import type { ToolDescriptor, ToolResult } from "@/types/webmcp";
import { parseCriteria } from "@/lib/criteria";
import { rawStudyFixture, rawStudyFixtureB, searchResponseFixture } from "./fixtures";

/**
 * End-to-end verification of the central WebMCP claim:
 *
 *   the tools and the human interface operate on the same live state, so an
 *   agent action is immediately visible on screen.
 *
 * These tests render the real application, register the real tools through a
 * mock `document.modelContext`, invoke them exactly as a browser agent would,
 * and then assert against the rendered DOM — not against the store.
 */

const trialA = normalizeStudy(rawStudyFixture) as Trial;
const trialB = normalizeStudy(rawStudyFixtureB) as Trial;

/** Stands in for the browser's WebMCP implementation. */
function installMockModelContext() {
  const registry = new Map<string, ToolDescriptor>();
  const registerTool = vi.fn((tool: ToolDescriptor) => {
    registry.set(tool.name, tool);
    return Promise.resolve();
  });

  (document as unknown as { modelContext: unknown }).modelContext = { registerTool };

  return {
    registerTool,
    registry,
    /** Invokes a registered tool the way an agent host would. */
    async callTool(name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
      const tool = registry.get(name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      return (await tool.execute(input)) as ToolResult;
    },
  };
}

function structured(result: ToolResult): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
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
    preScreening: null,
    lastAgentActionAt: null,
    lastAgentAction: null,
  });
});

// --------------------------------------------------------------------------

describe("registration on the top-level page", () => {
  it("registers all ten tools when the app mounts", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);

    await waitFor(() => expect(mcp.registerTool).toHaveBeenCalledTimes(10));
    expect([...mcp.registry.keys()]).toEqual([
      "get_search_profile",
      "update_search_profile",
      "search_clinical_trials",
      "get_trial_details",
      "shortlist_trial",
      "remove_shortlisted_trial",
      "compare_shortlisted_trials",
      "save_screening_question",
      "start_trial_prescreening",
      "record_prescreening_responses",
    ]);
  });

  it("tells the user when WebMCP is active", async () => {
    installMockModelContext();
    render(<TrialBridgeApp />);
    expect(await screen.findByText(/WebMCP active — 10 tools registered/)).toBeInTheDocument();
  });

  it("keeps working and shows a notice when document.modelContext is absent", async () => {
    render(<TrialBridgeApp />);

    expect(await screen.findByText(/WebMCP not available in this browser/)).toBeInTheDocument();
    expect(screen.getByText(/requires a browser or extension/i)).toBeInTheDocument();

    // The ordinary interface is still fully present and usable.
    expect(screen.getByLabelText(/Type of cancer/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /Search trials/i })).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("agent writes are visible to the human", () => {
  it("update_search_profile puts values into the form the person can see", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));

    await mcp.callTool("update_search_profile", {
      cancerId: "neuroendocrine-and-adrenal-tumors",
      age: 54,
      city: "Chicago",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Type of cancer/i)).toHaveValue(
        "neuroendocrine-and-adrenal-tumors",
      );
    });
    expect(screen.getByLabelText(/Age in years/i)).toHaveValue(54);
    expect(screen.getByLabelText(/^City$/i)).toHaveValue("Chicago");
  });

  it("get_search_profile reads back what the human typed", async () => {
    const user = userEvent.setup();
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));

    await user.selectOptions(
      screen.getByLabelText(/Type of cancer/i),
      "neuroendocrine-and-adrenal-tumors",
    );

    const data = structured(await mcp.callTool("get_search_profile"));
    expect((data.profile as Record<string, unknown>).cancerId).toBe(
      "neuroendocrine-and-adrenal-tumors",
    );
    expect(data.readyToSearch).toBe(true);
  });

  it("search_clinical_trials renders trial cards on the page", async () => {
    const mcp = installMockModelContext();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([trialA, trialB]),
      }),
    );

    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));

    // Before: the empty state is showing.
    expect(screen.getByText(/No search has run yet/i)).toBeInTheDocument();

    await mcp.callTool("search_clinical_trials", { condition: "example condition" });

    // After: real cards, with NCT numbers and source links.
    expect(
      await screen.findByText(/A Study of Example Compound in Adults With Example Condition/),
    ).toBeInTheDocument();
    expect(screen.getByText("NCT00000001")).toBeInTheDocument();
    expect(screen.getByText("NCT00000002")).toBeInTheDocument();
    expect(screen.queryByText(/No search has run yet/i)).not.toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /ClinicalTrials.gov record/i });
    expect(links[0]).toHaveAttribute("href", "https://clinicaltrials.gov/study/NCT00000001");
  });

  it("shows the three-way analysis on each rendered card", async () => {
    const mcp = installMockModelContext();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([trialA]),
      }),
    );

    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    await mcp.callTool("search_clinical_trials", { condition: "example condition", age: 54 });

    expect(await screen.findByText(/Reasons it may be relevant/)).toBeInTheDocument();
    expect(screen.getByText(/Apparent mismatches/)).toBeInTheDocument();
    expect(screen.getByText(/Still unknown/)).toBeInTheDocument();
  });

  it("shortlist_trial adds a visibly agent-attributed entry", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    expect(screen.getByText(/Nothing shortlisted yet/i)).toBeInTheDocument();

    await mcp.callTool("shortlist_trial", {
      nctId: "NCT00000001",
      note: "Published age range includes the age entered.",
    });

    const shortlist = await screen.findByRole("region", { name: /Your shortlist/i });
    expect(within(shortlist).getByText("NCT00000001")).toBeInTheDocument();
    expect(within(shortlist).getByText(/Added by agent/i)).toBeInTheDocument();
    expect(
      within(shortlist).getByText(/Published age range includes the age entered\./),
    ).toBeInTheDocument();
  });

  it("the human can remove what the agent shortlisted", async () => {
    const user = userEvent.setup();
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("shortlist_trial", { nctId: "NCT00000001" });
    const shortlist = await screen.findByRole("region", { name: /Your shortlist/i });

    await user.click(within(shortlist).getByRole("button", { name: /^Remove$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Nothing shortlisted yet/i)).toBeInTheDocument();
    });
    // And the agent can observe that removal on its next call.
    const data = structured(await mcp.callTool("get_search_profile"));
    expect(data.shortlistCount).toBe(0);
  });

  it("remove_shortlisted_trial removes the entry from the page", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("shortlist_trial", { nctId: "NCT00000001" });
    await screen.findByText("NCT00000001");

    await mcp.callTool("remove_shortlisted_trial", { nctId: "NCT00000001" });

    await waitFor(() => {
      expect(screen.getByText(/Nothing shortlisted yet/i)).toBeInTheDocument();
    });
  });

  it("save_screening_question makes the question appear in the interface", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("save_screening_question", {
      question: "Would my previous therapy affect eligibility for this study?",
      nctId: "NCT00000001",
      rationale: "The criteria mention prior therapy but not its effect.",
    });

    const panel = await screen.findByRole("region", { name: /Questions for the study team/i });
    expect(
      within(panel).getByText(/Would my previous therapy affect eligibility for this study\?/),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/Suggested by agent/i)).toBeInTheDocument();
  });

  it("get_trial_details opens the detail panel with verbatim criteria", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("get_trial_details", { nctId: "NCT00000001" });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Eligibility criteria \(verbatim/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Prior treatment with an example compound\./),
    ).toBeInTheDocument();
  });

  it("reports the most recent agent action back to the person", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));

    await mcp.callTool("update_search_profile", { city: "Chicago" });

    expect(await screen.findByText(/Last agent action:/)).toBeInTheDocument();
    expect(screen.getByText(/Updated search form: city/)).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("loading and error states", () => {
  it("shows an error panel when the search fails", async () => {
    const mcp = installMockModelContext();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: "ClinicalTrials.gov is rate limiting requests. Please wait a moment and try again.",
          retryable: true,
        }),
      }),
    );

    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));

    const result = await mcp.callTool("search_clinical_trials", { condition: "example condition" });
    expect(result.isError).toBe(true);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be completed/i)).toBeInTheDocument();
    expect(within(alert).getByText(/rate limiting/i)).toBeInTheDocument();
  });

  it("shows the empty state when a search returns nothing", async () => {
    const mcp = installMockModelContext();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([]),
      }),
    );

    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    await mcp.callTool("search_clinical_trials", { condition: "example condition" });

    expect(await screen.findByText(/No studies matched those criteria/i)).toBeInTheDocument();
  });

  it("surfaces a non-fatal warning without failing the search", async () => {
    const mcp = installMockModelContext();
    const payload = searchResponseFixture([trialA]);
    payload.meta.warnings = ["The location could not be resolved to coordinates."];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
    );

    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    await mcp.callTool("search_clinical_trials", { condition: "example condition" });

    expect(
      await screen.findByText(/location could not be resolved to coordinates/i),
    ).toBeInTheDocument();
    expect(screen.getByText("NCT00000001")).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("clear my information", () => {
  it("wipes agent-created state from the page after confirmation", async () => {
    const user = userEvent.setup();
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("update_search_profile", {
      cancerId: "neuroendocrine-and-adrenal-tumors",
    });
    await mcp.callTool("shortlist_trial", { nctId: "NCT00000001" });
    await mcp.callTool("save_screening_question", { question: "How often are study visits?" });
    await screen.findByText("NCT00000001");

    await user.click(screen.getByRole("button", { name: /Clear my information/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /Clear everything/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Type of cancer/i)).toHaveValue("");
    });
    expect(screen.getByText(/Nothing shortlisted yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No questions yet/i)).toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------

describe("guided pre-screening is visible on the page", () => {
  it("renders criteria verbatim after the agent starts a session", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });

    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    expect(within(panel).getByText(/Inclusion criteria/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Exclusion criteria/i)).toBeInTheDocument();
    // The registry's own wording, unaltered.
    expect(
      within(panel).getByText(/Adults with a confirmed example condition/),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/Prior treatment with an example compound/),
    ).toBeInTheDocument();
  });

  it("shows the fictional-data beta warning and the source link", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });

    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    expect(within(panel).getAllByText(/fictional information only/i).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("link", { name: /NCT00000001/ })).toHaveAttribute(
      "href",
      "https://clinicaltrials.gov/study/NCT00000001",
    );
  });

  it("displays a recorded comparison beside its criterion, labelled agent-assisted", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });
    const criterionId = parseCriteria(trialA).criteria.find((c) => c.type === "inclusion")!
      .criterionId;

    await mcp.callTool("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          criterionId,
          questionAsked: "Have you been told you have an example condition?",
          patientAnswer: "Yes",
          answerType: "text",
          comparison: "appears_consistent",
          explanation: "You said you have an example condition, which is what this criterion asks about.",
        },
      ],
    });

    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    expect(within(panel).getByText(/Agent-assisted preliminary comparison/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Appears consistent with this criterion/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/Have you been told you have an example condition\?/),
    ).toBeInTheDocument();
    // The verbatim criterion is still shown next to the conclusion.
    expect(
      within(panel).getByText(/Adults with a confirmed example condition/),
    ).toBeInTheDocument();
  });

  it("shows unknown answers as still unknown", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });
    const criterionId = parseCriteria(trialA).criteria.find((c) => c.type === "exclusion")!
      .criterionId;

    await mcp.callTool("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          criterionId,
          questionAsked: "Have you had an example compound before?",
          patientAnswer: null,
          answerType: "unknown",
          comparison: "unresolved",
          explanation: "You were not sure, so this stays open for the study team.",
        },
      ],
    });

    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    expect(within(panel).getByText(/Still unknown/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Not known/i)).toBeInTheDocument();
  });

  it("never shows a score, percentage or X-of-Y summary", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });
    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    const text = panel.textContent ?? "";

    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\d+\s*(?:of|out of|\/)\s*\d+\s+criteri/i);
    expect(text.toLowerCase()).not.toContain("score");
    expect(text.toLowerCase()).not.toContain("you are eligible");
    expect(text.toLowerCase()).not.toContain("you qualify");
  });

  it("lets the human clear the session", async () => {
    const user = userEvent.setup();
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore.getState().cacheDetail(trialA);

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });
    const panel = await screen.findByRole("region", { name: /Pre-screening/i });

    await user.click(within(panel).getByRole("button", { name: /Clear pre-screening/i }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: /Pre-screening/i })).not.toBeInTheDocument();
    });
  });

  it("shows the raw block for criteria that cannot be segmented", async () => {
    const mcp = installMockModelContext();
    render(<TrialBridgeApp />);
    await waitFor(() => expect(mcp.registry.size).toBe(10));
    useTrialStore
      .getState()
      .cacheDetail({ ...trialA, eligibilityCriteria: "Unstructured prose with no headings." });

    await mcp.callTool("start_trial_prescreening", { nctId: "NCT00000001" });

    const panel = await screen.findByRole("region", { name: /Pre-screening/i });
    expect(within(panel).getAllByText(/manual review/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Unstructured prose with no headings/)).toBeInTheDocument();
  });
});
