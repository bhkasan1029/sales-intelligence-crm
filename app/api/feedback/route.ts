import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { feedbackSchema } from "@/lib/validations/feedback";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid submission" },
      { status: 400 }
    );
  }

  const { category, subject, body, related_rule_id, related_action_id } =
    parsed.data;

  const [row] = await sql`
    INSERT INTO feedback (author_id, category, related_rule_id, related_action_id, subject, body)
    VALUES (${session.user_id}, ${category}, ${related_rule_id || null},
      ${related_action_id || null}, ${subject}, ${body})
    RETURNING id, category, subject, body, status, created_at`;

  return NextResponse.json(row, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admins triage everything; everyone else only ever sees what they filed.
  const rows =
    session.role === "admin"
      ? await sql`
          SELECT id, author_id, category, subject, body, status, created_at, resolved_at
          FROM feedback ORDER BY created_at DESC`
      : await sql`
          SELECT id, author_id, category, subject, body, status, created_at, resolved_at
          FROM feedback WHERE author_id = ${session.user_id}
          ORDER BY created_at DESC`;

  return NextResponse.json(rows);
}
