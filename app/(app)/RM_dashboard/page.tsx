import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getRmDashboard } from "@/lib/queries/rm";
import DashboardClient from "./dashboard-client";

export default async function RMDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  // First paint comes from the server so the queue is on screen before any
  // client fetch; the board polls from there.
  const initial = await getRmDashboard(session.user_id);

  return (
    <Suspense>
      <DashboardClient initial={initial} />
    </Suspense>
  );
}
