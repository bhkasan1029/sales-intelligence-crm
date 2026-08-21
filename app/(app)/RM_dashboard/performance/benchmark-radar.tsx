"use client";

import { useState } from "react";
import { radarPoint, radarPolygon } from "@/lib/performance";
import type { PerformanceAxis } from "@/lib/queries/performance";

/**
 * Five competencies, you against the median of the other RMs in your branch.
 *
 * Both polygons are scored by the identical rule in lib/performance.ts — the
 * only thing that differs is whose rows went in. Peer data reaches this
 * component already reduced to a median; an individual peer is never plotted.
 */

// The viewBox is deliberately wider than the pentagon: the left and right axis
// labels ("Pipeline Velocity", "SLA Compliance") reach well past its vertices,
// and a tighter box clips them.
const VIEW_W = 372;
const VIEW_H = 250;
const CX = VIEW_W / 2;
const CY = 118;
const R = 70;
const LABEL_R = R + 24;
const RINGS = [25, 50, 75, 100];

export default function BenchmarkRadar({
  axes,
  peerCount,
  peerLabel,
}: {
  axes: PerformanceAxis[];
  peerCount: number;
  peerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const you = axes.map((a) => a.you);
  const peers = axes.map((a) => a.peer_median);
  const active = hover == null ? null : axes[hover]!;
  const activePoint =
    hover == null ? null : radarPoint(hover, 100, CX, CY, R, axes.length);

  return (
    <div className="relative flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={axes
          .map(
            (a) =>
              `${a.label}: you ${Math.round(a.you)} out of 100${
                peerCount > 0 ? `, branch median ${Math.round(a.peer_median)}` : ""
              }`
          )
          .join(". ")}
      >
        {/* Grid rings + spokes */}
        {RINGS.map((r) => (
          <polygon
            key={r}
            points={radarPolygon(axes.map(() => r), CX, CY, R)}
            fill="none"
            stroke="var(--color-outline-variant)"
            strokeOpacity={r === 100 ? 0.8 : 0.45}
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const p = radarPoint(i, 100, CX, CY, R, axes.length);
          return (
            <line
              key={`spoke-${i}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-outline-variant)"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
          );
        })}

        {/* Branch median — recessive, dashed, unfilled. */}
        {peerCount > 0 && (
          <polygon
            points={radarPolygon(peers, CX, CY, R)}
            fill="none"
            stroke="var(--color-outline)"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}

        {/* You */}
        <polygon
          points={radarPolygon(you, CX, CY, R)}
          fill="var(--color-primary)"
          fillOpacity={0.18}
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {axes.map((a, i) => {
          const p = radarPoint(i, a.you, CX, CY, R, axes.length);
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5.5 : 4}
              fill="var(--color-surface-container-lowest)"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
            />
          );
        })}

        {/* Axis labels */}
        {axes.map((a, i) => {
          const p = radarPoint(i, 100, CX, CY, LABEL_R, axes.length);
          const dx = (p.x - CX) / LABEL_R;
          const dy = (p.y - CY) / LABEL_R;
          const anchor = Math.abs(dx) < 0.25 ? "middle" : dx > 0 ? "start" : "end";
          // Two-line labels hang below the anchor when the axis points down and
          // above it when it points up, so they never cross the polygon.
          const offset = dy < -0.3 ? -(a.lines.length - 1) * 12 : dy > 0.3 ? 9 : 0;
          return (
            <text
              key={`label-${i}`}
              x={p.x}
              y={p.y + offset}
              textAnchor={anchor}
              fontSize={11}
              fontWeight={hover === i ? 800 : 700}
              letterSpacing="0.04em"
              fill={
                hover === i ? "var(--color-primary)" : "var(--color-on-surface)"
              }
              style={{ textTransform: "uppercase" }}
            >
              {a.lines.map((line, li) => (
                <tspan key={line} x={p.x} dy={li === 0 ? 0 : 12}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}

        {/* Hit areas: one sector per axis, so the whole wedge is hoverable. */}
        {axes.map((a, i) => (
          <polygon
            key={`hit-${i}`}
            points={sector(i, axes.length)}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{`${a.label}: ${Math.round(a.you)}/100`}</title>
          </polygon>
        ))}
      </svg>

      {/* Legend — identity is never colour alone. */}
      <div className="mt-xxs flex items-center justify-center gap-sm">
        <span className="flex items-center gap-xxs font-label-uppercase text-on-surface-variant">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          You
        </span>
        {peerCount > 0 ? (
          <span className="flex items-center gap-xxs font-label-uppercase text-on-surface-variant">
            <span className="h-0 w-3.5 border-t-2 border-dashed border-outline" />
            {peerLabel} median
          </span>
        ) : (
          <span className="font-body-sm text-on-surface-variant">
            No branch peers to compare against
          </span>
        )}
      </div>

      {active && activePoint && (
        <div
          className="pointer-events-none absolute z-20 w-[190px] -translate-x-1/2 rounded-xl bg-inverse-surface px-sm py-xs text-inverse-on-surface shadow-lg"
          style={{
            left: `${(activePoint.x / VIEW_W) * 100}%`,
            top: `${((activePoint.y + (activePoint.y < CY ? 26 : -96)) / VIEW_H) * 100}%`,
          }}
        >
          <p className="font-label-uppercase text-inverse-on-surface/70">{active.label}</p>
          {active.sample === 0 ? (
            <p className="mt-xxs font-body-sm">No data in this window.</p>
          ) : (
            <>
              <p className="font-mono-data text-base font-bold">
                {Math.round(active.you)}
                <span className="text-inverse-on-surface/60"> / 100</span>
              </p>
              <p className="font-body-sm text-inverse-on-surface/80">
                {peerCount > 0
                  ? `${active.delta >= 0 ? "+" : "−"}${Math.abs(active.delta).toFixed(
                      0
                    )} pts vs median of ${Math.round(active.peer_median)}`
                  : active.unit}
              </p>
            </>
          )}
          <p className="mt-xxs border-t border-white/15 pt-xxs font-body-sm text-inverse-on-surface/70">
            {active.hint}
          </p>
        </div>
      )}
    </div>
  );
}

/** The wedge belonging to axis `i` — half a step either side of its spoke. */
function sector(index: number, count: number): string {
  const reach = R * 1.55;
  const at = (offset: number) => {
    const angle = ((index + offset) / count) * Math.PI * 2 - Math.PI / 2;
    return `${(CX + Math.cos(angle) * reach).toFixed(2)},${(
      CY +
      Math.sin(angle) * reach
    ).toFixed(2)}`;
  };
  return [`${CX},${CY}`, at(-0.5), at(-0.25), at(0), at(0.25), at(0.5)].join(" ");
}
