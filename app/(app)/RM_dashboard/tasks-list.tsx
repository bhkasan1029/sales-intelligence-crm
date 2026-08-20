"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Phone, Check, Clock, CalendarClock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type Action = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  customer_segment: string | null;
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

function priorityTone(score: number) {
  if (score >= 70) return { label: "High", cls: "bg-red-50 text-red-700 border-red-200" };
  if (score >= 40) return { label: "Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Low", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function humanType(type: string) {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TasksList() {
  const [actions, setActions] = useState<Action[]>([]);
  const [stats, setStats] = useState<Stats>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const [aRes, sRes] = await Promise.all([
      fetch("/api/actions"),
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

  const onComplete = (id: string) => patch(id, { op: "complete" }, "Marked complete");
  const onSnooze = (id: string, hours: number) =>
    patch(id, { op: "snooze", hours }, `Snoozed for ${hours}h`);
  const onReschedule = (id: string, when: string) => {
    if (!when) return;
    patch(id, { op: "reschedule", when: new Date(when).toISOString() }, "Rescheduled");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Open" value={stats.actions.open_count} />
          <StatCard label="Snoozed" value={stats.actions.snoozed_count} />
          <StatCard label="Closed today" value={stats.actions.closed_today} />
          <StatCard label="Avg priority" value={stats.actions.avg_priority} />
        </div>
      )}

      {/* Task list */}
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-gray-500">
            No open tasks. If you just signed up as a fresh user, run{" "}
            <code className="font-mono text-xs">npx tsx scripts/seed.ts</code> and log in as{" "}
            <code className="font-mono text-xs">rm1@demo.com / demo123</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => {
            const tone = priorityTone(Number(a.priority_score));
            const isOpen = expanded === a.id;
            const isBusy = busy === a.id;
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="w-full p-5 text-left hover:bg-gray-50 transition-colors flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${tone.cls}`}>
                        {tone.label}
                      </span>
                      <span className="text-xs text-gray-500">{humanType(a.type)}</span>
                      {a.customer_segment && (
                        <span className="text-xs text-gray-400">· {a.customer_segment}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      {a.customer_name ?? "(no customer)"} — {a.message}
                    </p>
                    {a.reason && (
                      <p className="text-xs text-gray-500 mt-1">{a.reason}</p>
                    )}
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-5 space-y-4">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <dt className="text-gray-500">Priority score</dt>
                        <dd className="text-[#1A1A1A] font-medium">{a.priority_score}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Status</dt>
                        <dd className="text-[#1A1A1A] font-medium">{a.status}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Created</dt>
                        <dd className="text-[#1A1A1A] font-medium">
                          {new Date(a.created_at).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Deadline</dt>
                        <dd className="text-[#1A1A1A] font-medium">
                          {a.sla_deadline
                            ? new Date(a.sla_deadline).toLocaleString()
                            : "—"}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      {a.customer_mobile && (
                        <a
                          href={`tel:${a.customer_mobile}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-gray-300 transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => onComplete(a.id)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Mark complete
                      </Button>

                      <div className="relative inline-block">
                        <select
                          disabled={isBusy}
                          defaultValue=""
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0) onSnooze(a.id, v);
                            e.target.value = "";
                          }}
                          className="appearance-none bg-white border border-gray-200 rounded-md px-3 py-1.5 pl-8 text-sm hover:border-gray-300 cursor-pointer disabled:opacity-50"
                        >
                          <option value="">Snooze…</option>
                          <option value="1">1 hour</option>
                          <option value="4">4 hours</option>
                          <option value="24">1 day</option>
                          <option value="72">3 days</option>
                        </select>
                        <Clock className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>

                      <label className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm hover:border-gray-300 cursor-pointer">
                        <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm">Reschedule</span>
                        <input
                          type="datetime-local"
                          disabled={isBusy}
                          onChange={(e) => onReschedule(a.id, e.target.value)}
                          className="text-xs bg-transparent border-none focus:outline-none w-40"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}
