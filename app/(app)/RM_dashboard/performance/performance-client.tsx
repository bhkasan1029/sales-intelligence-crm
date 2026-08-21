"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { TIMEFRAMES, type Insight, type Timeframe } from "@/lib/performance";
import type { PerformanceSnapshot } from "@/lib/queries/performance";
import TrajectoryChart from "./trajectory-chart";
import BenchmarkRadar from "./benchmark-radar";

/**
 * Performance Reflection.
 *
 * The server renders the first snapshot; from then on this component owns the
 * data. Changing the timeframe refetches everything at once rather than
 * recomputing panels locally, so the chart, the radar, the insight and the
 * tiles always describe the same window and the same moment.
 */

const POLL_MS = 60_000;

/**
 * The chosen timeframe is remembered in a cookie rather than localStorage so
 * the *server* can read it too — page.tsx renders the remembered window on the
 * first paint, which is why nothing here has to correct itself after hydration.
 */
const TIMEFRAME_COOKIE = "rm_timeframe";
const ONE_YEAR = 60 * 60 * 24 * 365;

function rememberTimeframe(tf: Timeframe) {
  document.cookie = `${TIMEFRAME_COOKIE}=${tf}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export default function PerformanceClient({ initial }: { initial: PerformanceSnapshot }) {
  const [data, setData] = useState(initial);
  const [timeframe, setTimeframe] = useState<Timeframe>(initial.timeframe);
  const [failed, setFailed] = useState(false);

  // No separate loading flag: the snapshot on screen names its own timeframe,
  // so "still fetching" is simply the two disagreeing.
  const pending = !failed && data.timeframe !== timeframe;

  // Guards against a slow earlier request landing on top of a newer one when
  // the toggle is clicked twice in quick succession.
  const request = useRef(0);

  const load = useCallback(async (tf: Timeframe) => {
    const token = ++request.current;
    try {
      const res = await fetch(`/api/rm/performance?timeframe=${tf}`, { cache: "no-store" });
      if (token !== request.current) return;
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setData((await res.json()) as PerformanceSnapshot);
      setFailed(false);
    } catch {
      if (token === request.current) setFailed(true);
    }
  }, []);

  const choose = (tf: Timeframe) => {
    if (tf === timeframe) return;
    setTimeframe(tf);
    rememberTimeframe(tf);
    void load(tf);
  };

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load(timeframe);
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load, timeframe]);

  const { pacing, benchmark, tiles, window: win } = data;
  const ahead = pacing.pace_delta_pts >= 0;
  const hasTarget = pacing.target_value > 0;

  return (
    <div className="relative flex w-full flex-col">
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-[420px] w-1/3 rounded-full bg-primary/5 blur-[120px]" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-lg p-lg">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
          <div className="flex flex-col gap-xxs">
            <span className="font-label-uppercase tracking-[0.1em] text-tertiary-container">
              {data.identity.employee_ref} • {data.identity.name}
            </span>
            <h1 className="font-display-lg text-on-surface">Performance Reflection</h1>
            <p className="max-w-xl font-body-md text-on-surface-variant">
              Your pacing against target, how you compare with your branch, and
              what to do about the gap — for {win.label}.
            </p>
          </div>

          <div className="flex flex-col items-start gap-xxs md:items-end">
            <div
              role="group"
              aria-label="Timeframe"
              className="flex w-max rounded-full bg-surface-container-high p-[2px] shadow-sm"
            >
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => choose(t.key)}
                  aria-pressed={timeframe === t.key}
                  className={cn(
                    "rounded-full px-md py-xs font-label-uppercase transition-all",
                    timeframe === t.key
                      ? "bg-surface text-on-surface shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {failed && (
              <button
                onClick={() => void load(timeframe)}
                className="inline-flex items-center gap-xxs font-body-sm text-error hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Couldn&apos;t refresh — showing {win.label}. Retry
              </button>
            )}
          </div>
        </div>

        {/* ── Bento: chart + benchmark ────────────────────────────────────── */}
        <div
          className={cn(
            "grid w-full grid-cols-1 gap-gutter transition-opacity md:grid-cols-12",
            pending && "opacity-60"
          )}
          aria-busy={pending}
        >
          {/* Trajectory pacing */}
          <section className="flex flex-col gap-md rounded-xl bg-surface-container-lowest p-lg shadow-sm md:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div className="flex flex-col gap-base">
                <h2 className="font-headline-sm text-on-surface">Trajectory Pacing</h2>
                <p className="font-body-sm text-on-surface-variant">
                  Credited value against the expected run-rate
                </p>
              </div>
              <div className="flex gap-sm">
                <span className="flex items-center gap-xxs">
                  <span className="h-3 w-3 rounded-full bg-primary" />
                  <span className="font-label-uppercase text-on-surface-variant">Actual</span>
                </span>
                <span className="flex items-center gap-xxs">
                  <span className="h-0 w-3.5 border-t-2 border-dashed border-outline" />
                  <span className="font-label-uppercase text-on-surface-variant">Target</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-sm gap-y-xxs">
              <span className="font-headline-md text-on-surface">
                {formatINR(pacing.achieved_value)}
              </span>
              {/* No target row means there is no run-rate to be measured
                  against; "0.0 pts ahead" would read as a result. */}
              {hasTarget ? (
                <>
                  <span className="font-body-md text-on-surface-variant">
                    of {formatINR(pacing.target_value)} · {pacing.achieved_pct.toFixed(0)}%
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-xxs rounded-full px-xs py-xxs font-mono-data",
                      ahead
                        ? "bg-tertiary-container/15 text-tertiary"
                        : "bg-error-container text-on-error-container"
                    )}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {ahead ? "trending_up" : "trending_down"}
                    </span>
                    {Math.abs(pacing.pace_delta_pts).toFixed(1)} pts{" "}
                    {ahead ? "ahead of" : "behind"} run-rate
                  </span>
                </>
              ) : (
                <span className="rounded-full bg-surface-container-high px-xs py-xxs font-mono-data text-on-surface-variant">
                  No target set for this {win.noun}
                </span>
              )}
              {pacing.prev_delta_pct !== null && (
                <span className="font-mono-data text-on-surface-variant">
                  {pacing.prev_delta_pct >= 0 ? "+" : "−"}
                  {Math.abs(pacing.prev_delta_pct).toFixed(1)}% vs {win.prev_label} to date
                </span>
              )}
            </div>

            <TrajectoryChart
              pacing={pacing}
              timeframe={data.timeframe}
              windowLabel={win.label}
            />
          </section>

          {/* Benchmark + insight */}
          <div className="flex flex-col gap-gutter md:col-span-4">
            <section className="flex flex-1 flex-col gap-sm rounded-xl bg-surface-container-lowest p-lg shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-on-surface">Peer Benchmark</h2>
                <span
                  className="material-symbols-outlined text-[20px] text-on-surface-variant"
                  title={
                    benchmark.peer_count > 0
                      ? `Compared with ${benchmark.peer_count} other RM${
                          benchmark.peer_count === 1 ? "" : "s"
                        } in ${benchmark.peer_label}`
                      : "No branch peers on file"
                  }
                >
                  radar
                </span>
              </div>
              <BenchmarkRadar
                axes={benchmark.axes}
                peerCount={benchmark.peer_count}
                peerLabel={benchmark.peer_count > 0 ? "Branch" : ""}
              />
            </section>

            <InsightPanel insight={data.insight} />
          </div>
        </div>

        {/* ── Tiles ───────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "grid w-full grid-cols-1 gap-gutter transition-opacity sm:grid-cols-3",
            pending && "opacity-60"
          )}
        >
          <Link
            href="/RM_dashboard?risk=1"
            className={cn(
              "flex flex-col justify-between gap-sm rounded-xl border-l-4 bg-surface-container-lowest p-md shadow-sm transition-transform hover:-translate-y-1",
              tiles.overdue.count > 0 ? "border-error" : "border-tertiary"
            )}
          >
            <div className="flex items-start justify-between">
              <span className="font-label-uppercase text-on-surface-variant">Overdue SLAs</span>
              <span
                className={cn(
                  "material-symbols-outlined text-[20px]",
                  tiles.overdue.count > 0 ? "text-error" : "text-tertiary"
                )}
              >
                {tiles.overdue.count > 0 ? "warning" : "task_alt"}
              </span>
            </div>
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-surface">{tiles.overdue.count}</span>
              {tiles.overdue.count > 0 ? (
                <span className="rounded-sm bg-error-container px-2 py-0.5 font-mono-data text-error">
                  Requires action
                </span>
              ) : (
                <span className="font-mono-data text-tertiary">Nothing past deadline</span>
              )}
            </div>
            <span className="font-body-sm text-on-surface-variant">
              of {tiles.overdue.open_total} open action
              {tiles.overdue.open_total === 1 ? "" : "s"} · skipped ones still count
            </span>
          </Link>

          <div className="flex flex-col justify-between gap-sm rounded-xl bg-surface-container-lowest p-md shadow-sm">
            <div className="flex items-start justify-between">
              <span className="font-label-uppercase text-on-surface-variant">
                Total Activities
              </span>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                list_alt
              </span>
            </div>
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-surface">{tiles.activities.count}</span>
              <span
                className={cn(
                  "font-mono-data",
                  tiles.activities.delta >= 0 ? "text-tertiary" : "text-error"
                )}
              >
                {tiles.activities.delta >= 0 ? "+" : "−"}
                {Math.abs(tiles.activities.delta)} vs {win.prev_label}
              </span>
            </div>
            <span className="font-body-sm text-on-surface-variant">
              Calls, meetings and pay-ins logged this {win.noun}
            </span>
          </div>

          <div className="flex flex-col justify-between gap-sm rounded-xl bg-surface-container-lowest p-md shadow-sm">
            <div className="flex items-start justify-between">
              <span className="font-label-uppercase text-on-surface-variant">
                Calls to Meeting Ratio
              </span>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                record_voice_over
              </span>
            </div>
            <div className="flex w-full flex-col gap-xs">
              <div className="flex items-baseline gap-xs">
                {/* No calls logged is an undefined ratio, not a zero — it must
                    not be drawn or ranked as one. */}
                {tiles.call_to_meeting.ratio_pct === null ? (
                  <span className="font-headline-md text-on-surface-variant">n/a</span>
                ) : (
                  <span className="font-display-lg text-on-surface">
                    {tiles.call_to_meeting.ratio_pct.toFixed(0)}%
                  </span>
                )}
                <span
                  className={cn(
                    "font-mono-data",
                    tiles.call_to_meeting.quartile.rank == null
                      ? "text-on-surface-variant"
                      : tiles.call_to_meeting.quartile.rank <= 2
                        ? "text-tertiary"
                        : "text-error"
                  )}
                >
                  {tiles.call_to_meeting.quartile.label}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, tiles.call_to_meeting.ratio_pct ?? 0))}%`,
                  }}
                />
              </div>
              <span className="font-body-sm text-on-surface-variant">
                {tiles.call_to_meeting.calls === 0
                  ? `No calls logged this ${win.noun}`
                  : `${tiles.call_to_meeting.meetings} meeting${
                      tiles.call_to_meeting.meetings === 1 ? "" : "s"
                    } from ${tiles.call_to_meeting.calls} call${
                      tiles.call_to_meeting.calls === 1 ? "" : "s"
                    }`}
                {tiles.call_to_meeting.peer_median !== null &&
                  ` · branch median ${tiles.call_to_meeting.peer_median.toFixed(0)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The written read-out. Every figure in it comes from the same snapshot the
 * charts above are drawn from, so it cannot say something they contradict.
 */
function InsightPanel({ insight }: { insight: Insight }) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-tertiary-container p-md text-on-tertiary-container shadow-sm">
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-on-tertiary-container/10 blur-2xl" />
      <div className="relative z-10 flex items-start gap-sm">
        <span className="material-symbols-outlined mt-1 text-tertiary-fixed">
          {insight.tone === "positive" ? "lightbulb" : "flag"}
        </span>
        <div className="flex flex-col gap-xs">
          <h3 className="font-label-uppercase text-tertiary-fixed">Insight</h3>
          <p className="font-body-md leading-relaxed">
            {insight.parts.map((part, i) =>
              part.strong ? (
                <strong key={i} className="font-bold text-white">
                  {part.text}
                </strong>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
