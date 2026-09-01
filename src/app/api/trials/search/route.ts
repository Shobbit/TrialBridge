import { NextResponse } from "next/server";
import { z } from "zod";
import { UpstreamError, fetchUpstreamJson } from "@/lib/ctgov/fetch";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import { buildSearchUrl } from "@/lib/ctgov/query";
import { findCancer } from "@/lib/catalog/cancers";
import { partitionByPriorTreatment } from "@/lib/ctgov/prior-treatment";
import { filterByCancer } from "@/lib/ctgov/relevance";
import { stageMatches } from "@/lib/ctgov/stage";
import { DEFAULT_SEARCH_STATUS, type SearchResponse, type Trial } from "@/lib/ctgov/types";
import { geocodePlace } from "@/lib/geocode";
import { searchInputSchema, type SearchInput } from "@/lib/schemas";

export const runtime = "nodejs";

/**
 * POST /api/trials/search
 *
 * Proxies a validated search to the ClinicalTrials.gov v2 `/studies` endpoint
 * and returns normalised results. The request body carries only the coarse,
 * non-identifying search fields defined in `searchInputSchema`; nothing is
 * logged or persisted server-side.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = searchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The search request was not valid.",
        details: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  /**
   * Recruiting-first is enforced here, not merely defaulted in the form.
   *
   * Previously an omitted `recruitmentStatuses` meant no `filter.overallStatus`
   * was sent at all, so a caller that simply left the field out received
   * completed, terminated and withdrawn studies. For someone trying to enrol
   * that is pure noise, so the server now injects the default itself.
   *
   * Unsupported statuses never reach this point: `searchInputSchema` rejects
   * them with a 400 rather than silently converting them.
   */
  const input: SearchInput = {
    ...parsed.data,
    recruitmentStatuses: parsed.data.recruitmentStatuses?.length
      ? parsed.data.recruitmentStatuses
      : [DEFAULT_SEARCH_STATUS],
  };
  /*
   * Resolve the selected cancer once. Its curated query drives the upstream
   * request and its aliases/conflicts drive local matching, so both stay
   * consistent with what the person actually chose.
   */
  const selectedCancer = input.cancerId ? (findCancer(input.cancerId) ?? null) : null;
  if (input.cancerId && !selectedCancer) {
    return NextResponse.json(
      { error: `Unknown cancer selection: ${input.cancerId}` },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  // Resolve the place name so we can both filter and measure distance.
  let origin: { lat: number; lon: number } | null = null;
  let resolvedLocation: SearchResponse["meta"]["resolvedLocation"] = null;

  if (input.city || input.state) {
    const geocoded = await geocodePlace({
      city: input.city,
      state: input.state,
      country: input.country,
    });
    if (geocoded) {
      origin = { lat: geocoded.lat, lon: geocoded.lon };
      resolvedLocation = geocoded;
    } else {
      warnings.push(
        "The location could not be resolved to coordinates, so results were matched on place name instead of travel distance.",
      );
    }
  } else if (input.travelDistanceMiles) {
    warnings.push("No city or state was provided, so the travel-distance limit was not applied.");
  }

  /*
   * How far the search is allowed to go.
   *
   * One upstream page is not one screen of results: the disease, stage and
   * prior-treatment filters routinely remove most of a page, so a single fetch
   * can leave three studies on screen while the registry holds sixty more.
   *
   * The loop therefore keeps fetching until it has enough to show — but it is
   * bounded, because an unbounded loop against a free public API is an abuse of
   * it and an unbounded wait for the person. Whichever limit is reached first
   * wins, and the response says which.
   */
  const TARGET_VISIBLE = input.pageSize ?? 20;
  const MAX_PAGES = 5;
  const MAX_RECORDS_SCANNED = 100;

  type StopReason = "target-reached" | "no-more-pages" | "page-limit" | "record-limit";

  const upstreamUrls: string[] = [];
  // Tokens already sent. ClinicalTrials.gov has been observed to repeat a token
  // at the end of a result set; following it would loop forever.
  const usedTokens = new Set<string>();
  // NCT ids already seen, so a study returned on two pages is counted once.
  const seenNctIds = new Set<string>();

  let pageToken: string | null = input.pageToken ?? null;
  let nextPageToken: string | null = null;
  let pagesFetched = 0;
  let recordsChecked = 0;
  let totalCount: number | null = null;
  let stopReason: StopReason = "no-more-pages";

  const visible: Trial[] = [];
  const hidden: Trial[] = [];
  let removedOffTopic = 0;
  let removedByStage = 0;
  let unusableRecords = 0;

  try {
    for (;;) {
      // Never ask for more records than the scan budget still allows.
      const remaining = MAX_RECORDS_SCANNED - recordsChecked;
      const pageSize = Math.max(1, Math.min(TARGET_VISIBLE, remaining));

      const url = buildSearchUrl({
        input: { ...input, pageSize, pageToken },
        origin,
        cancerQuery: selectedCancer?.query ?? null,
      });
      upstreamUrls.push(url);
      if (pageToken) usedTokens.add(pageToken);

      let payload: Record<string, unknown>;
      try {
        payload = ((await fetchUpstreamJson(url)) ?? {}) as Record<string, unknown>;
      } catch (error) {
        // A failure on the first page is the search failing. A failure part-way
        // through is not: returning the studies already found, and saying a
        // page could not be read, beats discarding good results.
        if (pagesFetched === 0) throw error;
        warnings.push(
          "Part of the result set could not be read from ClinicalTrials.gov, so this list may be incomplete. Searching again may return more.",
        );
        stopReason = "no-more-pages";
        break;
      }

      pagesFetched += 1;
      const studies = Array.isArray(payload.studies) ? payload.studies : [];
      recordsChecked += studies.length;
      if (totalCount === null && typeof payload.totalCount === "number") {
        totalCount = payload.totalCount;
      }

      const normalized: Trial[] = studies
        .map((study) => normalizeStudy(study, origin))
        .filter((t): t is Trial => t !== null)
        // Deduplicate across pages before any filter runs, so a repeated study
        // cannot be counted twice in the "removed" tallies either.
        .filter((t) => {
          if (seenNctIds.has(t.nctId)) return false;
          seenNctIds.add(t.nctId);
          return true;
        });

      unusableRecords += studies.length - normalized.length;

      /*
       * ClinicalTrials.gov matches conditions loosely: a search for
       * "type 2 diabetes" returns studies listing only "Healthy Participants" or
       * "Type 1 Diabetes". Those are the wrong disease, so they are dropped here
       * rather than shown. The count is reported so the person can see it
       * happened instead of wondering why the totals disagree.
       */
      const { kept: onTopic, removed: offTopic } = filterByCancer(
        normalized,
        selectedCancer,
        input.condition,
      );
      removedOffTopic += offTopic;

      /*
       * Stage: "if available, match".
       *
       * A study that states a stage clearly must agree with the stage entered.
       * Anything uncertain is kept: no stage at all, or metastatic disease
       * mentioned without a stage. Roughly half of recruiting oncology trials
       * state no stage, so filtering them out would remove far more real options
       * than noise.
       *
       * "Metastatic" is deliberately NOT treated as a definite Stage IV. It is
       * Stage IV in many cancers but not all — melanoma Stage III already
       * includes regional metastases, and AML has no I–IV staging at all.
       */
      const wantsStage = input.cancerStage && input.cancerStage !== "unspecified";
      const staged = wantsStage
        ? onTopic.filter((t) => stageMatches(t.stageRequirement, input.cancerStage))
        : onTopic;
      removedByStage += onTopic.length - staged.length;

      /*
       * Prior treatment: hide only a clear, unconditional bar.
       *
       * A study whose exclusion criteria plainly name a drug the person has
       * already had is a dead end, and reading it costs them time they do not
       * have. Those are moved out of the main list — moved, not discarded: they
       * travel with the response so the person can read them on request, with
       * the criterion that triggered it shown verbatim.
       *
       * Anything conditional is left in the list with a note. "No prior
       * everolimus within 4 weeks" depends on dates only the person and the
       * study team know, so this app must not decide it for them.
       */
      const partitioned = partitionByPriorTreatment(staged, input.netTreatments ?? []);
      visible.push(...partitioned.visible);
      hidden.push(...partitioned.hidden);

      const token = typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;

      if (!token || usedTokens.has(token)) {
        // No further pages, or the registry handed back a token already used.
        stopReason = "no-more-pages";
        nextPageToken = null;
        break;
      }
      if (visible.length >= TARGET_VISIBLE) {
        stopReason = "target-reached";
        nextPageToken = token;
        break;
      }
      if (pagesFetched >= MAX_PAGES) {
        stopReason = "page-limit";
        nextPageToken = token;
        break;
      }
      if (recordsChecked >= MAX_RECORDS_SCANNED) {
        stopReason = "record-limit";
        nextPageToken = token;
        break;
      }

      pageToken = token;
    }

    if (unusableRecords > 0 && visible.length === 0 && hidden.length === 0) {
      warnings.push("Records were returned but none contained a usable study identifier.");
    }

    if (removedOffTopic > 0) {
      const subject = selectedCancer?.label ?? input.condition;
      warnings.push(
        `${removedOffTopic} ${removedOffTopic === 1 ? "study was" : "studies were"} returned by ClinicalTrials.gov but ${removedOffTopic === 1 ? "does" : "do"} not list ${subject} among the conditions studied, so ${removedOffTopic === 1 ? "it was" : "they were"} not shown.`,
      );
    }

    if (removedByStage > 0) {
      warnings.push(
        `${removedByStage} ${removedByStage === 1 ? "study states a stage that does" : "studies state stages that do"} not include stage ${input.cancerStage}, so ${removedByStage === 1 ? "it was" : "they were"} not shown. Studies that do not state a stage are still listed.`,
      );
    }

    if (hidden.length > 0) {
      warnings.push(
        `${hidden.length} ${hidden.length === 1 ? "study lists an exclusion criterion that names a treatment" : "studies list exclusion criteria that name treatments"} you entered, so ${hidden.length === 1 ? "it is" : "they are"} not shown by default. You can still read ${hidden.length === 1 ? "it" : "them"}, and only the study team can confirm whether the criterion applies to you.`,
      );
    }

    // Say plainly when the search stopped at a limit rather than at the end of
    // the results, so nobody reads a short list as "this is everything".
    if (stopReason === "page-limit" || stopReason === "record-limit") {
      warnings.push(
        `The search stopped after checking ${recordsChecked} ${recordsChecked === 1 ? "record" : "records"} across ${pagesFetched} ${pagesFetched === 1 ? "page" : "pages"}, which is its limit for one request. More studies may match; ClinicalTrials.gov has further pages for this search.`,
      );
    }

    const response: SearchResponse = {
      trials: visible,
      hiddenTrials: hidden,
      meta: {
        totalCount,
        returnedCount: visible.length,
        removedOffTopic,
        removedByStage,
        hiddenByPriorTreatment: hidden.length,
        recordsChecked,
        pagesFetched,
        stopReason,
        nextPageToken,
        retrievedAt: new Date().toISOString(),
        upstreamUrl: upstreamUrls[0],
        upstreamUrls,
        resolvedLocation,
        warnings,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof UpstreamError) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while searching.", retryable: true },
      { status: 500 },
    );
  }
}
