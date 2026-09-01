import { describe, expect, it } from "vitest";
import { PERSIST_VERSION, migratePersistedState } from "@/lib/store";
import { profileSchema } from "@/lib/schemas";

/**
 * The v1 → v2 persistence migration.
 *
 * This exercises the **production** `migratePersistedState` function directly.
 * It deliberately does not reimplement the filtering: a test that duplicated the
 * logic would keep passing even if the migration were deleted, which is exactly
 * the failure this suite exists to catch.
 *
 * Why it matters: this path only runs for people whose browser already holds a
 * v1 profile — the existing beta testers. A fault here is invisible in any fresh
 * browser and breaks hydration for precisely the users whose feedback matters.
 */

/** A realistic v1 payload, as the earlier build would have written it. */
function v1State(recruitmentStatuses: unknown) {
  return {
    profile: {
      condition: "example condition",
      age: 54,
      sex: "female",
      city: "Chicago",
      state: "Illinois",
      country: "United States",
      travelDistanceMiles: 100,
      recruitmentStatuses,
      phases: ["PHASE2"],
      priorTreatments: ["example compound"],
      keywords: "example keyword",
    },
    shortlist: [],
    questions: [],
  };
}

/** Narrow the unknown return to something assertable. */
function profileOf(migrated: unknown): Record<string, unknown> {
  const state = migrated as Record<string, unknown>;
  return (state.profile ?? {}) as Record<string, unknown>;
}

describe("closed statuses are removed", () => {
  it("turns RECRUITING + COMPLETED into RECRUITING only", () => {
    const migrated = migratePersistedState(v1State(["RECRUITING", "COMPLETED"]), 1);
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });

  it("drops NOT_YET_RECRUITING too, now that only RECRUITING is searchable", () => {
    const migrated = migratePersistedState(
      v1State(["RECRUITING", "NOT_YET_RECRUITING", "TERMINATED"]),
      1,
    );
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });

  it("removes every status that can no longer be searched", () => {
    const migrated = migratePersistedState(
      v1State([
        "RECRUITING",
        "ENROLLING_BY_INVITATION",
        "ACTIVE_NOT_RECRUITING",
        "COMPLETED",
        "SUSPENDED",
        "TERMINATED",
        "WITHDRAWN",
        "UNKNOWN",
      ]),
      1,
    );
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });
});

describe("fallback to RECRUITING", () => {
  it("falls back when only closed statuses were saved", () => {
    const migrated = migratePersistedState(v1State(["COMPLETED", "TERMINATED"]), 1);
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });

  it("falls back when the saved list was empty", () => {
    const migrated = migratePersistedState(v1State([]), 1);
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });

  it("falls back when the saved value was not a list at all", () => {
    for (const bad of [null, undefined, "RECRUITING", 42, {}, true]) {
      const migrated = migratePersistedState(v1State(bad), 1);
      expect(profileOf(migrated).recruitmentStatuses, `for ${JSON.stringify(bad)}`).toEqual([
        "RECRUITING",
      ]);
    }
  });
});

describe("unrelated fields survive untouched", () => {
  it("preserves every other profile field", () => {
    const before = v1State(["RECRUITING", "COMPLETED"]);
    const after = profileOf(migratePersistedState(before, 1));

    expect(after.condition).toBe("example condition");
    expect(after.age).toBe(54);
    expect(after.sex).toBe("female");
    expect(after.city).toBe("Chicago");
    expect(after.state).toBe("Illinois");
    expect(after.country).toBe("United States");
    expect(after.travelDistanceMiles).toBe(100);
    expect(after.phases).toEqual(["PHASE2"]);
    expect(after.priorTreatments).toEqual(["example compound"]);
    expect(after.keywords).toBe("example keyword");
  });

  it("preserves sibling state outside the profile", () => {
    const before = {
      ...v1State(["COMPLETED"]),
      shortlist: [{ trial: { nctId: "NCT00000001" }, addedAt: "x", note: null, source: "human" }],
      questions: [{ id: "q1", question: "An example question", nctId: null }],
    };
    const after = migratePersistedState(before, 1) as Record<string, unknown>;

    expect(after.shortlist).toHaveLength(1);
    expect(after.questions).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const before = v1State(["RECRUITING", "COMPLETED"]);
    migratePersistedState(before, 1);
    expect(before.profile.recruitmentStatuses).toEqual(["RECRUITING", "COMPLETED"]);
  });
});

