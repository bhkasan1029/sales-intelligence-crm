import { sql } from "@/lib/db";
import type { Session } from "@/lib/auth";

export type Scope = "*" | string[];

export async function visibleRmIds(session: Session): Promise<Scope> {
  if (session.role === "admin") return "*";
  if (session.role === "rm") return [session.user_id];

  if (session.role === "branch_manager") {
    const rows = await sql`
      SELECT id FROM users
      WHERE manager_id = ${session.user_id} AND role = 'rm'`;
    return rows.map((r) => r.id as string);
  }

  const rows = await sql`
    WITH RECURSIVE tree AS (
      SELECT id, role FROM users WHERE manager_id = ${session.user_id}
      UNION ALL
      SELECT u.id, u.role FROM users u JOIN tree ON u.manager_id = tree.id
    )
    SELECT id FROM tree WHERE role = 'rm'`;
  return rows.map((r) => r.id as string);
}
