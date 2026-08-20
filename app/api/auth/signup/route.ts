import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { registerSchema } from "@/lib/validations/user";
import { signToken, type Role } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, password } = parsed.data;

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const defaultRole: Role = "rm";

  const rows = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${name}, ${email}, ${password_hash}, ${defaultRole})
    RETURNING id, name, role, team_id`;
  const user = rows[0];

  const token = await signToken({
    user_id: user.id,
    role: user.role as Role,
    team_id: user.team_id,
    name: user.name,
  });

  await sql`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
    VALUES (${user.id}, 'signup', 'user', ${user.id})`;

  const res = NextResponse.json({ role: user.role, name: user.name }, { status: 201 });
  res.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
