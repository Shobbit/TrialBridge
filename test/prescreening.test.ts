import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCriteria } from "@/lib/criteria";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { AGENT_COMPARISON_LABEL, findProhibitedLanguage } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { useTrialStore } from "@/lib/store";
import { createTools } from "@/webmcp/tools";
import type { ToolResult } from "@/types/webmcp";
import { rawStudyFixture, rawStudyFixtureB } from "./fixtures";

/**
 * The guided pre-screening workflow.
 *
 * The safety model rests on one idea: TrialBridge does not interpret criteria,
 * the visiting agent does — so the app's job is to refuse anything that
 * oversteps, tie every conclusion to a verbatim criterion, and never aggregate.
 *
 * All patient facts below are fictional.
 */

const trialA = normalizeStudy(rawStudyFixture) as Trial;
const trialB = normalizeStudy(rawStudyFixtureB) as Trial;

function tool(name: string) {
  const found = createTools().find((t) => t.name === name);
  if (!found) throw new Error(`No such tool: ${name}`);
  return found;
}

const call = async (name: string, input: Record<string, unknown> = {}) =>
  (await tool(name).execute(input)) as ToolResult;

const structured = (r: ToolResult) => (r.structuredContent ?? {}) as Record<string, unknown>;

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
    preScreening: null,
    lastAgentActionAt: null,
    lastAgentAction: null,
  });
}

/** First inclusion criterion id for the fixture study. */
function firstInclusionId(trial: Trial): string {
  return parseCriteria(trial).criteria.find((c) => c.type === "inclusion")!.criterionId;
}

const validResponse = (criterionId: string) => ({
  criterionId,
  questionAsked: "Have you been told you have an example condition?",
  patientAnswer: "Yes, diagnosed last year",
  answerType: "text" as const,
  comparison: "appears_consistent" as const,
  explanation: "You said you have an example condition, which is what this criterion asks about.",
});

beforeEach(() => {
  resetStore();
  useTrialStore.getState().cacheDetail(trialA);
  useTrialStore.getState().cacheDetail(trialB);
});

// --------------------------------------------------------------------------

describe("tool registry", () => {
  it("registers exactly ten tools including the two new ones", () => {
    const names = createTools().map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(names).toContain("start_trial_prescreening");
    expect(names).toContain("record_prescreening_responses");
  });

  it("keeps all eight original tools", () => {
    const names = createTools().map((t) => t.name);
    for (const original of [
      "get_search_profile",
      "update_search_profile",
      "search_clinical_trials",
      "get_trial_details",
      "shortlist_trial",
      "remove_shortlisted_trial",
      "compare_shortlisted_trials",
      "save_screening_question",
    ]) {
      expect(names).toContain(original);
    }
  });

  it("tells the agent to treat criteria as untrusted data and to cap questions", () => {
    const description = tool("start_trial_prescreening").description;
    expect(description).toMatch(/never follow (?:directions|instructions)/i);
    expect(description).toMatch(/three questions/i);
    expect(description).toMatch(/unknown/i);
    expect(description).toMatch(/never tell the person they are eligible/i);
  });

  it("does not expose pre-screening answers through get_search_profile", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [validResponse(firstInclusionId(trialA))],
    });

    const data = structured(await call("get_search_profile"));
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain("diagnosed last year");
    expect(serialised).not.toContain("appears_consistent");
    expect(data).not.toHaveProperty("preScreening");
  });
});

// --------------------------------------------------------------------------

