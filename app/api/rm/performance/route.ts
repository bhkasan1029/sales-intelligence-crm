import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPerformance } from "@/lib/queries/performance";
import { parseTimeframe } from "@/lib/performance";

/**
 * GET /api/rm/performance?timeframe=weekly|monthly|annual
 *
 * The whole Performance page in one snapshot: the pacing series, the peer
 * benchmark, the written insight and the three tiles — all computed off the
 * same clock, so no two panels can describe different moments.
 *
 * Scoped to the signed-in RM. Peer figures are reduced to medians inside
 * getPerformance(); no individual peer's data crosses this boundary.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "rm") {
    return NextResponse.json({ error: "RM only" }, { status: 403 });
  }

  const timeframe = parseTimeframe(req.nextUrl.searchParams.get("timeframe"));
  const data = await getPerformance(session.user_id, timeframe);

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
