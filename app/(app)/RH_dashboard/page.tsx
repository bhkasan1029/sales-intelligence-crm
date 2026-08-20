import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";

const FAKE_KPIS = [
  { label: "Region Achievement", value: "54%", hint: "Weighted across 2 branches" },
  { label: "Pending Rule Requests", value: 1, hint: "Awaiting Admin decision" },
  { label: "Total Open Actions", value: 18, hint: "Across all RMs in region" },
];

const FAKE_BRANCHES = [
  {
    id: "b1",
    manager: "Deepak Verma",
    achievedPct: 47,
    achievedPctTone: "bg-red-50 text-red-700 border-red-200",
    rmCount: 2,
    openActions: 9,
    subtitle: "₹13.3L of ₹28L branch target",
  },
  {
    id: "b2",
    manager: "Anita Rao",
    achievedPct: 94,
    achievedPctTone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rmCount: 1,
    openActions: 5,
    subtitle: "₹8.5L of ₹9L branch target",
  },
];

export default async function RHDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">
          Welcome back, {session.name.split(" ")[0]}
        </h2>
        <p className="text-gray-500">Branches sorted worst-to-best, so what needs attention is on top.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {FAKE_KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{k.label}</p>
            <p className="text-3xl font-bold text-[#1A1A1A]">{k.value}</p>
            <p className="text-xs text-gray-400 mt-2">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#1A1A1A]">Branches</h3>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button className="px-3 py-1 text-xs font-medium rounded-md bg-[#1A1A1A] text-white">
            Branches
          </button>
          <button
            className="px-3 py-1 text-xs font-medium text-gray-500 cursor-not-allowed"
            disabled
            title="Rule tuning — coming soon"
          >
            Rules
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {FAKE_BRANCHES.map((b) => (
          <div
            key={b.id}
            className="rounded-xl border border-gray-200 bg-white p-5 flex items-center justify-between gap-4 hover:border-gray-300 transition-colors"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${b.achievedPctTone}`}>
                  {b.achievedPct}% target
                </span>
                <span className="text-xs text-gray-500">
                  {b.rmCount} RM{b.rmCount === 1 ? "" : "s"} · {b.openActions} open action{b.openActions === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm font-medium text-[#1A1A1A]">{b.manager}&apos;s branch</p>
              <p className="text-xs text-gray-500 mt-1">{b.subtitle}</p>
            </div>
            <button
              className="text-xs text-gray-400 cursor-not-allowed"
              disabled
              title="Drill-in — coming soon"
            >
              View →
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-8 text-center">
        Placeholder data. Real rollup lands once <code className="font-mono">/api/team/[managerId]/branches</code> is wired.
      </p>
    </div>
  );
}
