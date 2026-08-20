import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { sql } from "@/lib/db";

export default async function SelfEvaluationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  const period = new Date().toISOString().slice(0, 7);

  const [target] = await sql`
    SELECT target_value, achieved_value FROM targets
    WHERE owner_id = ${session.user_id} AND owner_role = 'rm' AND period = ${period}
    ORDER BY set_at DESC LIMIT 1`;

  // Status values aligned with lib/rules-engine.ts:
  //   'open'    → live in the Tasks list (deadline null or past)
  //   'snoozed' → paused by RM; or auto-hidden because deadline is in the future
  //   'done'    → completed by RM via PATCH /api/actions/[id] { op:'complete' }
  const [actionStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open' AND (sla_deadline IS NULL OR sla_deadline <= now())) AS open_count,
      COUNT(*) FILTER (WHERE status <> 'done' AND sla_deadline > now()) AS snoozed_count,
      COUNT(*) FILTER (WHERE status = 'done') AS closed_total,
      COUNT(*) FILTER (WHERE status = 'done' AND updated_at > now() - interval '7 days') AS closed_week,
      COALESCE(ROUND(AVG(priority_score) FILTER (WHERE status = 'done'), 0), 0) AS avg_closed_priority
    FROM actions WHERE rm_id = ${session.user_id}`;

  const [customerStats] = await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE stage = 'new') AS new_leads,
      COUNT(*) FILTER (WHERE stage = 'in_progress') AS in_progress,
      COUNT(*) FILTER (WHERE stage = 'active') AS active
    FROM customers WHERE rm_id = ${session.user_id}`;

  const targetValue = Number(target?.target_value ?? 0);
  const achievedValue = Number(target?.achieved_value ?? 0);
  const achievedPct = targetValue > 0 ? Math.round((achievedValue / targetValue) * 100) : 0;
  const barPct = Math.min(achievedPct, 100);

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">Self evaluation</h2>
        <p className="text-gray-500">Period: {period}</p>
      </div>

      {/* Target progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Target Achievement</p>
            <p className="text-3xl font-bold text-[#1A1A1A] mt-1">{achievedPct}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">{fmt(achievedValue)} of {fmt(targetValue)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {targetValue === 0 ? "No target set for this month" : `${fmt(targetValue - achievedValue)} to go`}
            </p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${achievedPct >= 100 ? "bg-emerald-500" : achievedPct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Actions section */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatBox label="Open" value={actionStats.open_count} />
        <StatBox label="Snoozed" value={actionStats.snoozed_count} />
        <StatBox label="Closed (7d)" value={actionStats.closed_week} />
        <StatBox label="Closed (all)" value={actionStats.closed_total} />
      </div>

      {/* Customers section */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Customers</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total" value={customerStats.total} />
        <StatBox label="New leads" value={customerStats.new_leads} />
        <StatBox label="In progress" value={customerStats.in_progress} />
        <StatBox label="Active" value={customerStats.active} />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}
