import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import TasksList from "./tasks-list";

export default async function RMDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">
          Welcome back, {session.name.split(" ")[0]}
        </h2>
        <p className="text-gray-500">Here&apos;s what needs your attention today.</p>
      </div>

      <TasksList />
    </div>
  );
}
