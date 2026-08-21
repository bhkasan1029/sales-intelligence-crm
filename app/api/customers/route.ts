import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { visibleRmIds } from "@/lib/scope";
import { getCustomerBook } from "@/lib/queries/rm";
import { customerSchema } from "@/lib/validations/customer";

/**
 * GET /api/customers — the caller's customer book, already shaped for the
 * Customers & Leads table. Scoping happens inside SQL via visibleRmIds: an RM
 * sees their own book, a manager their team's, a regional head their region's.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getCustomerBook(await visibleRmIds(session));
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/customers — "New Record" on the Customers & Leads page. An RM can
 * only ever create into their own book, so rm_id comes from the session and is
 * never accepted from the body.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "rm") {
    return NextResponse.json({ error: "RM only" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = customerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid record" },
      { status: 400 }
    );
  }

  const { name, segment, stage, potential_value, lead_source, mobile, email } = parsed.data;

  const [row] = await sql`
    INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source, mobile, email)
    VALUES (${name}, ${session.user_id}, ${segment}, ${stage}, ${potential_value},
            ${lead_source}, ${mobile || null}, ${email || null})
    RETURNING id, name, segment, stage, potential_value, lead_source, assigned_at`;

  return NextResponse.json(row, { status: 201 });
}
