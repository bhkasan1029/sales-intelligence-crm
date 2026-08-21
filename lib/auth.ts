import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ROLE_HOME, type Role } from "@/lib/roles";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

// Re-exported so existing server-side imports keep working; client components
// must import them from lib/roles.ts instead — this module touches next/headers.
export { ROLE_HOME };
export type { Role };

export type Session = {
  user_id: string;
  role: Role;
  team_id: string | null;
  name: string;
};

export async function signToken(payload: Session) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as Session;
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}
