import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getBranchTaskGraph } from "@/lib/queries/task-graph";
import TaskGraphClient from "@/components/task-graph";

export default async function TaskGroupingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "branch_manager") redirect(ROLE_HOME[session.role]);

  const data = await getBranchTaskGraph(session.user_id);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/BM_dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="size-4" />
        Back to overview
      </Link>

      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
          Task coverage optimization
        </p>
        <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">
          Task Grouping Matrix
        </h2>
        <p className="mt-1 text-gray-500">
          Bipartite view: which tasks cover which actions. Blue paths show the
          smallest set of tasks that clears every open action on your team.
        </p>
      </div>

      <TaskGraphClient initialData={data} />
    </div>
  );
}
