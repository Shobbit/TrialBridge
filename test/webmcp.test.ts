import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTools, splitCriteria } from "@/webmcp/tools";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import type { ToolDescriptor, ToolResult } from "@/types/webmcp";
import { rawStudyFixture, rawStudyFixtureB, searchResponseFixture } from "./fixtures";

const trialA = normalizeStudy(rawStudyFixture) as Trial;
const trialB = normalizeStudy(rawStudyFixtureB) as Trial;

const EXPECTED_TOOLS = [
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
] as const;

function tool(name: string): ToolDescriptor {
  const found = createTools().find((t) => t.name === name);
  if (!found) throw new Error(`No such tool: ${name}`);
  return found;
}

async function call(name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await tool(name).execute(input)) as ToolResult;
}

/** Reads the machine-readable half of a tool result. */
function structured(result: ToolResult): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

function resetStore() {
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
    lastAgentActionAt: null,
    lastAgentAction: null,
  });
}

// --------------------------------------------------------------------------

describe("tool declarations", () => {
  it("registers exactly the ten documented tools", () => {
    expect(createTools().map((t) => t.name)).toEqual([...EXPECTED_TOOLS]);
  });

  it("gives every tool a description substantial enough to choose it by", () => {
    for (const t of createTools()) {
      expect(t.description.length, `${t.name} description`).toBeGreaterThan(120);
    }
  });

  it("declares a closed object input schema for every tool", () => {
    for (const t of createTools()) {
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(t.inputSchema.additionalProperties, `${t.name} additionalProperties`).toBe(false);
    }
  });

  it("declares an output schema and annotations for every tool", () => {
    for (const t of createTools()) {
      expect(t.outputSchema, t.name).toBeTruthy();
      expect(t.annotations, t.name).toBeTruthy();
      expect(typeof t.annotations!.title, t.name).toBe("string");
    }
  });

  it("marks read-only tools as read-only and write tools as not", () => {
    const readOnly = ["get_search_profile", "get_trial_details", "compare_shortlisted_trials"];
    const writes = [
      "update_search_profile",
      "search_clinical_trials",
      "shortlist_trial",
      "remove_shortlisted_trial",
      "save_screening_question",
      "start_trial_prescreening",
      "record_prescreening_responses",
    ];
    for (const name of readOnly) {
      expect(tool(name).annotations?.readOnlyHint, name).toBe(true);
    }
    for (const name of writes) {
      expect(tool(name).annotations?.readOnlyHint, name).toBe(false);
    }
  });

  it("marks only shortlist removal as destructive", () => {
    const destructive = createTools()
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name);
    expect(destructive).toEqual(["remove_shortlisted_trial"]);
  });

  it("documents every declared property", () => {
    for (const t of createTools()) {
      for (const [key, schema] of Object.entries(t.inputSchema.properties ?? {})) {
        expect(
          (schema as { description?: string }).description,
          `${t.name}.${key} needs a description`,
        ).toBeTruthy();
      }
    }
  });
});

// --------------------------------------------------------------------------

describe("registration against document.modelContext", () => {
  beforeEach(resetStore);

  it("registers each tool exactly once on the top-level document", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { modelContext: unknown }).modelContext = { registerTool };

    for (const t of createTools()) {
      await document.modelContext!.registerTool(t);
    }

    expect(registerTool).toHaveBeenCalledTimes(EXPECTED_TOOLS.length);
    const names = registerTool.mock.calls.map((c) => (c[0] as ToolDescriptor).name);
    expect(names).toEqual([...EXPECTED_TOOLS]);

    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it("is detectable as absent so the site can fall back", () => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    expect(typeof document.modelContext?.registerTool).not.toBe("function");
  });
});

// --------------------------------------------------------------------------

describe("get_search_profile", () => {
  beforeEach(resetStore);

  it("reports an empty form as not ready to search", async () => {
    const data = structured(await call("get_search_profile"));
    expect(data.ok).toBe(true);
    expect(data.readyToSearch).toBe(false);
    expect(data.missingFields).toContain("condition");
  });

  it("returns exactly what the visible form holds", async () => {
    useTrialStore.getState().setProfile({ condition: "example condition", age: 54, city: "Chicago" });
    const data = structured(await call("get_search_profile"));
    expect(data.readyToSearch).toBe(true);
    expect((data.profile as Record<string, unknown>).condition).toBe("example condition");
    expect((data.profile as Record<string, unknown>).age).toBe(54);
    expect(data.missingFields).not.toContain("condition");
  });
});

