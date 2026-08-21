"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { humanise } from "@/lib/format";
import {
  LEAD_SOURCES,
  NEW_RECORD_STAGES,
  SEGMENTS,
} from "@/lib/validations/customer";

/**
 * "New Record" — adds a lead to the RM's own book. rm_id is never sent; the
 * route takes it from the session, so this form cannot create into someone
 * else's book even if the payload is tampered with.
 */

const FIELD_CLASS =
  "w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-xs font-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export default function NewRecordDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<string>(SEGMENTS[0]);
  const [stage, setStage] = useState<string>(NEW_RECORD_STAGES[0]);
  const [potentialValue, setPotentialValue] = useState("");
  const [leadSource, setLeadSource] = useState<string>(LEAD_SOURCES[0]);
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          segment,
          stage,
          potential_value: potentialValue || 0,
          lead_source: leadSource,
          mobile,
          email,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create the record");
        return;
      }
      toast.success(`${name} added to your book`);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/40 p-md backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New record"
        className="flex w-full max-w-xl flex-col rounded-xl bg-surface-container-lowest shadow-xl"
      >
        <div className="flex items-start justify-between gap-sm border-b border-outline-variant/40 p-lg">
          <div>
            <h2 className="font-headline-md text-on-surface">New Record</h2>
            <p className="font-body-sm text-on-surface-variant">
              Adds a lead to your book. The rules engine starts scoring it on the
              next run.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-xxs text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid gap-md p-lg sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={160}
              placeholder="Company or contact name"
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="Segment">
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className={FIELD_CLASS}
            >
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Stage">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className={FIELD_CLASS}
            >
              {NEW_RECORD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Potential value (₹)">
            <input
              value={potentialValue}
              onChange={(e) => setPotentialValue(e.target.value)}
              type="number"
              min={0}
              step={1000}
              placeholder="0"
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="Lead source">
            <select
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value)}
              className={FIELD_CLASS}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Mobile" hint="Optional">
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="numeric"
              placeholder="9876543210"
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="Email" hint="Optional">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="contact@example.in"
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-xs border-t border-outline-variant/40 bg-surface-container-low p-md">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-sm py-xs font-body-sm text-on-surface-variant hover:bg-surface-container-high"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || name.trim().length < 2}
            className="rounded-lg bg-primary px-md py-xs font-body-sm font-bold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create record"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-xxs flex items-center gap-xs font-label-uppercase text-on-surface-variant">
        {label}
        {hint && <span className="font-body-sm normal-case tracking-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
