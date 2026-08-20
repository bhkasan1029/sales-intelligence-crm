import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export type Role = "rm" | "branch_manager" | "regional_head" | "admin";
export type Session = {
  user_id: string;
  role: Role;
  team_id: string | null;
  name: string;
};

export const ROLE_HOME: Record<Role, string> = {
  rm: "/RM_dashboard",
  branch_manager: "/BM_dashboard",
  regional_head: "/RH_dashboard",
  admin: "/rules",
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
