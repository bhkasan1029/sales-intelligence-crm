"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import {
  RANK_MODES,
  rankQueue,
  urgencyOf,
  type Opportunity,
  type RankMode,
} from "@/lib/opportunity";
import type { RmDashboard } from "@/lib/queries/rm";
import OpportunityCard from "./opportunity-card";
import EngageDialog, { type Outcome } from "./engage-dialog";
import ReviewDrawer from "./review-drawer";

/**
 * The RM dashboard board: three KPI tiles over the prioritised action queue.
 *
 * The server renders the first snapshot; from then on this component owns the
 * data. It re-polls /api/rm/dashboard every 20s while the tab is visible and
 * immediately after any mutation, and ticks a shared `now` once a second so
 * every countdown, tag and progress bar stays in step without its own timer.
 */

const POLL_MS = 20_000;

/* The chosen ranking lives in localStorage, read through useSyncExternalStore
 * so the server and the first client render agree on the default. */
const RANK_STORAGE_KEY = "rm-dashboard-rank";
const rankListeners = new Set<() => void>();

function subscribeRank(onChange: () => void) {
  rankListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    rankListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRank(): RankMode {
  try {
    const saved = window.localStorage.getItem(RANK_STORAGE_KEY) as RankMode | null;
    if (saved && RANK_MODES.some((m) => m.key === saved)) return saved;
  } catch {
    // Private-mode browsers throw on access; the default is fine.
  }
  return "model_alpha";
}

function writeRank(mode: RankMode) {
  try {
    window.localStorage.setItem(RANK_STORAGE_KEY, mode);
  } catch {
    // Not persisting is survivable; the listeners below still update the view.
  }
  rankListeners.forEach((l) => l());
}

export default function DashboardClient({ initial }: { initial: RmDashboard }) {
  const [data, setData] = useState<RmDashboard>(initial);
  // Seeded from the server's clock so the first client render matches the HTML.
  const [now, setNow] = useState(() => new Date(initial.now).getTime());
  const rank = useSyncExternalStore(subscribeRank, readRank, () => "model_alpha" as RankMode);
  const [rankOpen, setRankOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [engaging, setEngaging] = useState<Opportunity | null>(null);
  const [reviewing, setReviewing] = useState<Opportunity | null>(null);

  // Deep links stay in the URL rather than being copied into state, so the
  // back button and a shared link behave the same way.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focusParam = searchParams.get("focus");
  const reviewCustomer = searchParams.get("customer");
  const riskParam = searchParams.get("risk");
  const rankRef = useRef<HTMLDivElement>(null);

  // Arrived from the Performance page's overdue tile? Open with the filter on.
  const [atRiskOnly, setAtRiskOnly] = useState(riskParam === "1");

  /* ── clock ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const chooseRank = (mode: RankMode) => {
    writeRank(mode);
    setRankOpen(false);
  };

  useEffect(() => {
    if (!rankOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!rankRef.current?.contains(e.target as Node)) setRankOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [rankOpen]);

  /* ── data ──────────────────────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    const res = await fetch("/api/rm/dashboard", { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as RmDashboard;
    setData(next);
    // Keep whatever drawer is open pointed at the fresh row.
    setReviewing((cur) => (cur ? (next.queue.find((o) => o.id === cur.id) ?? null) : null));
    setEngaging((cur) => (cur ? (next.queue.find((o) => o.id === cur.id) ?? null) : null));
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  /* ── deep links from omni-search ───────────────────────────────────────── */
  // ?focus=<action id> scrolls to the card and rings it; the ring clears by
  // dropping the parameter again rather than by holding a second copy in state.
  useEffect(() => {
    if (!focusParam) return;
    document
      .getElementById(`opp-${focusParam}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => router.replace(pathname), 4000);
    return () => clearTimeout(t);
  }, [focusParam, data.queue, router, pathname]);

  // ?risk=1 — how the Performance page's "Overdue SLAs" tile hands over. The
  // filter starts armed (see useState above) and the parameter is dropped here,
  // so from that point the toggle belongs to the RM again.
  useEffect(() => {
    if (riskParam !== "1") return;
    router.replace(pathname);
  }, [riskParam, router, pathname]);

  /* ── mutations ─────────────────────────────────────────────────────────── */
  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setBusy(id);
      try {
        const res = await fetch(`/api/actions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.error ?? "That didn't go through");
          return null;
        }
        await refresh();
        return json;
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  const onSkip = async (opp: Opportunity) => {
    const done = await patch(opp.id, { op: "skip", hours: 4 });
    if (!done) return;
    setReviewing(null);
    toast.success(`#${opp.ref} skipped for 4 hours`, {
      description: "The SLA clock keeps running.",
      action: {
        label: "Undo",
        onClick: () => void patch(opp.id, { op: "unskip" }),
      },
    });
  };

  const onComplete = async (opp: Opportunity, outcome: Outcome, note: string) => {
    const done = await patch(opp.id, { op: "complete", outcome, note });
    if (!done) return;
    setEngaging(null);
    setReviewing(null);
    const credited = Number(done.converted_value ?? 0);
    toast.success(
      outcome === "converted" && credited > 0
        ? `Converted — ${formatINR(credited)} credited to this period`
        : `#${opp.ref} closed as ${outcome.replace(/_/g, " ")}`
    );
  };

  const onDefer = async (opp: Opportunity, hours: number) => {
    const when = new Date(Date.now() + hours * 3_600_000).toISOString();
    const done = await patch(opp.id, { op: "reschedule", when });
    if (!done) return;
    setEngaging(null);
    toast.success(`#${opp.ref} deferred — new deadline in ${hours}h`);
  };

  /* ── derived ───────────────────────────────────────────────────────────── */
  const queue = useMemo(() => {
    const ranked = rankQueue(data.queue, rank);
    if (!atRiskOnly) return ranked;
    return ranked.filter((o) => {
      const u = urgencyOf(o.deadline, now);
      return u === "critical" || u === "breached";
    });
  }, [data.queue, rank, atRiskOnly, now]);

  const rankLabel = RANK_MODES.find((m) => m.key === rank)?.label ?? "Model Alpha (Live)";

  return (
    <div className="relative flex w-full flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-surface to-surface-variant" />
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-[400px] w-1/3 rounded-full bg-primary/5 blur-[120px]" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-lg p-lg">
        {/* ── KPI tiles ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-sm md:grid-cols-4">
          <QuotaTile quota={data.quota} />
          <SlaTile
            sla={data.sla}
            active={atRiskOnly}
            onToggle={() => setAtRiskOnly((v) => !v)}
          />
          <ConversionTile conversion={data.conversion} />
        </div>

        {/* ── Queue header ──────────────────────────────────────────────── */}
        <div className="mt-sm flex flex-wrap items-center justify-between gap-sm">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">priority_high</span>
            <h2 className="font-headline-md text-on-surface">Prioritized Action Queue</h2>
            <span className="rounded-full bg-surface-container-high px-xs py-xxs font-mono-data text-on-surface-variant">
              {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-xs">
            {atRiskOnly && (
              <button
                onClick={() => setAtRiskOnly(false)}
                className="inline-flex items-center gap-xxs rounded-lg bg-error-container px-sm py-xs font-body-sm text-on-error-container"
              >
                SLA risk only
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
            <span className="font-label-uppercase text-on-surface-variant">Ranked by:</span>
            <div className="relative" ref={rankRef}>
              <button
                onClick={() => setRankOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={rankOpen}
                className="flex items-center gap-xxs rounded-lg bg-surface-container-highest px-sm py-xs font-body-sm text-on-surface transition-colors hover:bg-surface-variant"
              >
                {rankLabel}
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
              {rankOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 top-[110%] z-50 w-64 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-xl"
                >
                  {RANK_MODES.map((m) => (
                    <li key={m.key}>
                      <button
                        role="option"
                        aria-selected={m.key === rank}
                        onClick={() => chooseRank(m.key)}
                        className={cn(
                          "flex w-full flex-col items-start px-sm py-xs text-left transition-colors hover:bg-surface-container-high",
                          m.key === rank && "bg-primary-container/10"
                        )}
                      >
                        <span
                          className={cn(
                            "font-body-sm text-on-surface",
                            m.key === rank && "font-bold text-primary"
                          )}
                        >
                          {m.label}
                        </span>
                        <span className="font-body-sm text-on-surface-variant">{m.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── Cards ─────────────────────────────────────────────────────── */}
        {queue.length === 0 ? (
          <EmptyQueue atRiskOnly={atRiskOnly} onClear={() => setAtRiskOnly(false)} />
        ) : (
          <div className="grid grid-cols-1 gap-sm lg:grid-cols-3">
            {queue.map((opp, i) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                now={now}
                focus={i === 0}
                highlighted={focusParam === opp.id}
                busy={busy === opp.id}
                onEngage={() => setEngaging(opp)}
                onReview={() => setReviewing(opp)}
                onSkip={() => void onSkip(opp)}
              />
            ))}
          </div>
        )}
      </div>

      {engaging && (
        <EngageDialog
          opp={engaging}
          busy={busy === engaging.id}
          onClose={() => setEngaging(null)}
          onComplete={(outcome, note) => void onComplete(engaging, outcome, note)}
          onDefer={(hours) => void onDefer(engaging, hours)}
        />
      )}

      {(reviewing || reviewCustomer) && (
        <ReviewDrawer
          key={reviewing?.customer_id ?? reviewCustomer ?? reviewing?.id}
          opp={reviewing}
          customerId={reviewCustomer}
          now={now}
          busy={busy === reviewing?.id}
          onClose={() => {
            setReviewing(null);
            if (reviewCustomer) router.replace(pathname);
          }}
          onEngage={() => {
            if (reviewing) {
              setEngaging(reviewing);
              setReviewing(null);
            }
          }}
          onSkip={() => reviewing && void onSkip(reviewing)}
        />
      )}
    </div>
  );
}

/* ── Tiles ────────────────────────────────────────────────────────────────── */

function QuotaTile({ quota }: { quota: RmDashboard["quota"] }) {
  const statusLabel =
    quota.status === "ahead" ? "Ahead" : quota.status === "on_track" ? "On track" : "Lagging";
  const statusDot =
    quota.status === "lagging" ? "bg-error" : quota.status === "ahead" ? "bg-tertiary" : "bg-primary";

  return (
    <div className="col-span-1 flex flex-col justify-between rounded-xl bg-surface-container-lowest p-md shadow-sm md:col-span-2">
      <div className="mb-sm flex items-center justify-between">
        <span className="font-label-uppercase tracking-wider text-on-surface-variant">
          {quota.label}
        </span>
        <span className="font-body-sm font-bold text-on-surface">
          {Math.round(quota.achieved_pct)}%
        </span>
      </div>
      <div className="mb-xs h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="relative h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, quota.achieved_pct)}%` }}
        >
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>
      </div>
      <div className="flex items-center justify-between font-body-sm">
        <span className="font-mono-data text-on-surface-variant">
          {formatINR(quota.achieved_value)} / {formatINR(quota.target_value)}
        </span>
        <span className="flex items-center gap-base font-mono-data text-on-surface-variant">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
          {statusLabel} (Exp: {Math.round(quota.expected_pct)}%)
        </span>
      </div>
    </div>
  );
}

function SlaTile({
  sla,
  active,
  onToggle,
}: {
  sla: RmDashboard["sla"];
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      title="Show only what is at risk"
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-md text-left shadow-sm transition-all hover:shadow-md",
        active && "ring-2 ring-error"
      )}
    >
      <div className="absolute right-0 top-0 p-xs text-error/10 transition-colors group-hover:text-error/20">
        <span className="material-symbols-outlined !text-[48px]">warning</span>
      </div>
      <span className="relative z-10 font-label-uppercase tracking-wider text-on-surface-variant">
        SLA Risk
      </span>
      <div className="relative z-10 flex items-end gap-sm">
        <span className="font-display-lg text-error">{sla.at_risk}</span>
        <span className="pb-base font-body-sm text-on-surface-variant">
          deals &lt; {sla.window_minutes}m
        </span>
      </div>
      <span className="relative z-10 font-body-sm text-on-surface-variant">
        {sla.breached > 0 ? `${sla.breached} already breached` : "Nothing breached"}
      </span>
    </button>
  );
}

function ConversionTile({ conversion }: { conversion: RmDashboard["conversion"] }) {
  const delta = conversion.delta_pts;
  const up = (delta ?? 0) >= 0;
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-md shadow-sm">
      <span className="font-label-uppercase tracking-wider text-on-surface-variant">
        Conv. Rate
      </span>
      <div className="flex items-center gap-sm">
        <span className="font-display-lg text-on-surface">
          {conversion.rate_pct.toFixed(1)}%
        </span>
        {delta !== null && (
          <div
            className={cn(
              "flex items-center rounded-full px-xs py-xxs font-mono-data",
              up ? "bg-tertiary-container/20 text-tertiary" : "bg-error-container text-on-error-container"
            )}
          >
            <span className="material-symbols-outlined text-[14px]">
              {up ? "arrow_upward" : "arrow_downward"}
            </span>
            <span>{Math.abs(delta).toFixed(1)}</span>
          </div>
        )}
      </div>
      <span className="font-body-sm text-on-surface-variant">
        {conversion.converted}/{conversion.assigned} leads · {conversion.window_days}d
      </span>
    </div>
  );
}

function EmptyQueue({ atRiskOnly, onClear }: { atRiskOnly: boolean; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-lg py-xl text-center">
      <span className="material-symbols-outlined text-[40px] text-tertiary">task_alt</span>
      <p className="mt-xs font-headline-sm text-on-surface">
        {atRiskOnly ? "Nothing at risk right now" : "Queue clear"}
      </p>
      <p className="font-body-md text-on-surface-variant">
        {atRiskOnly
          ? "No deal is inside its SLA window."
          : "Every action assigned to you has been handled or skipped."}
      </p>
      {atRiskOnly && (
        <button
          onClick={onClear}
          className="mt-sm rounded-lg bg-surface-container-highest px-md py-xs font-body-sm font-bold text-on-surface hover:bg-surface-variant"
        >
          Show the whole queue
        </button>
      )}
    </div>
  );
}
