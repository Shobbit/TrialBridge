import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TrialBridgeApp } from "@/components/TrialBridgeApp";
import { NET_CANCER_ID } from "@/lib/catalog/cancers";
import { resolveCancer, resolveTreatment } from "@/lib/catalog/lookup";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import type { ToolDescriptor, ToolResult } from "@/types/webmcp";
import { rawStudyFixture, searchResponseFixture } from "./fixtures";

/**
 * What a visiting agent can do.
 *
 * The claim TrialBridge makes is that an agent operates the same application a
 * person does — not a parallel API with its own rules. So these tests drive the
 * real tools through a mock `document.modelContext` and assert on what the
 * tools return and what the page then shows.
 *
 * The safety-critical half is refusal: an agent relaying a half-remembered drug
 * or cancer name must be told the value was not recognised, never quietly given
 * a near miss. Searching the wrong disease is worse than searching nothing.
 *
 * All NCT ids and study details are fictional.
 */

function installMockModelContext() {
  const registry = new Map<string, ToolDescriptor>();
  (document as unknown as { modelContext: unknown }).modelContext = {
    registerTool: vi.fn((tool: ToolDescriptor) => {
      registry.set(tool.name, tool);
      return Promise.resolve();
    }),
  };
  return {
    registry,
    async call(name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
      const tool = registry.get(name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      return (await tool.execute(input)) as ToolResult;
    },
  };
}

/**
 * The structured payload, typed loosely on purpose.
 *
 * These tests assert against the shape an agent actually receives over the
 * wire, so binding them to this app's internal types would let a change in
 * those types silently change the contract without a test noticing.
 */
interface StructuredResult {
  [key: string]: unknown;
  ok: boolean;
  error: { code: string; message: string };
  priorTreatment: {
    status: string;
    withheld: boolean;
    note: string;
    matches: { treatment: string; finding: string; criterion: string }[];
  };
  filtering: Record<string, unknown>;
  trials: StructuredResult[];
  withheldTrials: StructuredResult[];
  selectedTreatments: unknown[];
  missingFields: string[];
}

function structured(result: ToolResult): StructuredResult {
  return (result.structuredContent ?? {}) as StructuredResult;
}

/** A study whose exclusion criteria bar a drug outright. */
function study(nctId: string, exclusion: string) {
  return {
    ...rawStudyFixture,
    protocolSection: {
      ...rawStudyFixture.protocolSection,
      identificationModule: {
        ...rawStudyFixture.protocolSection.identificationModule,
        nctId,
        briefTitle: `Fictional NET study ${nctId}`,
      },
      conditionsModule: { conditions: ["Neuroendocrine Tumors"] },
      eligibilityModule: {
        ...rawStudyFixture.protocolSection.eligibilityModule,
        eligibilityCriteria: [
          "Inclusion Criteria:",
          "* Confirmed neuroendocrine tumor",
          "",
          "Exclusion Criteria:",
          `* ${exclusion}`,
        ].join("\n"),
      },
    },
  };
}

async function mountWithTools() {
  const mcp = installMockModelContext();
  render(<TrialBridgeApp />);
  await waitFor(() => expect(mcp.registry.size).toBe(10));
  return mcp;
}

beforeEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  useTrialStore.setState({
    profile: EMPTY_PROFILE,
    results: [],
    hiddenResults: [],
    showHiddenResults: false,
    resultsMeta: null,
    searchState: "idle",
    searchError: null,
    detailCache: {},
    shortlist: [],
    questions: [],
    openTrialId: null,
    comparisonOpen: false,
    preScreening: null,
  });
});

// ---------------------------------------------------------------------------

