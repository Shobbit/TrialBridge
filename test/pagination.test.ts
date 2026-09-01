import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/lib/ctgov/types";
import { rawStudyFixture } from "./fixtures";

/**
 * Bounded pagination.
 *
 * One upstream page is not one screen of results — the disease, stage and
 * prior-treatment filters routinely remove most of it — so the route keeps
 * fetching until it has enough to show. These tests hold the bounds in place:
 * it must stop, it must never re-send a page token, it must never count a study
 * twice, and it must say honestly how far it actually looked.
 *
 * All NCT ids and study details are fictional.
 */

vi.mock("@/lib/ctgov/fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ctgov/fetch")>("@/lib/ctgov/fetch");
  return { ...actual, fetchUpstreamJson: vi.fn() };
});
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null) }));

const { fetchUpstreamJson, UpstreamError } = await import("@/lib/ctgov/fetch");
const { POST } = await import("@/app/api/trials/search/route");

const mock = vi.mocked(fetchUpstreamJson);

/** A raw study record with the given id, on topic for "melanoma". */
function record(n: number) {
  return {
    ...rawStudyFixture,
    protocolSection: {
      ...rawStudyFixture.protocolSection,
      identificationModule: {
        ...rawStudyFixture.protocolSection.identificationModule,
        nctId: `NCT${String(90000000 + n)}`,
        briefTitle: `Fictional melanoma study ${n}`,
      },
      conditionsModule: { conditions: ["Melanoma"] },
    },
  };
}

/** One upstream page. */
function page(ids: number[], nextPageToken: string | null, totalCount = 500) {
  return { totalCount, studies: ids.map(record), nextPageToken };
}

/**
 * A page whose studies are all the wrong disease, so every one is filtered out.
 *
 * Ids are unique across calls unless `base` is repeated deliberately, so a test
 * about deduplication has to opt into the repeat rather than get it by accident.
 */
let offTopicCursor = 1000;
function offTopicPage(count: number, nextPageToken: string | null, base?: number) {
  const from = base ?? offTopicCursor;
  if (base === undefined) offTopicCursor += count;
  const studies = Array.from({ length: count }, (_, i) => {
    const r = record(from + i);
    r.protocolSection.conditionsModule = { conditions: ["Type 1 Diabetes"] };
    return r;
  });
  return { totalCount: 500, studies, nextPageToken };
}

async function search(body: Record<string, unknown> = {}): Promise<SearchResponse> {
  const response = await POST(
    new Request("https://trialbridge.test/api/trials/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ condition: "melanoma", ...body }),
    }),
  );
  return (await response.json()) as SearchResponse;
}

/** The page tokens the route actually sent, in order. */
function sentTokens(): (string | null)[] {
  return mock.mock.calls.map((call) => new URL(String(call[0])).searchParams.get("pageToken"));
}

beforeEach(() => {
  mock.mockReset();
  offTopicCursor = 1000;
});

describe("fetching until there is enough to show", () => {
  it("stops after one page when that page already fills the screen", async () => {
    mock.mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], "t1"));

    const data = await search();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(data.meta.stopReason).toBe("target-reached");
    expect(data.meta.returnedCount).toBe(20);
    expect(data.meta.pagesFetched).toBe(1);
  });

  it("keeps going when the filters emptied the first page", async () => {
    // The case the whole feature exists for: the registry returned 20 studies
    // and every one was the wrong disease.
    mock
      .mockResolvedValueOnce(offTopicPage(20, "t1"))
      .mockResolvedValueOnce(offTopicPage(20, "t2"))
      .mockResolvedValueOnce(page([1, 2, 3], null));

    const data = await search();

    expect(mock).toHaveBeenCalledTimes(3);
    expect(data.trials).toHaveLength(3);
    expect(data.meta.removedOffTopic).toBe(40);
    expect(data.meta.recordsChecked).toBe(43);
    expect(data.meta.stopReason).toBe("no-more-pages");
  });

  it("stops immediately when the registry offers no further page", async () => {
    mock.mockResolvedValueOnce(page([1, 2], null));

    const data = await search();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(data.meta.stopReason).toBe("no-more-pages");
    expect(data.meta.nextPageToken).toBeNull();
  });
});

