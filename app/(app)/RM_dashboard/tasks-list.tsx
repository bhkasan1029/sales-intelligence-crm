"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatINR, formatRelative, humanise } from "@/lib/format";

type Action = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
  customer_segment: string | null;
  customer_stage: string | null;
  customer_potential_value: string | number | null;
  type: string;
  message: string;
  reason: string | null;
  priority_score: number;
  status: string;
  sla_deadline: string | null;
  created_at: string;
};

type Stats = {
  actions: {
    open_count: number;
    snoozed_count: number;
    closed_today: number;
    avg_priority: number;
  };
} | null;

/**
 * Which controls a card offers is driven by the action's type, because the
 * engine emits three genuinely different kinds of work:
 *
 *   outreach    — there's a customer to contact. Call/email, then close with
 *                 an outcome so ruleEffectiveness() can attribute conversions.
 *   review      — RM-level analysis (target gap, thin pipeline). Nobody to
 *                 call; it gets worked and closed.
 *   recognition — a win being surfaced. Nothing to do but acknowledge it, so
 *                 snooze/reschedule would be meaningless.
 *
 * Keys mirror REGISTRY in lib/rules-engine.ts. Anything unmapped falls back to
 * "review", which is the conservative option — it never invents a phone button.
 */
const KIND_BY_TYPE: Record<string, "outreach" | "review" | "recognition"> = {
  follow_up_breach: "outreach",
  stale_pipeline: "outreach",
  opportunity_at_risk: "outreach",
  high_intent: "outreach",
  meeting_no_outcome: "outreach",
  dormant_reactivation: "outreach",
  cross_sell: "outreach",

  target_gap: "review",
  weak_pipeline: "review",
  overdue_backlog: "review",
  conversion_below_benchmark: "review",
  escalated_breach: "review",
  unactioned_high_value: "review",

  target_achievement: "recognition",
  early_achievement: "recognition",
  top_conversion: "recognition",
  major_win: "recognition",
  dormant_recovery: "recognition",
};

const OUTCOMES = [
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "no_answer", label: "No answer" },
  { value: "not_interested", label: "Not interested" },
  { value: "deferred", label: "Deferred" },
];