describe("the tool surface is unchanged in size", () => {
  it("still registers exactly the ten tools", async () => {
    const mcp = await mountWithTools();
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
});

describe("setting the cancer", () => {
  it("accepts the canonical catalogue id", async () => {
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", { cancerId: NET_CANCER_ID });

    expect(structured(result).ok).toBe(true);
    expect(useTrialStore.getState().profile.cancerId).toBe(NET_CANCER_ID);
  });

  it("accepts an alias and stores the canonical id", async () => {
    // An agent relaying "AML" from a conversation should not need to know slugs.
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: "AML" });

    expect(useTrialStore.getState().profile.cancerId).toBe("acute-myeloid-leukemia");
  });

  it("accepts the display label, punctuation and case aside", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: "small cell lung cancer" });

    expect(useTrialStore.getState().profile.cancerId).toBe(resolveCancer("SCLC")?.id);
  });

  it("refuses an unrecognised cancer instead of guessing", async () => {
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", { cancerId: "lung cancer" });

    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("UNKNOWN_CANCER");
    // Nothing was written — a partial write here would search a disease nobody
    // chose.
    expect(useTrialStore.getState().profile.cancerId).toBe("");
  });

  it("shows the agent's selection in the visible form", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: "AML" });

    const select = screen.getByLabelText(/type of cancer/i) as HTMLSelectElement;
    expect(select.value).toBe("acute-myeloid-leukemia");
  });
});

describe("setting the stage", () => {
  it("reads and writes the stage", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerStage: "IV" });

    expect(useTrialStore.getState().profile.cancerStage).toBe("IV");
    expect(structured(await mcp.call("get_search_profile")).cancerStage).toBe("IV");
  });

  it("rejects a stage that is not one the form offers", async () => {
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", { cancerStage: "3b" });

    expect(result.isError).toBe(true);
    expect(useTrialStore.getState().profile.cancerStage).toBe("unspecified");
  });
});

describe("setting prior treatments", () => {
  it("accepts a brand name and stores the catalogue id", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { netTreatments: ["Afinitor"] });

    expect(useTrialStore.getState().profile.netTreatments).toEqual(["everolimus"]);
  });

  it("treats two names for one drug as one treatment", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { netTreatments: ["everolimus", "Afinitor"] });

    expect(useTrialStore.getState().profile.netTreatments).toEqual(["everolimus"]);
  });

  it("refuses an unrecognised treatment and writes nothing", async () => {
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", {
      netTreatments: ["everolimus", "some drug he mentioned"],
    });

    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("UNKNOWN_TREATMENT");
    expect(useTrialStore.getState().profile.netTreatments).toEqual([]);
  });

  it("reports treatments back by name, not by slug", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: NET_CANCER_ID, netTreatments: ["Afinitor"] });

    const profile = structured(await mcp.call("get_search_profile"));
    expect(profile.selectedTreatments).toEqual([
      { id: "everolimus", name: "Everolimus", brands: ["Afinitor"], category: "Targeted therapy" },
    ]);
    expect(profile.treatmentCatalogueApplies).toBe(true);
  });

  it("says the catalogue does not apply to another cancer", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: "AML" });

    const profile = structured(await mcp.call("get_search_profile"));
    expect(profile.treatmentCatalogueApplies).toBe(false);
    expect(profile.missingFields).not.toContain("netTreatments");
  });
});

