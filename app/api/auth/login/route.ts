import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { signToken, type Role } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  const user = rows[0];
  if (!user || !user.password_hash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signToken({
    user_id: user.id,
    role: user.role as Role,
    team_id: user.team_id,
    name: user.name,
  });

  await sql`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
    VALUES (${user.id}, 'login', 'user', ${user.id})`;

  const res = NextResponse.json({ role: user.role, name: user.name });
  res.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
