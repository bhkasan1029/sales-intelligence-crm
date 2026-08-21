"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { ENTITY_LABEL, type Opportunity } from "@/lib/opportunity";

/**
 * "Engage Now" — the only place an action gets closed. Every outcome writes:
 * the action status, an ACTION_COMPLETED event, and a touch on the customer.
 * A conversion additionally credits this period's target (see the PATCH route).
 */

export type Outcome = "converted" | "contacted" | "no_answer" | "not_interested";

const OUTCOMES: { key: Outcome; label: string; icon: string; hint: string }[] = [
  {
    key: "converted",
    label: "Converted",
    icon: "trending_up",
    hint: "Marks the customer active and credits the deal value to this period",
  },
  { key: "contacted", label: "Contacted", icon: "call", hint: "Spoke to them, still in play" },
  { key: "no_answer", label: "No answer", icon: "call_missed", hint: "Tried, could not reach" },
  {
    key: "not_interested",
    label: "Not interested",
    icon: "do_not_disturb_on",
    hint: "Closing this off — they declined",
  },
];

export default function EngageDialog({
  opp,
  busy,
  onClose,
  onComplete,
  onDefer,
}: {
  opp: Opportunity;
  busy: boolean;
  onClose: () => void;
  onComplete: (outcome: Outcome, note: string) => void;
  onDefer: (hours: number) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>("contacted");
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = OUTCOMES.find((o) => o.key === outcome)!;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/40 p-md backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Engage ${opp.customer_name ?? opp.ref}`}
      >
        <div className="flex items-start justify-between gap-sm border-b border-outline-variant/40 p-md">
          <div className="min-w-0">
            <div className="mb-xxs flex items-center gap-xs">
              <span className="font-mono-data text-on-surface-variant">#{opp.ref}</span>
              <span className="rounded-full bg-surface-container-high px-xs py-xxs font-label-uppercase text-[10px] text-on-surface-variant">
                {ENTITY_LABEL[opp.entity]}
              </span>
            </div>
            <h2 className="truncate font-headline-sm text-on-surface">
              {opp.customer_name ?? "Portfolio action"}
            </h2>
            <p className="font-body-sm text-on-surface-variant">{opp.message}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-xxs text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-md p-md">
          {(opp.customer_mobile || opp.customer_email) && (
            <div className="flex flex-wrap gap-xs">
              {opp.customer_mobile && (
                <a
                  href={`tel:${opp.customer_mobile}`}
                  className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface-container-low px-sm py-xs font-body-sm text-on-surface hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  {opp.customer_mobile}
                </a>
              )}
              {opp.customer_email && (
                <a
                  href={`mailto:${opp.customer_email}`}
                  className="inline-flex items-center gap-xs rounded-lg border border-outline-variant bg-surface-container-low px-sm py-xs font-body-sm text-on-surface hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-[16px]">mail</span>
                  {opp.customer_email}
                </a>
              )}
            </div>
          )}

          <div>
            <p className="mb-xs font-label-uppercase text-on-surface-variant">Outcome</p>
            <div className="grid grid-cols-2 gap-xs">
              {OUTCOMES.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setOutcome(o.key)}
                  className={cn(
                    "flex items-center gap-xs rounded-lg border px-sm py-xs font-body-sm transition-colors",
                    outcome === o.key
                      ? "border-primary bg-primary-container/10 font-semibold text-primary"
                      : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-xs font-body-sm text-on-surface-variant">
              {selected.hint}
              {outcome === "converted" && opp.est_value > 0 && (
                <span className="font-semibold text-tertiary">
                  {" "}
                  (+{formatINR(opp.est_value)})
                </span>
              )}
            </p>
          </div>

          <div>
            <label
              htmlFor="engage-note"
              className="mb-xs block font-label-uppercase text-on-surface-variant"
            >
              Note (optional)
            </label>
            <textarea
              id="engage-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What happened on this call?"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-low p-sm font-body-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-sm border-t border-outline-variant/40 bg-surface-container-low p-md">
          <button
            onClick={() => onDefer(24)}
            disabled={busy}
            className="inline-flex items-center gap-xs rounded-lg px-sm py-xs font-body-sm text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">schedule</span>
            Defer 24h
          </button>
          <div className="flex items-center gap-xs">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-sm py-xs font-body-sm text-on-surface-variant hover:bg-surface-container-high"
            >
              Cancel
            </button>
            <button
              onClick={() => onComplete(outcome, note)}
              disabled={busy}
              className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-xs font-body-sm font-bold text-on-primary hover:bg-primary-fixed-variant disabled:opacity-60"
            >
              {busy && (
                <span className="material-symbols-outlined animate-spin text-[16px]">
                  progress_activity
                </span>
              )}
              Log outcome
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