describe("what the search tool reports back", () => {
  const excluding = normalizeStudy(study("NCT80000001", "Prior treatment with everolimus")) as Trial;
  const flagged = normalizeStudy(study("NCT80000002", "Everolimus within 4 weeks")) as Trial;

  function stubSearchResponse(trials: Trial[], hidden: Trial[], meta: Record<string, unknown> = {}) {
    const payload = searchResponseFixture(trials);
    payload.hiddenTrials = hidden;
    Object.assign(payload.meta, {
      recordsChecked: 63,
      pagesFetched: 3,
      stopReason: "target-reached",
      removedOffTopic: 38,
      removedByStage: 2,
      hiddenByPriorTreatment: hidden.length,
      ...meta,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
    );
  }

  it("separates trials shown from records checked", async () => {
    stubSearchResponse([flagged], []);
    const mcp = await mountWithTools();

    const data = structured(await mcp.call("search_clinical_trials", { condition: "NET" }));

    expect(data.returnedCount).toBe(1);
    expect(data.recordsChecked).toBe(63);
    expect(data.pagesFetched).toBe(3);
  });

  it("reports what was removed and on what grounds", async () => {
    stubSearchResponse([flagged], [excluding]);
    const mcp = await mountWithTools();

    const data = structured(await mcp.call("search_clinical_trials", { condition: "NET" }));

    expect(data.filtering).toMatchObject({
      removedOffTopic: 38,
      removedByStage: 2,
      withheldByPriorTreatment: 1,
    });
  });

  it("says when it stopped at a limit rather than at the end", async () => {
    stubSearchResponse([flagged], [], { stopReason: "page-limit" });
    const mcp = await mountWithTools();

    const result = await mcp.call("search_clinical_trials", { condition: "NET" });

    expect(structured(result).stopReason).toBe("page-limit");
    expect(result.content[0].text).toMatch(/stopped at its own limit, so more studies may match/i);
  });

  it("hands back the withheld trials with the criterion that withheld them", async () => {
    // The agent must be able to explain the list, not just repeat it.
    useTrialStore.setState({
      profile: { ...EMPTY_PROFILE, cancerId: NET_CANCER_ID, netTreatments: ["everolimus"] },
    });
    const { partitionByPriorTreatment } = await import("@/lib/ctgov/prior-treatment");
    const { visible, hidden } = partitionByPriorTreatment([excluding, flagged], ["everolimus"]);
    stubSearchResponse(visible, hidden);
    const mcp = await mountWithTools();

    const data = structured(await mcp.call("search_clinical_trials", { condition: "NET" }));

    expect(data.withheldTrials).toHaveLength(1);
    expect(data.withheldTrials[0].nctId).toBe("NCT80000001");
    expect(data.withheldTrials[0].priorTreatment.matches[0]).toMatchObject({
      treatment: "Everolimus (Afinitor)",
      finding: "excluded",
      criterion: "Prior treatment with everolimus",
    });
    // And the one that was only flagged stayed in the main list.
    expect(data.trials[0].priorTreatment.status).toBe("timing-unclear");
  });

  it("leaves the withheld trials collapsed unless asked to reveal them", async () => {
    const { partitionByPriorTreatment } = await import("@/lib/ctgov/prior-treatment");
    const { visible, hidden } = partitionByPriorTreatment([excluding, flagged], ["everolimus"]);
    stubSearchResponse(visible, hidden);
    const mcp = await mountWithTools();

    await mcp.call("search_clinical_trials", { condition: "NET" });
    expect(useTrialStore.getState().showHiddenResults).toBe(false);

    await mcp.call("search_clinical_trials", { condition: "NET", showPossiblyExcluded: true });
    expect(useTrialStore.getState().showHiddenResults).toBe(true);
    expect(await screen.findByText(/Fictional NET study NCT80000001/)).toBeInTheDocument();
  });

  it("refuses an unrecognised cancer without running a search", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mcp = await mountWithTools();

    const result = await mcp.call("search_clinical_trials", { cancerId: "lung cancer" });

    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("UNKNOWN_CANCER");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("explaining one trial", () => {
  it("reports the prior-treatment screen for a study fetched on its own", async () => {
    useTrialStore.setState({
      profile: { ...EMPTY_PROFILE, cancerId: NET_CANCER_ID, netTreatments: ["everolimus"] },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          trial: normalizeStudy(study("NCT80000003", "Prior treatment with everolimus")),
        }),
      }),
    );
    const mcp = await mountWithTools();

    const data = structured(await mcp.call("get_trial_details", { nctId: "NCT80000003" }));

    expect(data.priorTreatment.status).toBe("excluded");
    expect(data.priorTreatment.matches[0].criterion).toBe("Prior treatment with everolimus");
    // Evidence, never a verdict.
    expect(data.priorTreatment.note).toMatch(/never state that they are ineligible/i);
  });

  it("distinguishes 'not screened' from 'nothing found'", async () => {
    // No treatments entered: the study was not checked, and saying "clear"
    // would be a claim nobody made.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          trial: normalizeStudy(study("NCT80000004", "Prior treatment with everolimus")),
        }),
      }),
    );
    const mcp = await mountWithTools();

    const data = structured(await mcp.call("get_trial_details", { nctId: "NCT80000004" }));

    expect(data.priorTreatment.status).toBe("not-screened");
    expect(data.priorTreatment.withheld).toBe(false);
  });
});

