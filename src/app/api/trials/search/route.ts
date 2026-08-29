import { NextResponse } from "next/server";
import { z } from "zod";
import { UpstreamError, fetchUpstreamJson } from "@/lib/ctgov/fetch";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import { buildSearchUrl } from "@/lib/ctgov/query";
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

  const upstreamUrl = buildSearchUrl({ input, origin });

  try {
    const raw = await fetchUpstreamJson(upstreamUrl);
    const payload = (raw ?? {}) as Record<string, unknown>;
    const studies = Array.isArray(payload.studies) ? payload.studies : [];

    const trials: Trial[] = studies
      .map((study) => normalizeStudy(study, origin))
      .filter((t): t is Trial => t !== null);

    if (studies.length > 0 && trials.length === 0) {
      warnings.push("Records were returned but none contained a usable study identifier.");
    }

    const response: SearchResponse = {
      trials,
      meta: {
        totalCount: typeof payload.totalCount === "number" ? payload.totalCount : null,
        returnedCount: trials.length,
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
