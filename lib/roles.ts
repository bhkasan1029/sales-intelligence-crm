/**
 * Role constants with no server dependencies, so client components can import
 * them. lib/auth.ts re-exports these — it pulls in next/headers and cannot be
 * imported from the browser bundle.
 */

export type Role = "rm" | "branch_manager" | "regional_head" | "admin";

export const ROLE_HOME: Record<Role, string> = {
  rm: "/RM_dashboard",
  branch_manager: "/BM_dashboard",
  regional_head: "/RH_dashboard",
  admin: "/admin_dashboard/rules",
};