describe("update_search_profile", () => {
  beforeEach(resetStore);

  it("writes into the same state the form renders", async () => {
    const result = await call("update_search_profile", { city: "Chicago", age: 54 });
    const data = structured(result);
    expect(data.ok).toBe(true);
    expect(data.updatedFields).toEqual(expect.arrayContaining(["city", "age"]));

    const profile = useTrialStore.getState().profile;
    expect(profile.city).toBe("Chicago");
    expect(profile.age).toBe(54);
  });

  it("returns a before/after record so the agent can verify the write", async () => {
    useTrialStore.getState().setProfile({ city: "Boston" });
    const data = structured(await call("update_search_profile", { city: "Chicago" }));
    const changes = (data.verification as { changes: { field: string; previousValue: unknown; newValue: unknown }[] })
      .changes;
    expect(changes).toContainEqual({ field: "city", previousValue: "Boston", newValue: "Chicago" });
  });

  it("rejects unknown properties rather than silently ignoring them", async () => {
    const result = await call("update_search_profile", { emailAddress: "someone@example.com" });
    expect(result.isError).toBe(true);
    expect(structured(result).ok).toBe(false);
  });

  it("rejects out-of-range values and leaves state untouched", async () => {
    const result = await call("update_search_profile", { age: 999 });
    expect(result.isError).toBe(true);
    expect(useTrialStore.getState().profile.age).toBeNull();
  });

  it("reports an error when no fields are supplied", async () => {
    const result = await call("update_search_profile", {});
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("NO_FIELDS");
  });
});

// --------------------------------------------------------------------------

