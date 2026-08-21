import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRmDashboard } from "@/lib/queries/rm";

/**
 * GET /api/rm/dashboard — everything the RM dashboard renders: the three KPI
 * tiles and the prioritised action queue, computed from the same snapshot so
 * the tiles can never disagree with the cards below them.
 *
 * The client polls this while the tab is visible; that poll doubles as the
 * "Live Engine" latency probe in the header.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "rm") {
    return NextResponse.json({ error: "RM only" }, { status: 403 });
  }

  const data = await getRmDashboard(session.user_id);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