describe("the migrated profile is accepted by the current schema", () => {
  it.each([
    [["RECRUITING", "COMPLETED"]],
    [["COMPLETED", "TERMINATED"]],
    [[]],
    [null],
    [["NOT_YET_RECRUITING", "WITHDRAWN"]], // both now unsearchable -> falls back
  ])("profileSchema.parse succeeds after migrating %j", (statuses) => {
    const migrated = migratePersistedState(v1State(statuses), 1);
    const parsed = profileSchema.safeParse(profileOf(migrated));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recruitmentStatuses.length).toBeGreaterThan(0);
      for (const s of parsed.data.recruitmentStatuses) {
        expect(["RECRUITING", "NOT_YET_RECRUITING"]).toContain(s);
      }
    }
  });

  it("proves the migration is doing the work: raw v1 state would be rejected", () => {
    // Without the migration, hydration throws — which is the bug being prevented.
    const raw = v1State(["RECRUITING", "COMPLETED"]).profile;
    expect(profileSchema.safeParse(raw).success).toBe(false);

    const migrated = profileOf(migratePersistedState(v1State(["RECRUITING", "COMPLETED"]), 1));
    expect(profileSchema.safeParse(migrated).success).toBe(true);
  });
});

describe("malformed persisted state fails safely", () => {
  it("never throws, whatever it is handed", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "a string",
      42,
      true,
      [],
      [1, 2, 3],
      {},
      { profile: null },
      { profile: "not an object" },
      { profile: [] },
      { profile: 7 },
      { profile: { recruitmentStatuses: [{ nested: true }] } },
    ]) {
      expect(() => migratePersistedState(bad, 1), `input ${JSON.stringify(bad)}`).not.toThrow();
    }
  });

  it("returns a schema-safe status list even from junk input", () => {
    for (const bad of [{ profile: null }, { profile: "x" }, { profile: [] }, {}]) {
      const migrated = migratePersistedState(bad, 1);
      expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
    }
  });

  it("discards a non-object payload rather than propagating it", () => {
    for (const bad of [null, "a string", 42, true, []]) {
      expect(migratePersistedState(bad, 1)).toEqual({});
    }
  });

  it("drops unrecognised entries inside the status list", () => {
    const migrated = migratePersistedState(
      v1State(["RECRUITING", { evil: true }, 99, null, "MADE_UP"]),
      1,
    );
    expect(profileOf(migrated).recruitmentStatuses).toEqual(["RECRUITING"]);
  });
});

describe("version handling", () => {
  it("leaves already-current state alone", () => {
    const current = v1State(["RECRUITING"]);
    expect(migratePersistedState(current, PERSIST_VERSION)).toBe(current);
  });

  it("does not re-migrate a future version", () => {
    // A newer build's state must pass through untouched rather than be mangled.
    const future = v1State(["RECRUITING", "COMPLETED"]);
    expect(migratePersistedState(future, PERSIST_VERSION + 1)).toBe(future);
  });

  it("migrates anything older than the current version", () => {
    expect(profileOf(migratePersistedState(v1State(["COMPLETED"]), 0))).toMatchObject({
      recruitmentStatuses: ["RECRUITING"],
    });
    expect(profileOf(migratePersistedState(v1State(["COMPLETED"]), 1))).toMatchObject({
      recruitmentStatuses: ["RECRUITING"],
    });
  });
});