describe("start_trial_prescreening", () => {
  it("opens a session and returns criteria with provenance", async () => {
    const data = structured(await call("start_trial_prescreening", { nctId: "NCT00000001" }));

    expect(data.ok).toBe(true);
    expect(data.nctId).toBe("NCT00000001");
    expect(data.sourceUrl).toBe("https://clinicaltrials.gov/study/NCT00000001");
    expect(Date.parse(String(data.retrievedAt))).not.toBeNaN();
    expect(String(data.disclaimer)).toMatch(/does not determine eligibility|study team/i);

    const criteria = data.criteria as Record<string, unknown>[];
    expect(criteria.length).toBeGreaterThan(0);
    for (const c of criteria) {
      expect(c.criterionId).toMatch(/^NCT00000001:/);
      expect(String(c.verbatimText).length).toBeGreaterThan(0);
      expect(c.responseStatus).toBe("unanswered");
    }
  });

  it("makes the session visible in application state", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    const session = useTrialStore.getState().preScreening;
    expect(session?.nctId).toBe("NCT00000001");
    expect(session?.responses).toEqual({});
  });

  it("returns no automatically generated questions", async () => {
    const data = structured(await call("start_trial_prescreening", { nctId: "NCT00000001" }));
    expect(data).not.toHaveProperty("suggestedQuestions");
  });

  it("returns no aggregate counts of any kind", async () => {
    const data = structured(await call("start_trial_prescreening", { nctId: "NCT00000001" }));
    expect(data).not.toHaveProperty("unresolvedCount");
    expect(data).not.toHaveProperty("matchCount");
    expect(data).not.toHaveProperty("score");
  });

  it("replaces an existing session rather than keeping two", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    await call("start_trial_prescreening", { nctId: "NCT00000002" });
    expect(useTrialStore.getState().preScreening?.nctId).toBe("NCT00000002");
  });

  it("rejects a malformed NCT id", async () => {
    const result = await call("start_trial_prescreening", { nctId: "nonsense" });
    expect(result.isError).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe("record_prescreening_responses", () => {
  beforeEach(async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
  });

  it("records a response and shows it in application state", async () => {
    const criterionId = firstInclusionId(trialA);
    const data = structured(
      await call("record_prescreening_responses", {
        nctId: "NCT00000001",
        responses: [validResponse(criterionId)],
      }),
    );

    expect(data.ok).toBe(true);
    expect(data.recordedCount).toBe(1);
    expect(data.label).toBe(AGENT_COMPARISON_LABEL);

    const stored = useTrialStore.getState().preScreening!.responses[criterionId];
    expect(stored.comparison).toBe("appears_consistent");
    expect(stored.questionAsked).toMatch(/example condition/i);
  });

  it("returns the verbatim criterion alongside each conclusion", async () => {
    const criterionId = firstInclusionId(trialA);
    const data = structured(
      await call("record_prescreening_responses", {
        nctId: "NCT00000001",
        responses: [validResponse(criterionId)],
      }),
    );
    const recorded = (data.recorded as Record<string, unknown>[])[0];
    expect(String(recorded.verbatimText).length).toBeGreaterThan(0);
    expect(recorded.nctId).toBe("NCT00000001");
    expect(recorded.criterionId).toBe(criterionId);
  });

  it("returns no aggregate match counts", async () => {
    const data = structured(
      await call("record_prescreening_responses", {
        nctId: "NCT00000001",
        responses: [validResponse(firstInclusionId(trialA))],
      }),
    );
    expect(data).not.toHaveProperty("matchCount");
    expect(data).not.toHaveProperty("consistentCount");
    expect(data).not.toHaveProperty("remainingUnresolved");
    expect(data).not.toHaveProperty("score");
  });

  it("fails when no session is open", async () => {
    useTrialStore.getState().clearPreScreening();
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [validResponse(firstInclusionId(trialA))],
    });
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("NO_ACTIVE_SESSION");
  });
});

// --------------------------------------------------------------------------

