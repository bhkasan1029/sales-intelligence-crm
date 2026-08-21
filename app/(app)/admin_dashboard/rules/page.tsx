import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import ExportButton from "@/components/export-button";

export const dynamic = "force-dynamic";

type RuleRow = {
  id: string;
  name: string;
  description: string | null;
  condition: Record<string, unknown>;
  action_type: string;
  weight: string | number | null;
  active: boolean;
  version: number;
  updated_at: string;
  pending_count: number;
};

type RequestRow = {
  id: string;
  rule_id: string;
  rule_name: string;
  requested_by_name: string;
  proposed_condition: Record<string, unknown>;
  justification: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
  Paused: "bg-error-container text-on-error-container",
  pending: "bg-secondary-container text-on-secondary-container",
  approved: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
  rejected: "bg-error-container text-on-error-container",
};

/** JSONB condition rendered as `key op value` pairs the eye can scan. */
function describeCondition(condition: Record<string, unknown>): string {
  return Object.entries(condition ?? {})
    .map(([k, v]) => `${k} = ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" AND ");
}

export default async function AdminRulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(ROLE_HOME[session.role]);

  const [rules, requests] = await Promise.all([
    sql`
      SELECT r.id, r.name, r.description, r.condition, r.action_type,
             r.weight, r.active, r.version, r.updated_at,
             COUNT(c.id) FILTER (WHERE c.status = 'pending')::int AS pending_count
      FROM rules r
      LEFT JOIN rule_change_requests c ON c.rule_id = r.id
      GROUP BY r.id
      ORDER BY r.name` as unknown as Promise<RuleRow[]>,
    sql`
      SELECT c.id, c.rule_id, r.name AS rule_name, u.name AS requested_by_name,
             c.proposed_condition, c.justification, c.status, c.created_at
      FROM rule_change_requests c
      JOIN rules r ON r.id = c.rule_id
      JOIN users u ON u.id = c.requested_by
      ORDER BY (c.status = 'pending') DESC, c.created_at DESC
      LIMIT 50` as unknown as Promise<RequestRow[]>,
  ]);

  const active = rules.filter((r) => r.active).length;
  const paused = rules.length - active;
  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col w-full px-xl py-xl gap-xl relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary-fixed/30 rounded-full blur-[100px] pointer-events-none transform translate-x-1/2 -translate-y-1/2" />

      <div className="flex justify-between items-end z-10">
        <div>
          <span className="font-label-uppercase text-on-surface-variant tracking-widest block mb-xxs">
            Platform Governance
          </span>
          <h1 className="font-display-lg text-on-surface">Rules Engine</h1>
          <p className="font-body-lg text-on-surface-variant max-w-2xl mt-xs">
            Live-event conditions that drive task prioritization and manager
            alerts across every region.
          </p>
        </div>
        <button
          type="button"
          className="bg-primary hover:bg-primary-container text-on-primary font-body-md px-md py-sm rounded-lg shadow-sm flex items-center gap-xs transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Rule
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-md z-10">
        <SummaryCard label="Total Rules" value={rules.length} icon="rule" />
        <SummaryCard label="Active" value={active} icon="check_circle" tone="tertiary" />
        <SummaryCard label="Paused" value={paused} icon="pause_circle" tone="error" />
        <SummaryCard
          label="Pending Requests"
          value={pending}
          icon="inbox"
          tone="secondary"
        />
      </div>

      {/* ── Change requests filed by regional heads ─────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden z-10">
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
          <div>
            <h2 className="font-headline-sm text-on-surface">
              Rule Change Requests
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Proposed condition deltas from regional heads, newest pending first.
            </p>
          </div>
          {pending > 0 && (
            <span className="inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase bg-secondary-container text-on-secondary-container">
              {pending} awaiting review
            </span>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="px-lg py-xl text-center font-body-md text-on-surface-variant">
            No change requests filed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low">
                <tr className="font-label-uppercase text-on-surface-variant">
                  <th className="px-lg py-sm">Rule</th>
                  <th className="px-lg py-sm">Requested by</th>
                  <th className="px-lg py-sm">Proposed change</th>
                  <th className="px-lg py-sm">Justification</th>
                  <th className="px-lg py-sm">Status</th>
                  <th className="px-lg py-sm">Filed</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="border-t border-outline-variant hover:bg-surface-container-low/60 transition-colors"
                  >
                    <td className="px-lg py-md font-body-md font-semibold text-on-surface">
                      {req.rule_name}
                    </td>
                    <td className="px-lg py-md font-body-sm text-on-surface-variant">
                      {req.requested_by_name}
                    </td>
                    <td className="px-lg py-md font-mono-data text-on-surface-variant max-w-xs">
                      {describeCondition(req.proposed_condition) || "—"}
                    </td>
                    <td className="px-lg py-md font-body-sm text-on-surface-variant max-w-xs">
                      {req.justification || "—"}
                    </td>
                    <td className="px-lg py-md">
                      <span
                        className={`inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase ${STATUS_STYLES[req.status]}`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-lg py-md font-body-sm text-on-surface-variant">
                      {formatRelative(req.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Live rules ──────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden z-10">
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
          <div>
            <h2 className="font-headline-sm text-on-surface">All Rules</h2>
            <p className="font-body-sm text-on-surface-variant">
              Read-only preview. Edit, versioning and rollout live behind the
              rule detail view.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-xs">
            <button
              type="button"
              className="font-body-sm text-on-surface-variant hover:text-on-surface px-sm py-xxs rounded-md flex items-center gap-xxs"
            >
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Filter
            </button>
            <ExportButton
              rows={rules as unknown as Record<string, unknown>[]}
              filename="rules.csv"
              className="font-body-sm text-on-surface-variant hover:text-on-surface px-sm py-xxs rounded-md flex items-center gap-xxs disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export
            </ExportButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="font-label-uppercase text-on-surface-variant">
                <th className="px-lg py-sm">Rule</th>
                <th className="px-lg py-sm">Trigger</th>
                <th className="px-lg py-sm">Action</th>
                <th className="px-lg py-sm">Weight</th>
                <th className="px-lg py-sm">Version</th>
                <th className="px-lg py-sm">Status</th>
                <th className="px-lg py-sm">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-t border-outline-variant hover:bg-surface-container-low/60 transition-colors"
                >
                  <td className="px-lg py-md">
                    <div className="font-body-md font-semibold text-on-surface flex items-center gap-xs">
                      {rule.name}
                      {rule.pending_count > 0 && (
                        <span className="inline-flex items-center px-xs rounded-full font-label-uppercase bg-secondary-container text-on-secondary-container">
                          {rule.pending_count} pending
                        </span>
                      )}
                    </div>
                    <div className="font-body-sm text-on-surface-variant max-w-md">
                      {rule.description ?? "—"}
                    </div>
                  </td>
                  <td className="px-lg py-md font-mono-data text-on-surface-variant max-w-xs">
                    {describeCondition(rule.condition) || "—"}
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant max-w-xs">
                    {rule.action_type}
                  </td>
                  <td className="px-lg py-md font-mono-data text-on-surface-variant">
                    {rule.weight ?? "—"}
                  </td>
                  <td className="px-lg py-md font-mono-data text-on-surface-variant">
                    v{rule.version}
                  </td>
                  <td className="px-lg py-md">
                    <span
                      className={`inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase ${
                        rule.active ? STATUS_STYLES.Active : STATUS_STYLES.Paused
                      }`}
                    >
                      {rule.active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant">
                    {formatRelative(rule.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: string;
  tone?: "primary" | "tertiary" | "secondary" | "error";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary-container/60 text-on-primary-container",
    tertiary: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
    secondary: "bg-secondary-container text-on-secondary-container",
    error: "bg-error-container text-on-error-container",
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md flex items-center gap-md">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </div>
      <div>
        <div className="font-label-uppercase text-on-surface-variant tracking-widest">
          {label}
        </div>
        <div className="font-headline-md text-on-surface">{value}</div>
      </div>
    </div>
  );
}
