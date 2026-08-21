"use client";

import { useMemo, useRef, useState } from "react";
import { formatINR } from "@/lib/format";
import type { Pacing, PacingPoint, Timeframe } from "@/lib/performance";

/**
 * Actual credited value against the expected run-rate, over the selected
 * window. Two series on one axis: a solid primary line for what happened and a
 * recessive dashed line for what was expected — never a second y-scale.
 *
 * The actual line stops at today; the target line runs to the end of the
 * window, so the gap on the right is the work still to do.
 */

const VIEW_W = 800;
const VIEW_H = 380;
const PAD = { top: 16, right: 14, bottom: 30, left: 64 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const GRID_LINES = 4;

type XY = { x: number; y: number };

export default function TrajectoryChart({
  pacing,
  timeframe,
  windowLabel,
}: {
  pacing: Pacing;
  timeframe: Timeframe;
  windowLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => build(pacing.points), [pacing.points]);
  const { points, xs, actual, target, yMax } = geometry;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i]! - x) < Math.abs(xs[best]! - x)) best = i;
    }
    setHover(best);
  };

  const active = hover == null ? null : points[hover]!;
  const activeX = hover == null ? 0 : xs[hover]!;
  // Flip the tooltip to the left of the crosshair once it nears the right edge.
  const flip = activeX > PAD.left + PLOT_W * 0.62;

  const lastActual = geometry.lastActualIndex;

  return (
    // mt-auto sits the plot on the floor of the card, so when the benchmark
    // column next to it is the taller one the slack lands above the chart
    // rather than as a band of white under the x-axis.
    <div className="relative mt-auto w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Cumulative credited value for ${windowLabel}: ${formatINR(
          pacing.achieved_value
        )} against a target of ${formatINR(pacing.target_value)}, with ${formatINR(
          pacing.expected_value
        )} expected by today.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pacing-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="pacing-plot">
            <rect x={PAD.left} y={PAD.top - 4} width={PLOT_W} height={PLOT_H + 4} />
          </clipPath>
        </defs>

        {/* Grid — recessive, and the only place value labels appear. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const t = i / GRID_LINES;
          const y = PAD.top + PLOT_H * t;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={y}
                y2={y}
                stroke="var(--color-outline-variant)"
                strokeOpacity={i === GRID_LINES ? 0.9 : 0.45}
                strokeDasharray={i === GRID_LINES ? undefined : "4 4"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                className="font-mono-data"
                fontSize={11}
                fill="var(--color-on-surface-variant)"
              >
                {axisTick(yMax * (1 - t), yMax)}
              </text>
            </g>
          );
        })}

        {/* x-axis ticks. The "Now" marker below owns its slot on the axis, so
            any tick close enough to collide with it is dropped. */}
        {points.map((p, i) => {
          if (!p.tick) return null;
          if (lastActual != null && Math.abs(xs[i]! - xs[lastActual]!) < 26) return null;
          return (
            <text
              key={`t-${i}`}
              x={xs[i]}
              y={VIEW_H - 10}
              textAnchor="middle"
              className="font-mono-data"
              fontSize={11}
              fill="var(--color-on-surface-variant)"
            >
              {p.label}
            </text>
          );
        })}

        <g clipPath="url(#pacing-plot)">
          {/* Expected run-rate. Dashed as well as gray, so the two series stay
              tellable apart without relying on colour. */}
          <path
            d={smooth(target)}
            fill="none"
            stroke="var(--color-outline)"
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />

          {actual.length > 1 && (
            <>
              <path
                d={`${smooth(actual)} L${actual[actual.length - 1]!.x},${PAD.top + PLOT_H} L${actual[0]!.x},${PAD.top + PLOT_H} Z`}
                fill="url(#pacing-fill)"
              />
              <path
                d={smooth(actual)}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </g>

        {/* Today */}
        {lastActual != null && (
          <>
            <line
              x1={xs[lastActual]}
              x2={xs[lastActual]}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-outline)"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={xs[lastActual]}
              cy={actual[actual.length - 1]?.y ?? 0}
              r={5}
              fill="var(--color-surface-container-lowest)"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
            />
            <text
              x={xs[lastActual]}
              y={VIEW_H - 10}
              textAnchor="middle"
              className="font-mono-data"
              fontSize={11}
              fontWeight={700}
              fill="var(--color-primary)"
            >
              Now
            </text>
          </>
        )}

        {/* Crosshair */}
        {active && (
          <g pointerEvents="none">
            <line
              x1={activeX}
              x2={activeX}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-primary)"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <circle
              cx={activeX}
              cy={yFor(active.target, yMax)}
              r={4}
              fill="var(--color-surface-container-lowest)"
              stroke="var(--color-outline)"
              strokeWidth={2}
            />
            {active.actual != null && (
              <circle
                cx={activeX}
                cy={yFor(active.actual, yMax)}
                r={5}
                fill="var(--color-primary)"
                stroke="var(--color-surface-container-lowest)"
                strokeWidth={2}
              />
            )}
          </g>
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-4 z-10 min-w-[168px] rounded-xl bg-inverse-surface px-sm py-xs text-inverse-on-surface shadow-lg"
          style={
            flip
              ? { right: `${(1 - activeX / VIEW_W) * 100}%`, marginRight: 12 }
              : { left: `${(activeX / VIEW_W) * 100}%`, marginLeft: 12 }
          }
        >
          <p className="font-label-uppercase text-inverse-on-surface/70">
            {tooltipLabel(active, timeframe, windowLabel)}
          </p>
          <div className="mt-xxs flex items-center justify-between gap-md">
            <span className="flex items-center gap-xxs font-body-sm">
              <span className="h-2 w-2 rounded-full bg-primary-fixed-dim" />
              Actual
            </span>
            <span className="font-mono-data font-bold">
              {active.actual == null ? "—" : formatINR(active.actual)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-md">
            <span className="flex items-center gap-xxs font-body-sm text-inverse-on-surface/70">
              <span className="h-0.5 w-2.5 rounded-full bg-inverse-on-surface/60" />
              Target
            </span>
            <span className="font-mono-data text-inverse-on-surface/70">
              {formatINR(active.target)}
            </span>
          </div>
          {active.actual != null && (
            <p className="mt-xxs border-t border-white/15 pt-xxs font-mono-data text-[11px]">
              {active.actual >= active.target ? "+" : "−"}
              {formatINR(Math.abs(active.actual - active.target))} vs run-rate
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

function yFor(value: number, yMax: number): number {
  return PAD.top + PLOT_H * (1 - (yMax > 0 ? value / yMax : 0));
}

function build(points: PacingPoint[]) {
  const n = Math.max(1, points.length - 1);
  const xs = points.map((_, i) => PAD.left + (PLOT_W * i) / n);

  const peak = points.reduce((max, p) => Math.max(max, p.target, p.actual ?? 0), 0);
  // A flat all-zero series must not collapse the plot.
  const yMax = peak > 0 ? niceCeil(peak) : 1;

  const target: XY[] = points.map((p, i) => ({ x: xs[i]!, y: yFor(p.target, yMax) }));
  const actual: XY[] = [];
  let lastActualIndex: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const value = points[i]!.actual;
    if (value == null) continue;
    actual.push({ x: xs[i]!, y: yFor(value, yMax) });
    lastActualIndex = i;
  }

  return { points, xs, actual, target, yMax, lastActualIndex };
}

/** Step sizes a reader can divide in their head. */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * The smallest ceiling that clears the peak and still divides into GRID_LINES
 * round steps — so the axis reads 0 · 2.5L · 5L · 7.5L · 10L rather than being
 * rounded up to a number half again as large as the data.
 */
function niceCeil(peak: number): number {
  const rough = peak / GRID_LINES;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // The target series is accumulated a day at a time, so a ₹60L peak arrives as
  // 6000000.000000001. Without the tolerance that overshoots the next step up
  // and the axis grows a whole empty band.
  const step = NICE_STEPS.find((s) => rough <= s * magnitude * (1 + 1e-9)) ?? 10;
  return step * magnitude * GRID_LINES;
}

/**
 * One unit for the whole axis, chosen from its ceiling. Mixing "₹1.2L" with
 * "₹60,000" down the same axis makes the reader do conversions to compare two
 * gridlines, which is the axis's job.
 */
function axisTick(value: number, yMax: number): string {
  if (value === 0) return "₹0";
  if (yMax >= 1e7) return `₹${+(value / 1e7).toFixed(2)}Cr`;
  if (yMax >= 1e5) return `₹${+(value / 1e5).toFixed(2)}L`;
  if (yMax >= 1e3) return `₹${+(value / 1e3).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

/**
 * Catmull-Rom through the points, with the control points clamped inside each
 * segment's own y-range. A cumulative series never goes backwards, and an
 * unclamped spline would draw dips that never happened.
 */
function smooth(pts: XY[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) {
    return pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  }
  const clamp = (v: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));

  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(2)},${clamp(c1.y, p1.y, p2.y).toFixed(2)} ${c2.x.toFixed(
      2
    )},${clamp(c2.y, p1.y, p2.y).toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function tooltipLabel(p: PacingPoint, timeframe: Timeframe, windowLabel: string): string {
  if (!p.label) return windowLabel;
  // Each point is stamped at the END of its bucket, so the period it describes
  // ends the day before.
  const at = new Date(p.at);
  at.setDate(at.getDate() - 1);
  if (timeframe === "annual") {
    return at.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const date = at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return timeframe === "monthly" ? date : `${p.label} · ${date}`;
}