function priorityTone(score: number) {
  if (score >= 70) return { label: "High", cls: "bg-red-50 text-red-700 border-red-200" };
  if (score >= 40) return { label: "Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Low", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

/**
 * The stored status is only half the picture — an 'open' row with a future
 * deadline is scheduled, and one with a past deadline is overdue. `sort` puts
 * the cards that need attention first.
 */
function statusOf(a: Action, now: number) {
  const deadline = a.sla_deadline ? new Date(a.sla_deadline).getTime() : null;

  if (a.status === "done") {
    return { label: "Completed", icon: "task_alt", cls: "bg-gray-100 text-gray-600 border-gray-200", sort: 4 };
  }
  // On both snooze and reschedule the deadline doubles as the wake-up time, so
  // a future deadline is the thing that parks a card. Once it passes, the card
  // is live again regardless of which of the two put it to sleep.
  if (deadline && deadline > now) {
    return a.status === "snoozed"
      ? { label: "Snoozed", icon: "snooze", cls: "bg-violet-50 text-violet-700 border-violet-200", sort: 3 }
      : { label: "Scheduled", icon: "event", cls: "bg-blue-50 text-blue-700 border-blue-200", sort: 2 };
  }
  if (a.status === "snoozed") {
    return { label: "Due now", icon: "bolt", cls: "bg-amber-50 text-amber-700 border-amber-200", sort: 1 };
  }
  if (deadline && deadline < now) {
    return { label: "Overdue", icon: "warning", cls: "bg-red-50 text-red-700 border-red-200", sort: 0 };
  }
  return { label: "Due now", icon: "bolt", cls: "bg-amber-50 text-amber-700 border-amber-200", sort: 1 };
}

/** datetime-local wants 'YYYY-MM-DDTHH:mm' in local time, not an ISO string. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TasksList() {
  const [actions, setActions] = useState<Action[]>([]);
  const [stats, setStats] = useState<Stats>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [when, setWhen] = useState<Record<string, string>>({});

  const refresh = async () => {
    // includeSnoozed so snoozed and future-scheduled rows are visible too —
    // without it every card would read "Due now" and the status badge would be
    // decoration rather than information.
    const [aRes, sRes] = await Promise.all([
      fetch("/api/actions?includeSnoozed=true"),
      fetch("/api/me/stats"),
    ]);
    if (aRes.ok) setActions(await aRes.json());
    if (sRes.ok) setStats(await sRes.json());
  };

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  const patch = async (id: string, body: object, successMsg: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed");
        return;
      }
      toast.success(successMsg);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onComplete = (id: string, outcome?: string) =>
    patch(id, { op: "complete", outcome }, "Marked complete");
  const onSnooze = (id: string, hours: number) =>
    patch(id, { op: "snooze", hours }, `Snoozed for ${hours}h`);
  const onReschedule = (id: string) => {
    const value = when[id];
    if (!value) {
      toast.error("Pick a date and time first");
      return;
    }
    patch(id, { op: "reschedule", when: new Date(value).toISOString() }, "Rescheduled");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-gray-400">
          progress_activity
        </span>
      </div>
    );
  }

  const now = Date.now();
  const sorted = [...actions].sort((a, b) => {
    const diff = statusOf(a, now).sort - statusOf(b, now).sort;
    return diff !== 0 ? diff : Number(b.priority_score) - Number(a.priority_score);
  });

  return (
    <>
      {/* ── Task cards ───────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-gray-500">
            No tasks right now. If you just signed up as a fresh user, run{" "}
            <code className="font-mono text-xs">npx tsx scripts/seed.ts</code> and log in as{" "}
            <code className="font-mono text-xs">rm1@demo.com / demo123</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => {
            const tone = priorityTone(Number(a.priority_score));
            const status = statusOf(a, now);
            const kind = KIND_BY_TYPE[a.type] ?? "review";
            const isOpen = expanded === a.id;
            const isBusy = busy === a.id;
            const value = Number(a.customer_potential_value ?? 0);

            return (
              <div key={a.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${status.cls}`}
                      >
                        <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
                        {status.label}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${tone.cls}`}>
                        {tone.label}
                      </span>
                      <span className="text-xs text-gray-500">{humanise(a.type)}</span>
                      {a.customer_segment && (
                        <span className="text-xs text-gray-400">· {a.customer_segment}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      {a.customer_name ? `${a.customer_name} — ` : ""}
                      {a.message}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Raised {formatRelative(a.created_at)}
                      {a.sla_deadline &&
                        ` · ${status.label === "Overdue" ? "was due" : "due"} ${formatRelative(a.sla_deadline)}`}
                    </p>
                  </div>
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-gray-400">
                    {isOpen ? "expand_less" : "expand_more"}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-gray-100 bg-gray-50/50 p-5">
                    {/* Why this task exists — the engine's own reasoning */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Why this was flagged
                      </p>
                      <p className="text-sm text-gray-700">
                        {a.reason ?? "No reason recorded for this task."}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 pt-4 text-xs sm:grid-cols-4">
                      <Detail label="Status" value={status.label} />
                      <Detail label="Priority score" value={`${a.priority_score} / 100`} />
                      <Detail label="Raised" value={new Date(a.created_at).toLocaleString()} />
                      <Detail
                        label="Deadline"
                        value={a.sla_deadline ? new Date(a.sla_deadline).toLocaleString() : "—"}
                      />
                      {a.customer_name && (
                        <>
                          <Detail label="Customer" value={a.customer_name} />
                          <Detail label="Segment" value={a.customer_segment ?? "—"} />
                          <Detail
                            label="Stage"
                            value={a.customer_stage ? humanise(a.customer_stage) : "—"}
                          />
                          <Detail label="Potential value" value={value > 0 ? formatINR(value) : "—"} />
                        </>
                      )}
                    </dl>

                    {/* ── Controls, gated by task kind ───────────────────── */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
                      {kind === "outreach" && a.customer_mobile && (
                        <a
                          href={`tel:${a.customer_mobile}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-300"
                        >
                          <span className="material-symbols-outlined text-[16px]">call</span>
                          Call
                        </a>
                      )}
                      {kind === "outreach" && a.customer_email && (
                        <a
                          href={`mailto:${a.customer_email}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-300"
                        >
                          <span className="material-symbols-outlined text-[16px]">mail</span>
                          Email
                        </a>
                      )}

                      {kind === "recognition" ? (
                        <button
                          disabled={isBusy}
                          onClick={() => onComplete(a.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-300 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Acknowledge
                        </button>
                      ) : (
                        <>
                          {kind === "outreach" && (
                            // The outcome is what closes the loop: /api/actions/[id]
                            // writes it onto the ACTION_COMPLETED event, which is how
                            // ruleEffectiveness() tells a useful rule from a noisy one.
                            <select
                              disabled={isBusy}
                              value={outcomes[a.id] ?? "contacted"}
                              onChange={(e) =>
                                setOutcomes((o) => ({ ...o, [a.id]: e.target.value }))
                              }
                              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-gray-300 disabled:opacity-50"
                            >
                              {OUTCOMES.map((o) => (
                                <option key={o.value} value={o.value}>
                                  Outcome: {o.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            disabled={isBusy}
                            onClick={() =>
                              onComplete(
                                a.id,
                                kind === "outreach" ? (outcomes[a.id] ?? "contacted") : undefined
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-300 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            Mark complete
                          </button>

                          <div className="relative inline-block">
                            <select
                              disabled={isBusy}
                              defaultValue=""
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v > 0) onSnooze(a.id, v);
                                e.target.value = "";
                              }}
                              className="cursor-pointer appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm hover:border-gray-300 disabled:opacity-50"
                            >
                              <option value="">Snooze…</option>
                              <option value="1">1 hour</option>
                              <option value="4">4 hours</option>
                              <option value="24">1 day</option>
                              <option value="72">3 days</option>
                            </select>
                            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">
                              snooze
                            </span>
                          </div>

                          {/* Explicit "Set" rather than firing on change — a
                              datetime-local emits an event on every keystroke,
                              which would PATCH with half-typed dates. */}
                          <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5">
                            <span className="material-symbols-outlined text-[16px] text-gray-400">
                              event
                            </span>
                            <input
                              type="datetime-local"
                              disabled={isBusy}
                              min={toLocalInput(new Date())}
                              value={when[a.id] ?? ""}
                              onChange={(e) => setWhen((w) => ({ ...w, [a.id]: e.target.value }))}
                              className="w-44 border-none bg-transparent text-xs focus:outline-none"
                            />
                            <button
                              disabled={isBusy || !when[a.id]}
                              onClick={() => onReschedule(a.id)}
                              className="text-sm font-medium text-[#1A1A1A] disabled:opacity-40"
                            >
                              Set
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Open" value={stats.actions.open_count} />
          <StatCard label="Snoozed" value={stats.actions.snoozed_count} />
          <StatCard label="Closed today" value={stats.actions.closed_today} />
          <StatCard label="Avg priority" value={stats.actions.avg_priority} />
        </div>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#1A1A1A]">{value}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}
