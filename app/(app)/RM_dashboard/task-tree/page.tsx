import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getTaskGraph } from "@/lib/queries/task-graph";
import TaskGraphClient from "@/components/task-graph";

export default async function TaskTreePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  // RM sees only their own open actions + linked tasks.
  const data = await getTaskGraph({ rmId: session.user_id });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/RM_dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>

      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
          Task coverage
        </p>
        <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">Task Tree</h2>
        <p className="mt-1 text-gray-500">
          Bipartite view of your open actions and the tasks that cover them.
          Blue paths show the smallest set of tasks that would clear every open
          action.
        </p>
      </div>

      <TaskGraphClient initialData={data} />
    </div>
  );
}
