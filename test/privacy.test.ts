import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSearch } from "@/lib/actions";
import { searchInputSchema, EMPTY_PROFILE } from "@/lib/schemas";
import { searchInputFromProfile, useTrialStore } from "@/lib/store";
import { createTools } from "@/webmcp/tools";
import type { ToolDescriptor } from "@/types/webmcp";
import { searchResponseFixture } from "./fixtures";

/**
 * Privacy guarantees, asserted rather than assumed.
 *
 * The promise made to the user in the interface is specific: the health profile
 * stays in the browser. These tests pin the two halves of that promise —
 * what may be sent, and what must be stored.
 */

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

beforeEach(resetStore);

describe("age and sex never leave the browser", () => {
  it("omits them from the payload built from the profile", () => {
    useTrialStore.getState().setProfile({
      condition: "metastatic melanoma",
      age: 54,
      sex: "female",
      city: "Chicago",
    });

    const payload = searchInputFromProfile(useTrialStore.getState().profile);

    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("age");
    expect(payload).not.toHaveProperty("sex");
    // The fields the server genuinely needs are still present.
    expect(payload!.condition).toBe("metastatic melanoma");
    expect(payload!.city).toBe("Chicago");
  });

  it("strips them even if a caller tries to include them", () => {
    const parsed = searchInputSchema.parse({
      condition: "asthma",
      age: 54,
      sex: "female",
    } as unknown as Record<string, unknown>);

    expect(parsed).not.toHaveProperty("age");
    expect(parsed).not.toHaveProperty("sex");
  });

  it("sends no age or sex over the network during a real search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => searchResponseFixture([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    useTrialStore.getState().setProfile({
      condition: "metastatic melanoma",
      age: 54,
      sex: "female",
      city: "Chicago",
    });
    await runSearch(searchInputFromProfile(useTrialStore.getState().profile)!);

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).not.toMatch(/"age"/);
    expect(body).not.toMatch(/"sex"/);
    expect(body).not.toContain("female");
    expect(body).not.toContain("54");
  });

  it("does not expose age or sex through the WebMCP search tool schema", () => {
    const tool = createTools().find(
      (t) => t.name === "search_clinical_trials",
    ) as ToolDescriptor;
    const props = Object.keys(tool.inputSchema.properties ?? {});

    expect(props).not.toContain("age");
    expect(props).not.toContain("sex");
  });
});

describe("no direct identifiers are collected anywhere", () => {
  const FORBIDDEN = [
    "name",
    "firstName",
    "lastName",
    "fullName",
    "email",
    "emailAddress",
    "phone",
    "dateOfBirth",
    "dob",
    "birthDate",
    "medicalRecordNumber",
    "mrn",
    "ssn",
    "address",
    "postcode",
    "zipCode",
  ];

  it("the profile schema has no identifier fields", () => {
    const profileKeys = Object.keys(EMPTY_PROFILE);
    for (const field of FORBIDDEN) {
      expect(profileKeys, `profile must not collect ${field}`).not.toContain(field);
    }
  });

  it("no WebMCP tool accepts an identifier field", () => {
    for (const tool of createTools()) {
      const props = Object.keys(tool.inputSchema.properties ?? {});
      for (const field of FORBIDDEN) {
        expect(props, `${tool.name} must not accept ${field}`).not.toContain(field);
      }
    }
  });

  it("rejects an identifier pushed through the profile update tool", async () => {
    const tool = createTools().find((t) => t.name === "update_search_profile")!;
    for (const payload of [
      { email: "someone@example.com" },
      { fullName: "A Person" },
      { dateOfBirth: "1972-01-01" },
    ]) {
      const result = await tool.execute(payload);
      expect(result.isError, `should reject ${Object.keys(payload)[0]}`).toBe(true);
    }
  });
});

describe("local storage holds only what was promised", () => {
  it("persists nothing beyond profile, shortlist, questions and the pre-screening session", () => {
    useTrialStore.getState().setProfile({ condition: "asthma", age: 40 });
    useTrialStore.getState().addQuestion({
      question: "How often are study visits?",
      nctId: null,
      rationale: null,
      source: "human",
    });

    const raw = window.localStorage.getItem("trialbridge:v1");
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(persisted.state).sort()).toEqual([
      "preScreening",
      "profile",
      "questions",
      "shortlist",
    ]);
  });

  it("writes to no storage other than the single known key", () => {
    useTrialStore.getState().setProfile({ condition: "asthma", age: 40 });

    const keys = Object.keys(window.localStorage);
    expect(keys).toEqual(["trialbridge:v1"]);
    expect(window.sessionStorage.length).toBe(0);
  });
});
