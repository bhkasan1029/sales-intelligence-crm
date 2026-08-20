import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ASSIGNABLE_ROLES = ["rm", "branch_manager"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "regional_head") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user_id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nextRole = body?.role as AssignableRole | undefined;
  if (!nextRole || !ASSIGNABLE_ROLES.includes(nextRole)) {
    return NextResponse.json(
      { error: "Role must be 'rm' or 'branch_manager'" },
      { status: 400 }
    );
  }

  const before = (await sql`SELECT id, name, email, role FROM users WHERE id = ${id}`)[0];
  if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const after = (await sql`
    UPDATE users SET role = ${nextRole}
    WHERE id = ${id}
    RETURNING id, name, email, role`)[0];

  await sql`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after)
    VALUES (${session.user_id}, 'user_role_change', 'user', ${id},
      ${JSON.stringify(before)}, ${JSON.stringify(after)})`;

  return NextResponse.json(after);
}
