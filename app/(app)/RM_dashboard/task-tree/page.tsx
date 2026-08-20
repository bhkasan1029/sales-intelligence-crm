import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";

export default async function TaskTreePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">Task tree</h2>
        <p className="text-gray-500">Priority graph across all your open actions.</p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center">
        <p className="text-gray-500 max-w-md mx-auto">
          Priority graph — coming soon. Will render a force-directed view of your open actions
          weighted by priority score once the visualization is wired.
        </p>
      </div>
    </div>
  );
}
