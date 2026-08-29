import { describe, expect, it } from "vitest";
import { criterionBelongsTo, parseCriteria } from "@/lib/criteria";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import type { Trial } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Criteria segmentation.
 *
 * The parser decides only where one criterion ends and the next begins. It must
 * never alter wording, and it must fail safe: unusual formatting yields the
 * whole block for manual review rather than invented boundaries.
 *
 * All fixtures here are fictional.
 */

const baseTrial = normalizeStudy(rawStudyFixture) as Trial;

function trialWithCriteria(text: string | null): Trial {
  return { ...baseTrial, eligibilityCriteria: text };
}

describe("well-formed criteria", () => {
  const parsed = parseCriteria(baseTrial);

  it("splits inclusion from exclusion", () => {
    expect(parsed.segmented).toBe(true);
    expect(parsed.criteria.filter((c) => c.type === "inclusion")).toHaveLength(3);
    expect(parsed.criteria.filter((c) => c.type === "exclusion")).toHaveLength(3);
  });

  it("preserves provenance on the parse result", () => {
    expect(parsed.nctId).toBe("NCT00000001");
    expect(parsed.sourceUrl).toBe("https://clinicaltrials.gov/study/NCT00000001");
    expect(Date.parse(parsed.retrievedAt)).not.toBeNaN();
    expect(parsed.notice).toBeNull();
  });

  it("quotes the registry wording without alteration", () => {
    const first = parsed.criteria.find((c) => c.type === "inclusion")!;
    // The registry numbers its items; that numbering is part of the text.
    expect(first.verbatimText).toContain("Adults with a confirmed example condition.");
    expect(baseTrial.eligibilityCriteria).toContain(
      first.verbatimText.replace(/^\d+\.\s*/, "").split("\n")[0],
    );
  });

  it("gives every criterion a stable, study-scoped id", () => {
    for (const c of parsed.criteria) {
      expect(c.criterionId).toMatch(/^NCT00000001:(inclusion|exclusion):\d+$/);
      expect(criterionBelongsTo(c.criterionId, "NCT00000001")).toBe(true);
      expect(criterionBelongsTo(c.criterionId, "NCT99999999")).toBe(false);
    }
  });

  it("produces identical ids when parsed again", () => {
    const again = parseCriteria(baseTrial);
    expect(again.criteria.map((c) => c.criterionId)).toEqual(
      parsed.criteria.map((c) => c.criterionId),
    );
    expect(again.criteria.map((c) => c.verbatimText)).toEqual(
      parsed.criteria.map((c) => c.verbatimText),
    );
  });

  it("never assigns the same id twice", () => {
    const ids = parsed.criteria.map((c) => c.criterionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("nested sub-clauses stay attached to their parent", () => {
  const nested = `Inclusion Criteria:

1. Participants must have a confirmed example condition and have received:

   1. Cohort A: at least one prior example therapy
   2. Cohort B: no prior example therapy

2. Participants must be able to attend study visits.

Exclusion Criteria:

1. Participants with an active second condition.`;

  const parsed = parseCriteria(trialWithCriteria(nested));

  it("does not strand sub-items as separate criteria", () => {
    const inclusion = parsed.criteria.filter((c) => c.type === "inclusion");
    expect(inclusion).toHaveLength(2);
    expect(inclusion[0].verbatimText).toContain("Cohort A");
    expect(inclusion[0].verbatimText).toContain("Cohort B");
  });

  it("still separates the exclusion section", () => {
    expect(parsed.criteria.filter((c) => c.type === "exclusion")).toHaveLength(1);
  });
});

describe("fails safe on formatting it cannot segment", () => {
  it("returns the whole block when there are no headings", () => {
    const parsed = parseCriteria(
      trialWithCriteria("Adults with an example condition who can attend visits may take part."),
    );
    expect(parsed.segmented).toBe(false);
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0].type).toBe("unsegmented");
    expect(parsed.notice).toMatch(/manual review/i);
  });

  it("preserves the original text exactly when unsegmented", () => {
    const raw = "Some unusual eligibility prose with no structure at all.";
    const parsed = parseCriteria(trialWithCriteria(raw));
    expect(parsed.criteria[0].verbatimText).toBe(raw);
  });

  it("reports nothing to show when criteria are absent", () => {
    for (const empty of [null, "", "   \n  "]) {
      const parsed = parseCriteria(trialWithCriteria(empty));
      expect(parsed.segmented).toBe(false);
      expect(parsed.criteria).toHaveLength(0);
      expect(parsed.notice).toBeTruthy();
    }
  });

  it("returns the block when headings exist but contain no items", () => {
    const parsed = parseCriteria(trialWithCriteria("Inclusion Criteria:\n\nExclusion Criteria:\n"));
    expect(parsed.segmented).toBe(false);
    expect(parsed.criteria[0]?.type).toBe("unsegmented");
  });

  it("never throws on hostile or malformed input", () => {
    const nasty = [
      "Inclusion Criteria:\n" + "- item\n".repeat(500),
      " Inclusion Criteria: ",
      "Inclusion Criteria:\n1.\n2.\n3.",
      "EXCLUSION CRITERIA:\n* only exclusions here",
      "x".repeat(50_000),
    ];
    for (const text of nasty) {
      expect(() => parseCriteria(trialWithCriteria(text))).not.toThrow();
      const parsed = parseCriteria(trialWithCriteria(text));
      expect(Array.isArray(parsed.criteria)).toBe(true);
    }
  });

  it("falls back rather than emitting an implausible number of criteria", () => {
    const parsed = parseCriteria(
      trialWithCriteria("Inclusion Criteria:\n" + "- item\n".repeat(500)),
    );
    expect(parsed.segmented).toBe(false);
    expect(parsed.criteria).toHaveLength(1);
  });
});

describe("exclusion-only and inclusion-only studies", () => {
  it("handles an exclusion-only block", () => {
    const parsed = parseCriteria(
      trialWithCriteria("Exclusion Criteria:\n\n1. Active second condition.\n2. Pregnancy."),
    );
    expect(parsed.segmented).toBe(true);
    expect(parsed.criteria.filter((c) => c.type === "exclusion")).toHaveLength(2);
    expect(parsed.criteria.filter((c) => c.type === "inclusion")).toHaveLength(0);
  });

  it("does not turn preamble text before a heading into a criterion", () => {
    const parsed = parseCriteria(
      trialWithCriteria(
        "Participants will be assessed as follows.\n\nInclusion Criteria:\n\n1. Adults over 18.",
      ),
    );
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0].verbatimText).toContain("Adults over 18");
  });
});
