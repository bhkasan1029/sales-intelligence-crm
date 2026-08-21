import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getBranchInfo, getNotifications } from "@/lib/queries/rm";
import DashboardShell from "@/components/dashboard-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // The JWT only carries id/role/name; the avatar and reporting line come from
  // the row itself so the chrome shows current data after a profile change.
  const [[user], branch, notifications] = await Promise.all([
    sql`SELECT avatar_url FROM users WHERE id = ${session.user_id}`,
    getBranchInfo(session.user_id, session.role),
    getNotifications(session.user_id),
  ]);

  return (
    <DashboardShell
      session={{
        name: session.name,
        role: session.role,
        avatar_url: (user?.avatar_url as string) ?? null,
        branch,
        notifications,
      }}
    >
      {children}
    </DashboardShell>
  );
}
