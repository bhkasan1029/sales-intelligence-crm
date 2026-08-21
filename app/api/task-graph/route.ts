import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBranchTaskGraph } from "@/lib/queries/task-graph";

/**
 * GET /api/task-graph — branch-scoped action↔task bipartite graph + the
 * greedy minimum-cover task set. BM-only. Read-only; nothing is written.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "branch_manager") {
    return NextResponse.json(
      { ok: false, error: "Branch managers only" },
      { status: 403 },
    );
  }
  const data = await getBranchTaskGraph(session.user_id);
  return NextResponse.json({ ok: true, data });
}