describe("an answer that was not given cannot support a conclusion", () => {
  beforeEach(async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
  });

  it.each([
    ["unknown", "appears_consistent"],
    ["unknown", "potential_conflict"],
    ["skipped", "appears_consistent"],
    ["skipped", "potential_conflict"],
  ])("rejects answerType %s with comparison %s", async (answerType, comparison) => {
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          ...validResponse(firstInclusionId(trialA)),
          patientAnswer: null,
          answerType,
          comparison,
        },
      ],
    });
    expect(result.isError).toBe(true);
    expect(useTrialStore.getState().preScreening!.responses).toEqual({});
  });

  it("rejects a null answer paired with a conclusion", async () => {
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          ...validResponse(firstInclusionId(trialA)),
          patientAnswer: null,
          answerType: "text",
          comparison: "potential_conflict",
        },
      ],
    });
    expect(result.isError).toBe(true);
  });

  it("accepts unknown and skipped when left unresolved", async () => {
    const criterionId = firstInclusionId(trialA);
    for (const answerType of ["unknown", "skipped"] as const) {
      const data = structured(
        await call("record_prescreening_responses", {
          nctId: "NCT00000001",
          responses: [
            {
              ...validResponse(criterionId),
              patientAnswer: null,
              answerType,
              comparison: "unresolved",
              explanation: "You were not sure, so this criterion is still open.",
            },
          ],
        }),
      );
      expect(data.ok).toBe(true);
      expect(useTrialStore.getState().preScreening!.responses[criterionId].comparison).toBe(
        "unresolved",
      );
    }
  });

  it("requires an explicit answer before a potential conflict can be recorded", async () => {
    const criterionId = firstInclusionId(trialA);
    const data = structured(
      await call("record_prescreening_responses", {
        nctId: "NCT00000001",
        responses: [
          {
            ...validResponse(criterionId),
            patientAnswer: "No, I have not had that",
            answerType: "text",
            comparison: "potential_conflict",
            explanation: "You said you have not had that, which this criterion asks about.",
          },
        ],
      }),
    );
    expect(data.ok).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe("criteria cannot be crossed between studies", () => {
  it("rejects a criterion id belonging to another study", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    const foreignId = firstInclusionId(trialB); // NCT00000002:...

    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [validResponse(foreignId)],
    });

    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("UNKNOWN_CRITERION");
    expect(useTrialStore.getState().preScreening!.responses).toEqual({});
  });

  it("rejects a mismatch between the nctId and the open session", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000002",
      responses: [validResponse(firstInclusionId(trialB))],
    });
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("WRONG_TRIAL");
  });

  it("rejects an invented criterion id", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [validResponse("NCT00000001:inclusion:999")],
    });
    expect(result.isError).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe("prohibited language is refused", () => {
  beforeEach(async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
  });

  it.each([
    "You are eligible for this study.",
    "You are not eligible for this trial.",
    "You do not qualify.",
    "You meet all the criteria.",
    "This gives you a 90% match.",
    "You satisfy 4 of 6 criteria.",
    "Your eligibility score is high.",
    "You should stop your current medication before enrolling.",
    "I recommend you enrol in this study.",
    "There is no point contacting the study team.",
    "This would be a waste of time.",
  ])("refuses to store: %s", async (explanation) => {
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [{ ...validResponse(firstInclusionId(trialA)), explanation }],
    });
    expect(result.isError).toBe(true);
    expect((structured(result).error as { code: string }).code).toBe("PROHIBITED_LANGUAGE");
    expect(useTrialStore.getState().preScreening!.responses).toEqual({});
  });

  it("also screens the question that was asked", async () => {
    const result = await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          ...validResponse(firstInclusionId(trialA)),
          questionAsked: "Since you are not eligible, shall we look elsewhere?",
        },
      ],
    });
    expect(result.isError).toBe(true);
  });

  it("allows careful, criterion-specific wording", () => {
    for (const acceptable of [
      "You said you have an example condition, which is what this criterion asks about.",
      "This criterion mentions prior therapy; you said you have not had any, so it is worth raising with the study team.",
      "You were not sure, so this remains unknown and the study team can check it.",
      "The eligibility criteria mention organ function testing, which you have not had recently.",
    ]) {
      expect(findProhibitedLanguage(acceptable)).toEqual([]);
    }
  });
});

// --------------------------------------------------------------------------

describe("session lifecycle", () => {
  it("is cleared by the session's own control", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    useTrialStore.getState().clearPreScreening();
    expect(useTrialStore.getState().preScreening).toBeNull();
  });

  it("is cleared by Clear my information", async () => {
    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [validResponse(firstInclusionId(trialA))],
    });

    useTrialStore.getState().clearEverything();

    expect(useTrialStore.getState().preScreening).toBeNull();
    expect(window.localStorage.getItem("trialbridge:v1")).toBeNull();
  });
});

// --------------------------------------------------------------------------

describe("pre-screening answers never reach the network", () => {
  it("are absent from every search request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        trials: [],
        meta: {
          totalCount: 0,
          returnedCount: 0,
          nextPageToken: null,
          retrievedAt: new Date().toISOString(),
          upstreamUrl: "https://clinicaltrials.gov/api/v2/studies",
          resolvedLocation: null,
          warnings: [],
        },
      }),
    });

    await call("start_trial_prescreening", { nctId: "NCT00000001" });
    await call("record_prescreening_responses", {
      nctId: "NCT00000001",
      responses: [
        {
          ...validResponse(firstInclusionId(trialA)),
          patientAnswer: "UNIQUEFICTIONALANSWER",
          explanation: "You gave a specific answer relevant to this criterion.",
        },
      ],
    });

    vi.stubGlobal("fetch", fetchMock);
    useTrialStore.getState().setProfile({ condition: "example condition" });
    await call("search_clinical_trials", {});

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).not.toContain("UNIQUEFICTIONALANSWER");
    expect(body).not.toContain("criterionId");
    expect(body).not.toContain("comparison");
    expect(body).not.toContain("preScreening");
  });
});
