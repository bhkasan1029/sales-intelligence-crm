"use client";

import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import {
  ENTITY_LABEL,
  TAG_TONE_CLASS,
  elapsedPct,
  formatCountdown,
  urgencyOf,
  type Opportunity,
} from "@/lib/opportunity";

/**
 * One card in the Prioritised Action Queue. Presentational: every timing value
 * is derived from `now`, which the board ticks once a second, so all the cards
 * count down off a single interval.
 */

const ENTITY_CHIP: Record<string, string> = {
  lead: "bg-surface-container-high text-on-surface-variant",
  client: "bg-primary/10 text-primary",
  portfolio: "bg-tertiary/10 text-tertiary",
};

export default function OpportunityCard({
  opp,
  now,
  focus,
  highlighted,
  busy,
  onEngage,
  onReview,
  onSkip,
}: {
  opp: Opportunity;
  now: number;
  /** The top-ranked card gets the primary treatment and a single CTA. */
  focus: boolean;
  highlighted: boolean;
  busy: boolean;
  onEngage: () => void;
  onReview: () => void;
  onSkip: () => void;
}) {
  const deadlineMs = new Date(opp.deadline).getTime();
  const remaining = deadlineMs - now;
  const urgency = urgencyOf(opp.deadline, now);
  const pct = elapsedPct(opp.created_at, opp.deadline, now);

  const barClass =
    urgency === "breached" || urgency === "critical"
      ? "bg-error"
      : urgency === "soon"
        ? "bg-primary"
        : "bg-tertiary";

  const countdownClass =
    urgency === "breached"
      ? "text-error font-bold"
      : urgency === "critical"
        ? "text-error"
        : urgency === "soon"
          ? "text-on-surface"
          : "text-on-surface-variant";

  return (
    <div
      id={`opp-${opp.id}`}
      className={cn(
        "group relative flex flex-col rounded-xl bg-surface-container-lowest transition-all",
        focus || urgency === "breached" || urgency === "critical"
          ? "shadow-md ring-1 ring-error/30 hover:shadow-xl"
          : "border border-outline-variant/30 shadow-sm hover:border-outline-variant/60 hover:shadow-md",
        urgency === "normal" && !focus && "opacity-90 hover:opacity-100",
        highlighted && "ring-2 ring-primary",
        busy && "pointer-events-none opacity-60"
      )}
    >
      <div className="flex-1 p-md">
        <div className="mb-md flex items-start justify-between gap-sm">
          <div className="min-w-0">
            <div className="mb-xxs flex items-center gap-xs">
              <span className="font-mono-data text-on-surface-variant">#{opp.ref}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-xs py-xxs font-label-uppercase text-[10px]",
                  ENTITY_CHIP[opp.entity]
                )}
              >
                {ENTITY_LABEL[opp.entity]}
              </span>
            </div>
            <h3 className="truncate font-headline-sm text-on-surface">
              {opp.customer_name ?? "Portfolio action"}
            </h3>
            <p className="mt-xxs line-clamp-2 font-body-sm text-on-surface-variant">
              {opp.message}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-headline-sm text-on-surface">
              {opp.est_value > 0 ? formatINR(opp.est_value) : "—"}
            </div>
            <div className="font-label-uppercase text-on-surface-variant">Est. Value</div>
          </div>
        </div>

        <div className="mb-lg flex flex-wrap gap-xs">
          {opp.tags.map((tag) => (
            <span
              key={tag.key}
              className={cn(
                "inline-flex items-center gap-xxs rounded-md px-xs py-xxs font-label-uppercase",
                TAG_TONE_CLASS[tag.tone]
              )}
            >
              <span className="material-symbols-outlined text-[12px]">{tag.icon}</span>
              {tag.label}
            </span>
          ))}
        </div>

        <div className="mt-auto">
          <div className="mb-xs flex items-center justify-between gap-xs font-body-sm">
            <span className="text-on-surface-variant">
              {urgency === "breached" ? "Overdue by" : "Time to act"}
            </span>
            <div className="flex items-center gap-xs">
              <span className={cn("font-mono-data", countdownClass)}>
                {formatCountdown(remaining)}
              </span>
              {opp.customer_segment && (
                <span className="inline-flex items-center rounded-full bg-surface-container-high px-xs py-xxs font-label-uppercase text-[10px] text-on-surface-variant">
                  {opp.customer_segment}
                </span>
              )}
            </div>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className={cn("h-full rounded-full transition-all", barClass)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-xs rounded-b-xl border-t border-outline-variant/20 bg-surface-container-low p-xs">
        {focus ? (
          <button
            onClick={onEngage}
            className="w-full rounded-lg bg-primary py-xs text-center font-body-sm font-bold text-on-primary transition-colors hover:bg-primary-fixed-variant disabled:opacity-60"
            disabled={busy}
          >
            Engage Now
          </button>
        ) : (
          <>
            <button
              onClick={onReview}
              className="flex-1 rounded-lg bg-surface-container-highest py-xs text-center font-body-sm font-bold text-on-surface transition-colors hover:bg-surface-variant"
              disabled={busy}
            >
              Review
            </button>
            <button
              onClick={onSkip}
              className="flex-1 rounded-lg bg-surface-container-highest py-xs text-center font-body-sm font-bold text-on-surface transition-colors hover:bg-surface-variant"
              disabled={busy}
            >
              Skip
            </button>
          </>
        )}
      </div>

      {/* Why the engine surfaced this — real signal counts, not a decoration. */}
      {(opp.insight || opp.reason) && (
        <div className="pointer-events-none absolute left-0 top-[103%] z-50 flex w-full flex-col gap-xs rounded-xl bg-inverse-surface p-sm text-inverse-on-surface opacity-0 shadow-xl transition-opacity before:absolute before:-top-2 before:left-8 before:border-8 before:border-transparent before:border-b-inverse-surface group-hover:opacity-100">
          <div className="flex items-center gap-xs font-label-uppercase text-primary-fixed">
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            {opp.rule_name ? `${opp.rule_name} · Insight` : "Insight Trigger"}
          </div>
          {opp.insight && <p className="font-body-sm">{opp.insight}</p>}
          {opp.reason && (
            <p className="font-body-sm text-inverse-on-surface/70">{opp.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
