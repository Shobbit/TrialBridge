import { beforeEach, describe, expect, it } from "vitest";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { useTrialStore } from "@/lib/store";
import { EMPTY_PROFILE } from "@/lib/schemas";
import { rawStudyFixture, rawStudyFixtureB } from "./fixtures";

const trialA = normalizeStudy(rawStudyFixture) as Trial;
const trialB = normalizeStudy(rawStudyFixtureB) as Trial;

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

describe("shortlist", () => {
  beforeEach(resetStore);

  it("adds a trial and reports success", () => {
    const added = useTrialStore.getState().addToShortlist(trialA, "Within stated travel limit", "human");
    expect(added).toBe(true);

    const { shortlist } = useTrialStore.getState();
    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].trial.nctId).toBe("NCT00000001");
    expect(shortlist[0].note).toBe("Within stated travel limit");
    expect(shortlist[0].source).toBe("human");
    expect(Date.parse(shortlist[0].addedAt)).not.toBeNaN();
  });

  it("does not duplicate a trial already on the shortlist", () => {
    const store = useTrialStore.getState();
    expect(store.addToShortlist(trialA, null, "human")).toBe(true);
    expect(useTrialStore.getState().addToShortlist(trialA, null, "agent")).toBe(false);
    expect(useTrialStore.getState().shortlist).toHaveLength(1);
    // The original entry is preserved rather than overwritten.
    expect(useTrialStore.getState().shortlist[0].source).toBe("human");
  });

  it("records which entries an agent added", () => {
    useTrialStore.getState().addToShortlist(trialA, "Age range matches", "agent");
    expect(useTrialStore.getState().shortlist[0].source).toBe("agent");
  });

  it("removes a trial and reports whether anything changed", () => {
    useTrialStore.getState().addToShortlist(trialA, null, "human");
    useTrialStore.getState().addToShortlist(trialB, null, "human");

    expect(useTrialStore.getState().removeFromShortlist("NCT00000001")).toBe(true);
    expect(useTrialStore.getState().shortlist.map((e) => e.trial.nctId)).toEqual(["NCT00000002"]);

    expect(useTrialStore.getState().removeFromShortlist("NCT00000001")).toBe(false);
    expect(useTrialStore.getState().shortlist).toHaveLength(1);
  });

  it("keeps a full trial record so the shortlist survives a new search", () => {
    useTrialStore.getState().addToShortlist(trialA, null, "human");
    useTrialStore.getState().setResults([trialB], {
      totalCount: 1,
      returnedCount: 1,
      removedOffTopic: 0,
      removedByStage: 0,
      nextPageToken: null,
      retrievedAt: new Date().toISOString(),
      upstreamUrl: "https://clinicaltrials.gov/api/v2/studies",
      resolvedLocation: null,
      warnings: [],
    });

    const state = useTrialStore.getState();
    expect(state.results.map((t) => t.nctId)).toEqual(["NCT00000002"]);
    expect(state.shortlist[0].trial.eligibilityCriteria).toContain("Inclusion Criteria");
  });
});

describe("screening questions", () => {
  beforeEach(resetStore);

  it("assigns a stable id and timestamp", () => {
    const saved = useTrialStore.getState().addQuestion({
      question: "Does prior therapy affect eligibility for this study?",
      nctId: "NCT00000001",
      rationale: "Prior therapy is named in the criteria but its effect is unclear.",
      source: "agent",
    });
    expect(saved.id).toBeTruthy();
    expect(Date.parse(saved.createdAt)).not.toBeNaN();
    expect(useTrialStore.getState().questions).toHaveLength(1);
  });

  it("removes by id", () => {
    const q = useTrialStore.getState().addQuestion({
      question: "How often are study visits?",
      nctId: null,
      rationale: null,
      source: "human",
    });
    expect(useTrialStore.getState().removeQuestion(q.id)).toBe(true);
    expect(useTrialStore.getState().removeQuestion(q.id)).toBe(false);
    expect(useTrialStore.getState().questions).toHaveLength(0);
  });
});

describe("profile updates", () => {
  beforeEach(resetStore);

  it("merges partial updates and leaves other fields untouched", () => {
    useTrialStore.getState().setProfile({ condition: "example condition", age: 54 });
    const merged = useTrialStore.getState().setProfile({ city: "Chicago" });
    expect(merged.condition).toBe("example condition");
    expect(merged.age).toBe(54);
    expect(merged.city).toBe("Chicago");
  });

  it("rejects values the form itself would not accept", () => {
    expect(() => useTrialStore.getState().setProfile({ age: 500 })).toThrow();
    expect(useTrialStore.getState().profile.age).toBeNull();
  });
});

describe("clearEverything", () => {
  beforeEach(resetStore);

  it("wipes profile, shortlist, questions and results", () => {
    const store = useTrialStore.getState();
    store.setProfile({ condition: "example condition", age: 54, city: "Chicago" });
    store.addToShortlist(trialA, null, "human");
    store.addQuestion({ question: "A saved question", nctId: null, rationale: null, source: "human" });

    useTrialStore.getState().clearEverything();

    const cleared = useTrialStore.getState();
    expect(cleared.profile.condition).toBe("");
    expect(cleared.profile.age).toBeNull();
    expect(cleared.profile.city).toBe("");
    expect(cleared.shortlist).toEqual([]);
    expect(cleared.questions).toEqual([]);
    expect(cleared.results).toEqual([]);
    expect(cleared.detailCache).toEqual({});
  });

  it("removes the persisted copy from localStorage", () => {
    useTrialStore.getState().setProfile({ condition: "example condition" });
    window.localStorage.setItem("trialbridge:v1", JSON.stringify({ state: {}, version: 1 }));
    useTrialStore.getState().clearEverything();
    expect(window.localStorage.getItem("trialbridge:v1")).toBeNull();
  });
});
