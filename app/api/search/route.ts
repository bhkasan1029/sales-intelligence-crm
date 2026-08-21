import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { visibleRmIds } from "@/lib/scope";
import { searchWorkspace } from "@/lib/queries/rm";

/**
 * GET /api/search?q= — the header's omni-search. Results are limited to the
 * RMs the caller can see (lib/scope.ts), so a manager searching gets their
 * branch and an RM only ever gets their own book.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const scope = await visibleRmIds(session);
  const hits = await searchWorkspace(scope === "*" ? "*" : (scope as string[]), q);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
