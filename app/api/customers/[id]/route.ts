import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomerDetail } from "@/lib/queries/rm";

/**
 * GET /api/customers/[id] — the customer behind a queue card: profile, counts
 * and a merged event/action timeline. Scoped to the caller's own book.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const detail = await getCustomerDetail(session.user_id, id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
