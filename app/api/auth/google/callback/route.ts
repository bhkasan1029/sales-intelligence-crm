import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { sql } from "@/lib/db";
import { signToken, ROLE_HOME, type Role } from "@/lib/auth";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function errorRedirect(req: NextRequest, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return errorRedirect(req, "google_not_configured");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return errorRedirect(req, "invalid_state");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return errorRedirect(req, "token_exchange_failed");
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return errorRedirect(req, "no_id_token");

  let claims: GoogleIdTokenClaims;
  try {
    const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    claims = payload as unknown as GoogleIdTokenClaims;
  } catch {
    return errorRedirect(req, "id_token_verification_failed");
  }

  if (!claims.email || !claims.email_verified) {
    return errorRedirect(req, "email_not_verified");
  }

  const googleId = claims.sub;
  const email = claims.email;
  const name = claims.name ?? email.split("@")[0];
  const avatar = claims.picture ?? null;

  const byGoogle = await sql`SELECT * FROM users WHERE google_id = ${googleId}`;
  let user = byGoogle[0];

  if (!user) {
    const byEmail = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (byEmail[0]) {
      const linked = await sql`
        UPDATE users
        SET google_id = ${googleId},
            avatar_url = COALESCE(${avatar}, avatar_url)
        WHERE id = ${byEmail[0].id}
        RETURNING *`;
      user = linked[0];
    } else {
      const created = await sql`
        INSERT INTO users (name, email, google_id, avatar_url, role)
        VALUES (${name}, ${email}, ${googleId}, ${avatar}, 'rm')
        RETURNING *`;
      user = created[0];
      await sql`
        INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
        VALUES (${user.id}, 'signup_google', 'user', ${user.id})`;
    }
  }

  await sql`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id)
    VALUES (${user.id}, 'login_google', 'user', ${user.id})`;

  const token = await signToken({
    user_id: user.id,
    role: user.role as Role,
    team_id: user.team_id,
    name: user.name,
  });

  const home = ROLE_HOME[user.role as Role] ?? "/";
  const res = NextResponse.redirect(new URL(home, req.url));
  res.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  res.cookies.delete("oauth_state");
  return res;
}
