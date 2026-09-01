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

  const upstreamUrl = buildSearchUrl({ input, origin, cancerQuery: selectedCancer?.query ?? null });

  try {
    const raw = await fetchUpstreamJson(upstreamUrl);
    const payload = (raw ?? {}) as Record<string, unknown>;
    const studies = Array.isArray(payload.studies) ? payload.studies : [];

    const normalized: Trial[] = studies
      .map((study) => normalizeStudy(study, origin))
      .filter((t): t is Trial => t !== null);

    if (studies.length > 0 && normalized.length === 0) {
      warnings.push("Records were returned but none contained a usable study identifier.");
    }

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

    if (offTopic > 0) {
      const subject = selectedCancer?.label ?? input.condition;
      warnings.push(
        `${offTopic} ${offTopic === 1 ? "study was" : "studies were"} returned by ClinicalTrials.gov but ${offTopic === 1 ? "does" : "do"} not list ${subject} among the conditions studied, so ${offTopic === 1 ? "it was" : "they were"} not shown.`,
      );
    }

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
    const trials = wantsStage
      ? onTopic.filter((t) => stageMatches(t.stageRequirement, input.cancerStage))
      : onTopic;
    const removedByStage = onTopic.length - trials.length;

    if (removedByStage > 0) {
      warnings.push(
        `${removedByStage} ${removedByStage === 1 ? "study states a stage that does" : "studies state stages that do"} not include stage ${input.cancerStage}, so ${removedByStage === 1 ? "it was" : "they were"} not shown. Studies that do not state a stage are still listed.`,
      );
    }

    /*
     * Prior treatment: hide only a clear, unconditional bar.
     *
     * A study whose exclusion criteria plainly name a drug the person has
     * already had is a dead end, and reading it costs them time they do not
     * have. Those are moved out of the main list — moved, not discarded: they
     * travel with the response so the person can read them on request, with the
     * criterion that triggered it shown verbatim.
     *
     * Anything conditional is left in the list with a note. "No prior
     * everolimus within 4 weeks" depends on dates only the person and the study
     * team know, so this app must not decide it for them.
     */
    const { visible, hidden } = partitionByPriorTreatment(trials, input.netTreatments ?? []);

    if (hidden.length > 0) {
      warnings.push(
        `${hidden.length} ${hidden.length === 1 ? "study lists an exclusion criterion that names a treatment" : "studies list exclusion criteria that name treatments"} you entered, so ${hidden.length === 1 ? "it is" : "they are"} not shown by default. You can still read ${hidden.length === 1 ? "it" : "them"}, and only the study team can confirm whether the criterion applies to you.`,
      );
    }

    const response: SearchResponse = {
      trials: visible,
      hiddenTrials: hidden,
      meta: {
        totalCount: typeof payload.totalCount === "number" ? payload.totalCount : null,
        returnedCount: visible.length,
        removedOffTopic: offTopic,
        removedByStage,
        hiddenByPriorTreatment: hidden.length,
        nextPageToken: typeof payload.nextPageToken === "string" ? payload.nextPageToken : null,
        retrievedAt: new Date().toISOString(),
        upstreamUrl,
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
