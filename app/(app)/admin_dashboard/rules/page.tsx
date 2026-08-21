import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import ExportButton from "@/components/export-button";

type DummyRule = {
  id: string;
  name: string;
  description: string;
  scope: "Global" | "Region" | "Branch";
  trigger: string;
  action: string;
  status: "Active" | "Draft" | "Paused";
  updated: string;
};

const RULES: DummyRule[] = [
  {
    id: "R-001",
    name: "Large Deposit Surge",
    description: "Escalate accounts with deposits > ₹10L in a rolling 24h window.",
    scope: "Global",
    trigger: "deposit.amount > 1,000,000 AND window = 24h",
    action: "Rank task priority: URGENT + notify RM",
    status: "Active",
    updated: "2 hrs ago",
  },
  {
    id: "R-002",
    name: "Dormant High-Value Wake-Up",
    description: "Detect logins after 60+ days of dormancy on premium accounts.",
    scope: "Region",
    trigger: "last_login_gap > 60d AND segment = 'premium'",
    action: "Queue outreach task + assign to owning RM",
    status: "Active",
    updated: "Yesterday",
  },
  {
    id: "R-003",
    name: "Cross-Sell Signal — Mortgage",
    description: "Home-related digital activity spikes on liability customers.",
    scope: "Branch",
    trigger: "search.category IN ('home_loan') AND has_liability = true",
    action: "Insert lead in RM pipeline + score = 82",
    status: "Draft",
    updated: "3 days ago",
  },
  {
    id: "R-004",
    name: "Anti-Attrition Watch",
    description: "Combination of outbound transfers + drop in balance velocity.",
    scope: "Global",
    trigger: "outbound_transfer_ratio > 0.6 AND balance_velocity Δ < -20%",
    action: "Flag account + escalate to BM review",
    status: "Paused",
    updated: "Last week",
  },
];

const STATUS_STYLES: Record<DummyRule["status"], string> = {
  Active: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
  Draft: "bg-secondary-container text-on-secondary-container",
  Paused: "bg-error-container text-on-error-container",
};

export default async function AdminRulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(ROLE_HOME[session.role]);

  const active = RULES.filter((r) => r.status === "Active").length;
  const drafts = RULES.filter((r) => r.status === "Draft").length;
  const paused = RULES.filter((r) => r.status === "Paused").length;

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
        <SummaryCard label="Total Rules" value={RULES.length} icon="rule" />
        <SummaryCard label="Active" value={active} icon="check_circle" tone="tertiary" />
        <SummaryCard label="Drafts" value={drafts} icon="edit_note" tone="secondary" />
        <SummaryCard label="Paused" value={paused} icon="pause_circle" tone="error" />
      </div>

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
              rows={RULES as unknown as Record<string, unknown>[]}
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
                <th className="px-lg py-sm">ID</th>
                <th className="px-lg py-sm">Rule</th>
                <th className="px-lg py-sm">Scope</th>
                <th className="px-lg py-sm">Trigger</th>
                <th className="px-lg py-sm">Action</th>
                <th className="px-lg py-sm">Status</th>
                <th className="px-lg py-sm">Updated</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-t border-outline-variant hover:bg-surface-container-low/60 transition-colors"
                >
                  <td className="px-lg py-md font-mono-data text-on-surface-variant">
                    {rule.id}
                  </td>
                  <td className="px-lg py-md">
                    <div className="font-body-md font-semibold text-on-surface">
                      {rule.name}
                    </div>
                    <div className="font-body-sm text-on-surface-variant max-w-md">
                      {rule.description}
                    </div>
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant">
                    {rule.scope}
                  </td>
                  <td className="px-lg py-md font-mono-data text-on-surface-variant max-w-xs">
                    {rule.trigger}
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant max-w-xs">
                    {rule.action}
                  </td>
                  <td className="px-lg py-md">
                    <span
                      className={`inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase ${STATUS_STYLES[rule.status]}`}
                    >
                      {rule.status}
                    </span>
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant">
                    {rule.updated}
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
