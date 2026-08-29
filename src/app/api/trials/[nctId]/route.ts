import { NextResponse } from "next/server";
import { UpstreamError, fetchUpstreamJson } from "@/lib/ctgov/fetch";
import { normalizeStudy } from "@/lib/ctgov/normalize";
import { buildStudyUrl } from "@/lib/ctgov/query";
import { isFiniteCoord } from "@/lib/geo";
import { nctIdSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/**
 * GET /api/trials/:nctId
 *
 * Returns the full normalised record for a single study, including the
 * complete free-text eligibility criteria.
 *
 * Optional `lat`/`lon` query parameters let the caller receive distances
 * measured from a point they already resolved, avoiding a second geocode.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ nctId: string }> },
) {
  const { nctId: rawId } = await context.params;

  const parsed = nctIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid NCT identifier. Expected the format NCT01234567." },
      { status: 400 },
    );
  }
  const nctId = parsed.data;

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const origin = isFiniteCoord(lat, lon) ? { lat, lon } : null;

  try {
    const raw = await fetchUpstreamJson(buildStudyUrl(nctId));
    const trial = normalizeStudy(raw, origin);

    if (!trial) {
      return NextResponse.json(
        { error: `No usable record was returned for ${nctId}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({ trial, retrievedAt: trial.retrievedAt });
  } catch (error) {
    if (error instanceof UpstreamError) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving the trial.", retryable: true },
      { status: 500 },
    );
  }
}
