"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatINR, formatRelative, humanise } from "@/lib/format";
import {
  ENTITY_LABEL,
  TAG_TONE_CLASS,
  formatCountdown,
  urgencyOf,
  type Opportunity,
} from "@/lib/opportunity";
import type { CustomerDetail } from "@/lib/queries/rm";

/**
 * "Review" — the full record behind a card: profile, the rule that fired, and a
 * merged event/action timeline. Opens either from a queue card or from an
 * omni-search hit, so it takes an opportunity, a customer id, or both.
 */

const EVENT_ICON: Record<string, string> = {
  CALL_LOGGED: "call",
  MEETING_COMPLETED: "groups",
  PAYIN_RECEIVED: "account_balance_wallet",
  CONVERSION_COMPLETED: "trending_up",
  ACTION_COMPLETED: "task_alt",
  FOLLOWUP_LOGGED: "event_repeat",
};

export default function ReviewDrawer({
  opp,
  customerId,
  now,
  busy,
  onClose,
  onEngage,
  onSkip,
}: {
  opp: Opportunity | null;
  customerId: string | null;
  now: number;
  busy: boolean;
  onClose: () => void;
  onEngage: () => void;
  onSkip: () => void;
}) {
  // The drawer is mounted with key={id} by the board, so this state always
  // belongs to the record on screen — no clearing on id change.
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const id = customerId ?? opp?.customer_id ?? null;
  const loading = Boolean(id) && !detail && !failed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d) setDetail(d);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = opp?.customer_name ?? detail?.name ?? "Portfolio action";
  const urgency = opp ? urgencyOf(opp.deadline, now) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-inverse-surface/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-surface-container-lowest shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${title}`}
      >
        {/* Header */}
        <div className="border-b border-outline-variant/40 p-lg">
          <div className="flex items-start justify-between gap-sm">
            <div className="min-w-0">
              <div className="mb-xxs flex flex-wrap items-center gap-xs">
                {opp && (
                  <span className="font-mono-data text-on-surface-variant">#{opp.ref}</span>
                )}
                <span className="rounded-full bg-surface-container-high px-xs py-xxs font-label-uppercase text-[10px] text-on-surface-variant">
                  {opp ? ENTITY_LABEL[opp.entity] : (detail?.stage ?? "customer").replace(/_/g, " ")}
                </span>
                {detail?.segment && (
                  <span className="rounded-full bg-surface-container-high px-xs py-xxs font-label-uppercase text-[10px] text-on-surface-variant">
                    {detail.segment}
                  </span>
                )}
              </div>
              <h2 className="truncate font-headline-md text-on-surface">{title}</h2>
              {opp && <p className="font-body-md text-on-surface-variant">{opp.message}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-xxs text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {opp && opp.tags.length > 0 && (
            <div className="mt-sm flex flex-wrap gap-xs">
              {opp.tags.map((t) => (
                <span
                  key={t.key}
                  className={cn(
                    "inline-flex items-center gap-xxs rounded-md px-xs py-xxs font-label-uppercase",
                    TAG_TONE_CLASS[t.tone]
                  )}
                >
                  <span className="material-symbols-outlined text-[12px]">{t.icon}</span>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-lg overflow-y-auto p-lg">
          {opp && (
            <section className="grid grid-cols-2 gap-sm sm:grid-cols-4">
              <Fact label="Est. value" value={opp.est_value > 0 ? formatINR(opp.est_value) : "—"} />
              <Fact
                label={urgency === "breached" ? "Overdue by" : "Time to act"}
                value={formatCountdown(new Date(opp.deadline).getTime() - now)}
                tone={urgency === "breached" || urgency === "critical" ? "text-error" : undefined}
                mono
              />
              <Fact label="Priority" value={String(Math.round(opp.priority_score))} mono />
              <Fact label="Raised" value={formatRelative(opp.created_at)} />
            </section>
          )}

          {opp && (opp.reason || opp.insight) && (
            <section className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-md">
              <div className="mb-xs flex items-center gap-xs font-label-uppercase text-primary">
                <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                {opp.rule_name ?? humanise(opp.type)}
              </div>
              {opp.insight && (
                <p className="font-body-md text-on-surface">{opp.insight}</p>
              )}
              {opp.reason && (
                <p className="mt-xxs font-body-sm text-on-surface-variant">{opp.reason}</p>
              )}
            </section>
          )}

          {detail && (
            <section>
              <h3 className="mb-sm font-label-uppercase text-on-surface-variant">Customer</h3>
              <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
                <Fact label="Stage" value={humanise(detail.stage)} />
                <Fact label="Source" value={detail.lead_source ? humanise(detail.lead_source) : "—"} />
                <Fact label="Potential" value={formatINR(detail.potential_value)} />
                <Fact label="Assigned" value={formatRelative(detail.assigned_at)} />
                <Fact label="Last contact" value={formatRelative(detail.last_contact_at)} />
                <Fact
                  label="Actions"
                  value={`${detail.open_actions} open · ${detail.closed_actions} closed`}
                />
              </div>
              <div className="mt-sm flex flex-wrap gap-xs">
                {detail.mobile && (
                  <a
                    href={`tel:${detail.mobile}`}
                    className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs font-body-sm hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    {detail.mobile}
                  </a>
                )}
                {detail.email && (
                  <a
                    href={`mailto:${detail.email}`}
                    className="inline-flex items-center gap-xs rounded-lg border border-outline-variant px-sm py-xs font-body-sm hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[16px]">mail</span>
                    {detail.email}
                  </a>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-sm font-label-uppercase text-on-surface-variant">Timeline</h3>
            {loading && <p className="font-body-sm text-on-surface-variant">Loading history…</p>}
            {!loading && (!detail || detail.timeline.length === 0) && (
              <p className="font-body-sm text-on-surface-variant">
                No activity recorded against this record yet.
              </p>
            )}
            <ol className="space-y-xs">
              {detail?.timeline.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-sm rounded-lg border border-outline-variant/30 bg-surface-container-low p-sm"
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      t.kind === "action" ? "text-primary" : "text-on-surface-variant"
                    )}
                  >
                    {EVENT_ICON[t.type] ?? (t.kind === "action" ? "bolt" : "history")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-body-sm text-on-surface">
                      {t.kind === "event" ? humanise(t.label) : t.label}
                    </p>
                    <p className="font-body-sm text-on-surface-variant">
                      {formatRelative(t.at)}
                      {t.detail ? ` · ${t.detail}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Footer */}
        {opp && (
          <div className="flex items-center justify-end gap-xs border-t border-outline-variant/40 bg-surface-container-low p-md">
            <button
              onClick={onSkip}
              disabled={busy}
              className="rounded-lg px-sm py-xs font-body-sm text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
            >
              Skip for 4h
            </button>
            <button
              onClick={onEngage}
              disabled={busy}
              className="rounded-lg bg-primary px-md py-xs font-body-sm font-bold text-on-primary hover:bg-primary-fixed-variant disabled:opacity-60"
            >
              Engage Now
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="font-label-uppercase text-on-surface-variant">{label}</p>
      <p className={cn("text-on-surface", mono ? "font-mono-data" : "font-body-md", tone)}>
        {value}
      </p>
    </div>
  );
}