describe("the bounds", () => {
  it("never fetches more than five pages", async () => {
    for (let i = 0; i < 10; i += 1) {
      mock.mockResolvedValueOnce(offTopicPage(5, `t${i + 1}`));
    }

    const data = await search();

    expect(mock).toHaveBeenCalledTimes(5);
    expect(data.meta.pagesFetched).toBe(5);
    expect(data.meta.stopReason).toBe("page-limit");
  });

  it("never scans more than a hundred records", async () => {
    for (let i = 0; i < 10; i += 1) {
      mock.mockResolvedValueOnce(offTopicPage(50, `t${i + 1}`));
    }

    const data = await search({ pageSize: 50 });

    expect(data.meta.recordsChecked).toBeLessThanOrEqual(100);
    expect(data.meta.stopReason).toBe("record-limit");
  });

  it("says plainly that it stopped at a limit, not at the end", async () => {
    for (let i = 0; i < 10; i += 1) {
      mock.mockResolvedValueOnce(offTopicPage(5, `t${i + 1}`));
    }

    const data = await search();

    expect(data.meta.warnings.join(" ")).toMatch(/stopped after checking 25 records across 5 pages/i);
    expect(data.meta.warnings.join(" ")).toMatch(/More studies may match/i);
  });

  it("hands back the token to continue from when it stopped early", async () => {
    mock.mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], "carry-on"));

    const data = await search();

    expect(data.meta.nextPageToken).toBe("carry-on");
  });
});

describe("page tokens", () => {
  it("never sends the same token twice", async () => {
    mock
      .mockResolvedValueOnce(offTopicPage(5, "t1"))
      .mockResolvedValueOnce(offTopicPage(5, "t2"))
      .mockResolvedValueOnce(page([1], null));

    await search();

    const tokens = sentTokens();
    expect(tokens).toEqual([null, "t1", "t2"]);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("stops when the registry repeats a token instead of looping forever", async () => {
    // Observed upstream behaviour at the end of a result set. Following it
    // would fetch the same page until the process gave up.
    mock
      .mockResolvedValueOnce(offTopicPage(5, "same"))
      .mockResolvedValueOnce(offTopicPage(5, "same"))
      .mockResolvedValue(offTopicPage(5, "same"));

    const data = await search();

    expect(mock).toHaveBeenCalledTimes(2);
    expect(data.meta.stopReason).toBe("no-more-pages");
    expect(data.meta.nextPageToken).toBeNull();
  });

  it("continues from a token the caller supplied", async () => {
    mock.mockResolvedValueOnce(page([1], null));

    await search({ pageToken: "from-the-client" });

    expect(sentTokens()).toEqual(["from-the-client"]);
  });
});

describe("deduplication", () => {
  it("counts a study returned on two pages only once", async () => {
    mock
      .mockResolvedValueOnce(page([1, 2, 3], "t1"))
      .mockResolvedValueOnce(page([3, 4, 5], null));

    const data = await search();

    expect(data.trials.map((t) => t.nctId)).toEqual([
      "NCT90000001",
      "NCT90000002",
      "NCT90000003",
      "NCT90000004",
      "NCT90000005",
    ]);
    // Six records were read even though five studies came back.
    expect(data.meta.recordsChecked).toBe(6);
  });

  it("does not let a repeat inflate the removed counts", async () => {
    const off = offTopicPage(3, "t1", 5000);
    mock.mockResolvedValueOnce(off).mockResolvedValueOnce({ ...off, nextPageToken: null });

    const data = await search();

    expect(data.meta.removedOffTopic).toBe(3);
  });
});

describe("honest metadata", () => {
  it("reports records checked separately from trials shown", async () => {
    mock
      .mockResolvedValueOnce(offTopicPage(20, "t1"))
      .mockResolvedValueOnce(page([1, 2], null));

    const data = await search();

    expect(data.meta.returnedCount).toBe(2);
    expect(data.meta.recordsChecked).toBe(22);
    expect(data.meta.pagesFetched).toBe(2);
  });

  it("keeps the registry's own total distinct from what is shown", async () => {
    mock.mockResolvedValueOnce(page([1], null, 482));

    const data = await search();

    expect(data.meta.totalCount).toBe(482);
    expect(data.meta.returnedCount).toBe(1);
  });

  it("records every upstream URL it used", async () => {
    mock.mockResolvedValueOnce(offTopicPage(5, "t1")).mockResolvedValueOnce(page([1], null));

    const data = await search();

    expect(data.meta.upstreamUrls).toHaveLength(2);
    expect(data.meta.upstreamUrl).toBe(data.meta.upstreamUrls[0]);
    expect(new URL(data.meta.upstreamUrls[1]).searchParams.get("pageToken")).toBe("t1");
  });
});

describe("when a page fails", () => {
  it("fails the search when the first page fails", async () => {
    mock.mockRejectedValueOnce(new UpstreamError("ClinicalTrials.gov is unavailable.", 503, true));

    const response = await POST(
      new Request("https://trialbridge.test/api/trials/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: "melanoma" }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("keeps what it already found when a later page fails", async () => {
    // Discarding good studies because page three timed out would be worse than
    // returning a short list and saying so.
    mock
      .mockResolvedValueOnce(page([1, 2], "t1"))
      .mockRejectedValueOnce(new UpstreamError("Upstream timed out.", 504, true));

    const data = await search();

    expect(data.trials).toHaveLength(2);
    expect(data.meta.warnings.join(" ")).toMatch(/may be incomplete/i);
  });
});
