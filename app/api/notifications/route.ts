import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getNotifications } from "@/lib/queries/rm";

/** GET /api/notifications — the 20 most recent for the signed-in user. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getNotifications(session.user_id);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PATCH /api/notifications
 * Body: { id } to mark one read, or { all: true } for the whole list.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const all = body?.all === true;
  if (!id && !all) {
    return NextResponse.json({ error: "Pass an id or all:true" }, { status: 400 });
  }

  if (all) {
    await sql`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${session.user_id} AND read_at IS NULL`;
  } else {
    await sql`
      UPDATE notifications SET read_at = now()
      WHERE id = ${id} AND user_id = ${session.user_id} AND read_at IS NULL`;
  }

  return NextResponse.json(await getNotifications(session.user_id));
}