describe("catalogue name resolution", () => {
  it("matches ids, labels, aliases and brands exactly", () => {
    expect(resolveCancer("acute-myeloid-leukemia")?.id).toBe("acute-myeloid-leukemia");
    expect(resolveCancer("Acute Myeloid Leukemia")?.id).toBe("acute-myeloid-leukemia");
    expect(resolveCancer("  aml  ")?.id).toBe("acute-myeloid-leukemia");
    expect(resolveTreatment("Afinitor")?.id).toBe("everolimus");
    expect(resolveTreatment("5-FU")?.id).toBe("fluorouracil-5-fu");
  });

  it("never resolves a partial name", () => {
    // "leukemia" alone must not silently become one particular leukaemia.
    expect(resolveCancer("leukemia")).toBeUndefined();
    expect(resolveCancer("lung")).toBeUndefined();
    expect(resolveTreatment("plat")).toBeUndefined();
    expect(resolveTreatment("")).toBeUndefined();
  });
});

describe("setting the state", () => {
  it("accepts a code and stores the full state name", async () => {
    // The form only lets a person choose from a list; the agent has to land on
    // the same canonical value, not a variant of it.
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { state: "IL" });

    expect(useTrialStore.getState().profile.state).toBe("Illinois");
  });

  it("accepts the full name in any casing", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { state: "new york" });

    expect(useTrialStore.getState().profile.state).toBe("New York");
  });

  it("refuses a misspelt US state and writes nothing", async () => {
    // "Ilinois" geocodes to nothing, which would silently narrow the search.
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", { state: "Ilinois" });

    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("UNKNOWN_STATE");
    expect(useTrialStore.getState().profile.state).toBe("");
  });

  it("allows free text once the country is not the United States", async () => {
    const mcp = await mountWithTools();
    const result = await mcp.call("update_search_profile", {
      country: "India",
      state: "Maharashtra",
    });

    expect(structured(result).ok).toBe(true);
    expect(useTrialStore.getState().profile.state).toBe("Maharashtra");
  });

  it("reads the country from the same call, not just the stored profile", async () => {
    // Country and state arriving together must be judged together, or the
    // first search after a move abroad is rejected for no reason.
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { country: "Canada", state: "Ontario" });

    expect(useTrialStore.getState().profile.state).toBe("Ontario");
  });

  it("shows the agent's choice in the visible dropdown", async () => {
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { state: "TX" });

    expect((screen.getByLabelText(/^state$/i) as HTMLSelectElement).value).toBe("Texas");
  });

  it("refuses a misspelt state at search time without running a search", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mcp = await mountWithTools();

    const result = await mcp.call("search_clinical_trials", {
      condition: "melanoma",
      state: "Californa",
    });

    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("UNKNOWN_STATE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the agent changes what the person is looking at", () => {
  /**
   * Found by running the real thing in ChatGPT.
   *
   * The comparison flag used to be React state inside TrialBridgeApp, which the
   * tool handlers — running outside React — could not reach. So
   * `compare_shortlisted_trials` reported "the comparison view is now shown on
   * the page" and returned `visibleInUi: true` while nothing on screen moved,
   * and `start_trial_prescreening` ran an entire session behind a comparison
   * view the person was still looking at.
   *
   * These assert against the rendered DOM, not the store, because the store was
   * never the thing that was wrong.
   */

  async function shortlistTwo(mcp: Awaited<ReturnType<typeof mountWithTools>>) {
    const a = normalizeStudy(study("NCT70000001", "Pregnancy")) as Trial;
    const b = normalizeStudy(study("NCT70000002", "Pregnancy")) as Trial;
    useTrialStore.getState().addToShortlist(a, null, "human");
    useTrialStore.getState().addToShortlist(b, null, "human");
    return mcp;
  }

  it("opens the comparison view on the page, not just in its reply", async () => {
    const mcp = await shortlistTwo(await mountWithTools());

    expect(screen.queryByRole("heading", { name: /comparing your shortlist/i })).not.toBeInTheDocument();

    await mcp.call("compare_shortlisted_trials", {});

    expect(
      await screen.findByRole("heading", { name: /comparing your shortlist/i }),
    ).toBeInTheDocument();
  });

  it("does not claim a view is open unless it is", async () => {
    const mcp = await shortlistTwo(await mountWithTools());
    const result = await mcp.call("compare_shortlisted_trials", {});

    expect(result.content[0].text).toMatch(/comparison view is now open/i);
    expect(structured(result).verification).toMatchObject({
      visibleInUi: true,
      comparisonViewOpen: true,
    });
    // The claim and the state must agree.
    expect(useTrialStore.getState().comparisonOpen).toBe(true);
  });

  it("leaves the comparison view when pre-screening starts", async () => {
    // Otherwise the session runs behind a screen nobody is looking at.
    const mcp = await shortlistTwo(await mountWithTools());
    await mcp.call("compare_shortlisted_trials", {});
    expect(screen.getByRole("heading", { name: /comparing your shortlist/i })).toBeInTheDocument();

    await mcp.call("start_trial_prescreening", { nctId: "NCT70000001" });

    expect(
      screen.queryByRole("heading", { name: /comparing your shortlist/i }),
    ).not.toBeInTheDocument();
    expect(useTrialStore.getState().comparisonOpen).toBe(false);
    expect(useTrialStore.getState().preScreening?.nctId).toBe("NCT70000001");
  });

  it("shows the pre-screening panel once the view has been left", async () => {
    const mcp = await shortlistTwo(await mountWithTools());
    await mcp.call("compare_shortlisted_trials", {});
    await mcp.call("start_trial_prescreening", { nctId: "NCT70000001" });

    // The panel lives in the results column, which the comparison view replaced.
    // Asserting on the panel itself, not on the NCT id, which also appears in
    // the shortlist and the results list.
    expect(await screen.findByRole("heading", { name: /^Pre-screening$/i })).toBeInTheDocument();
  });

  it("stops showing the comparison if the shortlist drops below two", async () => {
    const mcp = await shortlistTwo(await mountWithTools());
    await mcp.call("compare_shortlisted_trials", {});

    await mcp.call("remove_shortlisted_trial", { nctId: "NCT70000002" });

    expect(
      screen.queryByRole("heading", { name: /comparing your shortlist/i }),
    ).not.toBeInTheDocument();
  });
});

describe("searching with no arguments", () => {
  /**
   * The tool promises that omitted arguments fall back to the visible form, so
   * an agent can read the profile and then call it bare. That was broken for
   * the normal case: a cancer chosen from the catalogue leaves `condition`
   * empty, because the person never typed anything — the search term comes from
   * the catalogue entry instead. The merge overwrote the derived term with the
   * empty box, and the call failed with MISSING_CONDITION while
   * get_search_profile was still reporting readyToSearch: true.
   */
  function stubSearch() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => searchResponseFixture([]),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  /** The body actually POSTed to the search route. */
  function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return JSON.parse(String(fetchMock.mock.calls[0][1].body));
  }

  it("searches on the catalogue's own term when called bare", async () => {
    const fetchMock = stubSearch();
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: NET_CANCER_ID });

    const result = await mcp.call("search_clinical_trials", {});

    expect(result.isError).toBeFalsy();
    expect(sentBody(fetchMock)).toMatchObject({
      cancerId: NET_CANCER_ID,
      condition: "neuroendocrine tumor",
    });
  });

  it("agrees with what get_search_profile promised", async () => {
    stubSearch();
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: "AML" });

    expect(structured(await mcp.call("get_search_profile")).readyToSearch).toBe(true);
    // readyToSearch: true and MISSING_CONDITION cannot both be right.
    expect((await mcp.call("search_clinical_trials", {})).isError).toBeFalsy();
  });

  it("still lets an explicit condition win", async () => {
    const fetchMock = stubSearch();
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", { cancerId: NET_CANCER_ID });

    await mcp.call("search_clinical_trials", { condition: "carcinoid syndrome" });
    expect(sentBody(fetchMock).condition).toBe("carcinoid syndrome");
  });

  it("still uses the typed wording for the not-listed fallback", async () => {
    const fetchMock = stubSearch();
    const mcp = await mountWithTools();
    await mcp.call("update_search_profile", {
      cancerId: "other-not-listed",
      condition: "salivary gland carcinoma",
    });

    await mcp.call("search_clinical_trials", {});
    expect(sentBody(fetchMock).condition).toBe("salivary gland carcinoma");
  });

  it("still refuses when there is genuinely nothing to search for", async () => {
    stubSearch();
    const mcp = await mountWithTools();

    const result = await mcp.call("search_clinical_trials", {});
    expect(result.isError).toBe(true);
    expect(structured(result).error.code).toBe("MISSING_CONDITION");
  });
});