describe("search_clinical_trials", () => {
  beforeEach(resetStore);

  it("fails cleanly when no condition is available anywhere", async () => {
    const result = await call("search_clinical_trials", {});
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("MISSING_CONDITION");
  });

  it("searches with the form values and renders results on the page", async () => {
    useTrialStore.getState().setProfile({ condition: "example condition" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([trialA, trialB]),
      }),
    );

    const data = structured(await call("search_clinical_trials", {}));
    expect(data.ok).toBe(true);
    expect(data.returnedCount).toBe(2);
    expect(useTrialStore.getState().results).toHaveLength(2);
    expect(useTrialStore.getState().searchState).toBe("success");
  });

  it("mirrors supplied arguments into the visible form before searching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([trialA]),
      }),
    );

    await call("search_clinical_trials", {
      condition: "example condition",
      city: "Chicago",
      travelDistanceMiles: 75,
    });

    const profile = useTrialStore.getState().profile;
    expect(profile.condition).toBe("example condition");
    expect(profile.city).toBe("Chicago");
    expect(profile.travelDistanceMiles).toBe(75);
  });

  it("returns the three-way analysis and a disclaimer with every result", async () => {
    useTrialStore.getState().setProfile({ condition: "example condition", age: 54 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => searchResponseFixture([trialA]),
      }),
    );

    const data = structured(await call("search_clinical_trials", {}));
    const first = (data.trials as Record<string, unknown>[])[0];
    expect(first.apparentMatches).toBeInstanceOf(Array);
    expect(first.apparentMismatches).toBeInstanceOf(Array);
    expect(first.stillUnknown).toBeInstanceOf(Array);
    expect(first.sourceUrl).toContain("clinicaltrials.gov/study/");
    expect(String(data.disclaimer)).toContain("investigators after medical screening");
  });

  it("surfaces an upstream failure as a tool error and an on-page error state", async () => {
    useTrialStore.getState().setProfile({ condition: "example condition" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limited by ClinicalTrials.gov.", retryable: true }),
      }),
    );

    const result = await call("search_clinical_trials", {});
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("UPSTREAM_TEMPORARY");
    expect(useTrialStore.getState().searchState).toBe("error");
  });

  it("rejects an invalid phase value", async () => {
    const result = await call("search_clinical_trials", {
      condition: "example condition",
      phases: ["PHASE9"],
    });
    expect(result.isError).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe("get_trial_details", () => {
  beforeEach(resetStore);

  it("rejects a malformed NCT number", async () => {
    const result = await call("get_trial_details", { nctId: "not-an-id" });
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("INVALID_INPUT");
  });

  it("returns full criteria and opens the detail panel on screen", async () => {
    useTrialStore.getState().cacheDetail(trialA);
    const data = structured(await call("get_trial_details", { nctId: "NCT00000001" }));

    expect(data.ok).toBe(true);
    expect(String(data.eligibilityCriteria)).toContain("Exclusion Criteria");
    expect(useTrialStore.getState().openTrialId).toBe("NCT00000001");
  });

  it("fetches from the network when the trial is not cached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ trial: trialA }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = structured(await call("get_trial_details", { nctId: "NCT00000001" }));
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/trials/NCT00000001"));
  });
});

// --------------------------------------------------------------------------

describe("shortlist_trial and remove_shortlisted_trial", () => {
  beforeEach(resetStore);

  it("adds a trial visibly and reports the new shortlist", async () => {
    useTrialStore.getState().cacheDetail(trialA);
    const data = structured(
      await call("shortlist_trial", {
        nctId: "NCT00000001",
        note: "Published age range includes the age entered.",
      }),
    );

    expect(data.added).toBe(true);
    expect(data.shortlistCount).toBe(1);
    expect(data.shortlistNctIds).toEqual(["NCT00000001"]);

    const entry = useTrialStore.getState().shortlist[0];
    expect(entry.source).toBe("agent");
    expect(entry.note).toBe("Published age range includes the age entered.");
  });

  it("is idempotent: a second add succeeds without duplicating", async () => {
    useTrialStore.getState().cacheDetail(trialA);
    await call("shortlist_trial", { nctId: "NCT00000001" });
    const data = structured(await call("shortlist_trial", { nctId: "NCT00000001" }));

    expect(data.ok).toBe(true);
    expect(data.added).toBe(false);
    expect(data.alreadyPresent).toBe(true);
    expect(useTrialStore.getState().shortlist).toHaveLength(1);
  });

  it("removes a trial and reports removed:false when it was not there", async () => {
    useTrialStore.getState().cacheDetail(trialA);
    await call("shortlist_trial", { nctId: "NCT00000001" });

    const removed = structured(await call("remove_shortlisted_trial", { nctId: "NCT00000001" }));
    expect(removed.removed).toBe(true);
    expect(useTrialStore.getState().shortlist).toHaveLength(0);

    const again = structured(await call("remove_shortlisted_trial", { nctId: "NCT00000001" }));
    expect(again.ok).toBe(true);
    expect(again.removed).toBe(false);
  });
});

// --------------------------------------------------------------------------

describe("compare_shortlisted_trials", () => {
  beforeEach(resetStore);

  it("errors when the shortlist is empty", async () => {
    const result = await call("compare_shortlisted_trials", {});
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("EMPTY_SHORTLIST");
  });

  it("errors when fewer than two studies can be compared", async () => {
    useTrialStore.getState().addToShortlist(trialA, null, "human");
    const result = await call("compare_shortlisted_trials", {});
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("INSUFFICIENT_TRIALS");
  });

  it("returns the documented comparison fields for each study", async () => {
    useTrialStore.getState().setProfile({ condition: "example condition", age: 54 });
    useTrialStore.getState().addToShortlist(trialA, null, "human");
    useTrialStore.getState().addToShortlist(trialB, null, "agent");

    const data = structured(await call("compare_shortlisted_trials", {}));
    expect(data.comparedCount).toBe(2);

    const first = (data.trials as Record<string, unknown>[])[0];
    for (const field of [
      "recruitmentStatus",
      "phase",
      "location",
      "majorInclusionCriteria",
      "majorExclusionCriteria",
      "apparentMatches",
      "apparentMismatches",
      "stillUnknown",
      "sourceUrl",
    ]) {
      expect(first, `missing ${field}`).toHaveProperty(field);
    }
    expect(String(data.disclaimer)).toContain("investigators after medical screening");
  });

  it("reports requested studies that are not on the shortlist as skipped", async () => {
    useTrialStore.getState().addToShortlist(trialA, null, "human");
    useTrialStore.getState().addToShortlist(trialB, null, "human");

    const data = structured(
      await call("compare_shortlisted_trials", {
        nctIds: ["NCT00000001", "NCT00000002", "NCT01234567"],
      }),
    );
    expect(data.comparedCount).toBe(2);
    expect(data.skipped).toEqual(["NCT01234567"]);
  });
});

// --------------------------------------------------------------------------

describe("save_screening_question", () => {
  beforeEach(resetStore);

  it("adds a question that appears in the interface state", async () => {
    useTrialStore.getState().cacheDetail(trialA);
    const data = structured(
      await call("save_screening_question", {
        question: "Would my previous therapy affect eligibility for this study?",
        nctId: "NCT00000001",
        rationale: "The criteria mention prior therapy but not its effect.",
      }),
    );

    expect(data.ok).toBe(true);
    expect(data.questionCount).toBe(1);

    const saved = useTrialStore.getState().questions[0];
    expect(saved.source).toBe("agent");
    expect(saved.nctId).toBe("NCT00000001");
  });

  it("accepts a general question with no trial attached", async () => {
    const data = structured(
      await call("save_screening_question", { question: "How often are study visits scheduled?" }),
    );
    expect(data.ok).toBe(true);
    expect(useTrialStore.getState().questions[0].nctId).toBeNull();
  });

  it("refuses to attach a question to a study the page does not know about", async () => {
    const result = await call("save_screening_question", {
      question: "Is travel reimbursed for this study?",
      nctId: "NCT01234567",
    });
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("UNKNOWN_TRIAL");
    expect(useTrialStore.getState().questions).toHaveLength(0);
  });

  it("rejects a question that is too short to be useful", async () => {
    const result = await call("save_screening_question", { question: "hi" });
    expect(result.isError).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe("splitCriteria", () => {
  it("separates inclusion from exclusion verbatim", () => {
    const { inclusion, exclusion } = splitCriteria(trialA.eligibilityCriteria, 10);
    expect(inclusion).toContain("Adults with a confirmed example condition.");
    expect(exclusion).toContain("Prior treatment with an example compound.");
    expect(inclusion).not.toContain("Prior treatment with an example compound.");
  });

  it("respects the excerpt limit", () => {
    const { inclusion } = splitCriteria(trialA.eligibilityCriteria, 2);
    expect(inclusion).toHaveLength(2);
  });

  it("handles missing criteria without throwing", () => {
    expect(splitCriteria(null)).toEqual({ inclusion: [], exclusion: [] });
  });

  it("keeps unlabelled text rather than dropping it", () => {
    const { inclusion } = splitCriteria("Some free text with no headings at all.", 5);
    expect(inclusion).toHaveLength(1);
  });
});
