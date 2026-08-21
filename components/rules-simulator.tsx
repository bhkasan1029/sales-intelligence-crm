"use client";

import { useEffect, useState } from "react";
import { X, Play, RotateCcw, Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/dashboard-ui";
import type {
  HistogramBucket,
  SlaSimulationOutput,
} from "@/lib/simulate/sla-hours";

export type SimRule = {
  id: string;
  name: string;
  description: string | null;
  condition: Record<string, unknown>;
  action_type: string;
};

type KnobUnit = "h" | "d" | "%" | "₹" | "";

type Knob = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: KnobUnit;
};

// Per-rule editable knob catalogue. Kept explicit (rather than auto-parsing
// the JSON) so the RH doesn't see keys like `benchmark_basis` (an enum) or
// `watch_action_types` (an array) as accidentally-editable numbers.
const RULE_KNOBS: Record<string, Knob[]> = {
  follow_up_breach: [
    { key: "sla_hours", label: "SLA", min: 1, max: 168, step: 1, unit: "h" },
    { key: "response_hours", label: "Response window", min: 1, max: 72, step: 1, unit: "h" },
    { key: "value_ceiling", label: "Value ceiling", min: 100000, max: 10000000, step: 100000, unit: "₹" },
  ],
  opportunity_at_risk: [
    { key: "followup_window_days", label: "Follow-up window", min: 1, max: 30, step: 1, unit: "d" },
    { key: "response_hours", label: "Response window", min: 1, max: 168, step: 1, unit: "h" },
    { key: "amount_ceiling", label: "Amount ceiling", min: 50000, max: 5000000, step: 50000, unit: "₹" },
  ],
  target_gap: [
    { key: "gap_threshold_pct", label: "Gap threshold", min: 1, max: 50, step: 1, unit: "%" },
  ],
  stale_pipeline: [
    { key: "stale_days", label: "Idle limit", min: 1, max: 90, step: 1, unit: "d" },
    { key: "min_value", label: "Minimum value", min: 0, max: 5000000, step: 50000, unit: "₹" },
  ],
  meeting_no_outcome: [
    { key: "grace_hours", label: "Grace period", min: 1, max: 168, step: 1, unit: "h" },
  ],
  escalated_breach: [
    { key: "escalation_hours", label: "Escalation window", min: 1, max: 168, step: 1, unit: "h" },
  ],
  major_win: [
    { key: "min_amount", label: "Minimum amount", min: 100000, max: 10000000, step: 100000, unit: "₹" },
  ],
  target_achievement: [
    { key: "achievement_pct", label: "Milestone %", min: 100, max: 200, step: 1, unit: "%" },
  ],
};

type EngineDiff = {
  before: number;
  after: number;
  added: {
    dedupe_key: string;
    rm_id: string;
    customer_id: string | null;
    message: string;
    reason: string;
    priority_score: number;
  }[];
  removed: string[];
  score_shifts: { dedupe_key: string; from: number; to: number }[];
};

type SimResult = {
  rule: { id: string; name: string; action_type: string };
  engine: EngineDiff;
  sla: SlaSimulationOutput | null;
};

function formatUnit(v: number, u: KnobUnit): string {
  if (u === "₹") return v >= 100000 ? `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L` : `₹${v.toLocaleString("en-IN")}`;
  if (u === "%") return `${v}%`;
  if (u === "h") return `${v}h`;
  if (u === "d") return `${v}d`;
  return String(v);
}

export default function RulesSimulator({ rules }: { rules: SimRule[] }) {
  const [focused, setFocused] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const focusedRule = rules.find((r) => r.action_type === focused) ?? null;
  const focusedKnobs = focused ? RULE_KNOBS[focused] ?? [] : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePane();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePane = () => {
    setFocused(null);
    setOverrides({});
    setResult(null);
    setError(null);
  };

  const openRule = (r: SimRule) => {
    if (!RULE_KNOBS[r.action_type]) return;
    const seed: Record<string, number> = {};
    for (const k of RULE_KNOBS[r.action_type]) {
      seed[k.key] = Number(r.condition?.[k.key] ?? k.min);
    }
    setFocused(r.action_type);
    setOverrides(seed);
    setResult(null);
    setError(null);
  };

  const resetKnobs = () => {
    if (!focusedRule || !focused) return;
    const seed: Record<string, number> = {};
    for (const k of RULE_KNOBS[focused] ?? []) {
      seed[k.key] = Number(focusedRule.condition?.[k.key] ?? k.min);
    }
    setOverrides(seed);
    setResult(null);
    setError(null);
  };

  const runSimulation = async () => {
    if (!focusedRule) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule_id: focusedRule.id,
          condition_overrides: overrides,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `Simulation failed (${res.status})`);
        return;
      }
      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  const isEditing = focused !== null;

  return (
    <div
      className={cn(
        "grid gap-6 transition-[grid-template-columns] duration-200",
        isEditing
          ? "grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.7fr)]"
          : "grid-cols-1"
      )}
    >
      {/* LEFT — rule list. Non-focused rows collapse when editing. */}
      <div className="space-y-2">
        {rules.map((r) => {
          const knobs = RULE_KNOBS[r.action_type];
          const isFocused = focused === r.action_type;
          const collapsed = isEditing && !isFocused;
          const interactive = knobs != null;

          return (
            <button
              key={r.id}
              type="button"
              disabled={!interactive}
              onClick={() => openRule(r)}
              className={cn(
                "block w-full rounded-xl border bg-white text-left transition-all",
                isFocused
                  ? "border-[#1A1A1A] p-5 shadow-sm"
                  : collapsed
                  ? "border-gray-200 px-4 py-2"
                  : "border-gray-200 p-4 hover:border-gray-300",
                interactive ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">
                    {r.name}
                  </p>
                  {!collapsed && r.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {r.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {interactive ? (
                    knobs!.map((k) => {
                      const curVal = Number(r.condition?.[k.key] ?? k.min);
                      return (
                        <span
                          key={k.key}
                          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700"
                          title={k.label}
                        >
                          {k.key}={formatUnit(curVal, k.unit)}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      view only
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* RIGHT — knob panel + result. Only when a rule is being edited. */}
      {isEditing && focusedRule && (
        <FocusedRulePanel
          rule={focusedRule}
          knobs={focusedKnobs}
          overrides={overrides}
          onOverridesChange={(next) => {
            setOverrides(next);
            // Any knob change invalidates the last-run result — the send-
            // request form should never submit values the RH hasn't actually
            // seen a simulation for.
            setResult(null);
            setError(null);
          }}
          onRun={runSimulation}
          onReset={resetKnobs}
          onClose={closePane}
          result={result}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

function FocusedRulePanel({
  rule,
  knobs,
  overrides,
  onOverridesChange,
  onRun,
  onReset,
  onClose,
  result,
  loading,
  error,
}: {
  rule: SimRule;
  knobs: Knob[];
  overrides: Record<string, number>;
  onOverridesChange: (next: Record<string, number>) => void;
  onRun: () => void;
  onReset: () => void;
  onClose: () => void;
  result: SimResult | null;
  loading: boolean;
  error: string | null;
}) {
  const setVal = (key: string, next: number) =>
    onOverridesChange({ ...overrides, [key]: next });

  const dirty = knobs.some(
    (k) => Number(rule.condition?.[k.key] ?? k.min) !== overrides[k.key]
  );

  return (
    <Card className="p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">
            {rule.action_type}
          </p>
          <h3 className="text-lg font-semibold text-[#1A1A1A]">{rule.name}</h3>
          {rule.description && (
            <p className="mt-0.5 text-xs text-gray-500">{rule.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-[#1A1A1A]"
        >
          <X className="size-3.5" />
          Close
        </button>
      </div>

      {/* Knobs */}
      <div className="mb-5 space-y-4">
        {knobs.map((k) => (
          <KnobRow
            key={k.key}
            knob={k}
            value={overrides[k.key] ?? k.min}
            onChange={(n) => setVal(k.key, n)}
            original={Number(rule.condition?.[k.key] ?? k.min)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition",
            loading ? "opacity-60" : "hover:bg-black"
          )}
        >
          <Play className="size-3.5" />
          {loading ? "Running…" : "Run Simulation"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:border-gray-300"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          Changes are exploratory. Nothing is saved.
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {!result && !error && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-600">
            Adjust values above, then click Run Simulation.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Nothing changes in the database — this only previews impact.
          </p>
        </div>
      )}

      {result && (
        <ResultView
          rule={rule}
          knobs={knobs}
          overrides={overrides}
          result={result}
          slaThreshold={
            typeof overrides.sla_hours === "number" ? overrides.sla_hours : 0
          }
        />
      )}
    </Card>
  );
}

function KnobRow({
  knob,
  value,
  onChange,
  original,
}: {
  knob: Knob;
  value: number;
  onChange: (n: number) => void;
  original: number;
}) {
  const changed = value !== original;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-xs font-medium text-[#1A1A1A]">
          {knob.label}
          <span className="ml-1.5 font-mono text-[10px] text-gray-400">
            {knob.key}
          </span>
        </label>
        <span className="text-[10px] text-gray-400">
          {changed ? (
            <>
              was <span className="font-mono">{formatUnit(original, knob.unit)}</span>
            </>
          ) : (
            "unchanged"
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          min={knob.min}
          max={knob.max}
          step={knob.step}
          onChange={(e) =>
            onChange(
              Math.max(
                knob.min,
                Math.min(knob.max, Number(e.target.value) || knob.min)
              )
            )
          }
          className={cn(
            "w-28 rounded-lg border px-3 py-1.5 font-mono text-sm focus:outline-none",
            changed
              ? "border-[#1A1A1A] text-[#1A1A1A]"
              : "border-gray-200 text-gray-700"
          )}
        />
        <input
          type="range"
          value={value}
          min={knob.min}
          max={knob.max}
          step={knob.step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[#1A1A1A]"
        />
        <span className="w-8 text-right text-xs text-gray-500">{knob.unit}</span>
      </div>
    </div>
  );
}

function ResultView({
  rule,
  knobs,
  overrides,
  result,
  slaThreshold,
}: {
  rule: SimRule;
  knobs: Knob[];
  overrides: Record<string, number>;
  result: SimResult;
  slaThreshold: number;
}) {
  // Only the knobs whose value differs from the rule's current condition —
  // this is what actually gets sent to the admin. Sending the full condition
  // would be noisy and could accidentally override values the RH never touched.
  const knobDelta: Record<string, number> = {};
  for (const k of knobs) {
    const orig = Number(rule.condition?.[k.key] ?? k.min);
    if (overrides[k.key] !== orig) knobDelta[k.key] = overrides[k.key];
  }
  const eng = result.engine;
  const delta = eng.after - eng.before;
  const deltaLabel =
    delta === 0 ? "no change" : delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor =
    delta === 0
      ? "text-gray-500"
      : delta > 0
      ? "text-red-700"
      : "text-emerald-700";

  return (
    <div className="space-y-5">
      {/* Two-panel: left changes with input, right is fixed reality */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-[10px] uppercase tracking-wide text-red-700">
            Would fire (engine)
          </p>
          <p className="mt-1 text-2xl font-bold text-red-800">
            {eng.before}
            <span className="mx-2 text-base font-normal text-red-700">→</span>
            {eng.after}
            <span className={cn("ml-2 text-sm font-normal", deltaColor)}>
              ({deltaLabel})
            </span>
          </p>
          <p className="mt-1 text-xs text-red-700">
            {eng.added.length} new · {eng.removed.length} removed ·{" "}
            {eng.score_shifts.length} priority-shifted
          </p>
        </div>

        {result.sla ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-600">
              Reality (unchanged)
            </p>
            <p className="mt-1 text-2xl font-bold text-[#1A1A1A]">
              {result.sla.medianResolutionHours.toFixed(0)}
              <span className="ml-1 text-sm font-normal text-gray-600">
                h median
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-600">
              p90 {result.sla.p90ResolutionHours.toFixed(0)}h ·{" "}
              {result.sla.totalClosed} in 90 days
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-[10px] uppercase tracking-wide text-gray-600">
              Note
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Impact reflects the current live world. Loosening a rule reduces
              flag counts without improving the underlying work.
            </p>
          </div>
        )}
      </div>

      {/* Sla-only histogram (only for follow_up_breach.sla_hours) */}
      {result.sla && result.sla.totalClosed > 0 && (
        <Histogram histogram={result.sla.histogram} threshold={slaThreshold} />
      )}

      {/* Added drafts sample */}
      {eng.added.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">
            Newly flagged (first {Math.min(5, eng.added.length)})
          </p>
          <div className="space-y-1.5">
            {eng.added.slice(0, 5).map((d) => (
              <div
                key={d.dedupe_key}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <p className="min-w-0 flex-1 truncate text-xs text-gray-700">
                  {d.message}
                </p>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                  {d.priority_score}
                </span>
              </div>
            ))}
            {eng.added.length > 5 && (
              <p className="text-[11px] text-gray-400">
                …and {eng.added.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Loosening the rule moves the{" "}
        <span className="font-medium text-[#1A1A1A]">line</span>, not the{" "}
        <span className="font-medium text-[#1A1A1A]">work</span>.
      </p>

      <RequestChangeForm
        rule={rule}
        knobs={knobs}
        delta={knobDelta}
      />
    </div>
  );
}

function RequestChangeForm({
  rule,
  knobs,
  delta,
}: {
  rule: SimRule;
  knobs: Knob[];
  delta: Record<string, number>;
}) {
  const [justification, setJustification] = useState("");
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nothingChanged = Object.keys(delta).length === 0;
  const disabled = nothingChanged || sending || sentId !== null;

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/rule-change-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule_id: rule.id,
          proposed_condition: delta,
          justification: justification.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `Request failed (${res.status})`);
        return;
      }
      const row = await res.json();
      setSentId(row.id as string);
    } catch (e) {
      setError((e as Error).message ?? "Network error");
    } finally {
      setSending(false);
    }
  };

  if (sentId) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-900">
              Request sent to admin
            </p>
            <p className="mt-0.5 text-xs text-emerald-700">
              Nothing on the rule changed. The admin will review your proposed
              values and reasoning.
            </p>
            <p className="mt-2 font-mono text-[10px] text-emerald-700">
              request id: {sentId}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">
        Send request to admin
      </p>
      <p className="mt-1 text-xs text-gray-600">
        You can&apos;t change the rule yourself — this files a request for the
        admin to review. What you edited above is what gets sent.
      </p>

      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-gray-500">
          Proposed changes
        </p>
        {nothingChanged ? (
          <p className="mt-1 text-xs text-gray-500">
            No values differ from the current rule.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {Object.entries(delta).map(([key, val]) => {
              const knob = knobs.find((k) => k.key === key);
              const orig = Number(rule.condition?.[key] ?? 0);
              return (
                <li key={key} className="font-mono text-xs text-gray-700">
                  <span className="text-gray-500">{knob?.label ?? key}</span>{" "}
                  <span className="text-gray-500">{key}</span>{" "}
                  <span className="text-gray-400">
                    {formatUnit(orig, knob?.unit ?? "")}
                  </span>{" "}
                  →{" "}
                  <span className="font-semibold text-[#1A1A1A]">
                    {formatUnit(val, knob?.unit ?? "")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-[#1A1A1A]">
          Justification
          <span className="ml-1 font-normal text-gray-400">
            (optional — but helpful context for the admin)
          </span>
        </span>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
          placeholder="e.g. HNI-segment leads consistently need more lead time — 24h isn't realistic across both branches this quarter."
          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#1A1A1A] focus:outline-none"
        />
      </label>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition",
            disabled ? "cursor-not-allowed opacity-50" : "hover:bg-black"
          )}
        >
          <Send className="size-3.5" />
          {sending ? "Sending…" : "Send Request"}
        </button>
      </div>
    </div>
  );
}

function Histogram({
  histogram,
  threshold,
}: {
  histogram: HistogramBucket[];
  threshold: number;
}) {
  const width = 640;
  const height = 220;
  const pad = { top: 14, right: 14, bottom: 34, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const maxCount = Math.max(1, ...histogram.map((b) => b.count));
  const barW = chartW / histogram.length;

  const maxDisplay = histogram[histogram.length - 1].lowerBound;
  const clampedThreshold = Math.min(maxDisplay, Math.max(0, threshold));
  const thresholdX = pad.left + (clampedThreshold / maxDisplay) * chartW;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">
        Actual resolution times · last 90 days
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <text x={4} y={pad.top + 10} fontSize="10" className="fill-gray-400">
          {maxCount}
        </text>

        {histogram.map((b, i) => {
          const h = (b.count / maxCount) * chartH;
          const x = pad.left + i * barW;
          const y = pad.top + (chartH - h);
          const beyondThreshold = b.lowerBound >= threshold;
          return (
            <g key={b.label}>
              <rect
                x={x + 2}
                y={y}
                width={barW - 4}
                height={h}
                fill={beyondThreshold ? "#fca5a5" : "#e5e7eb"}
                rx={2}
              />
              <text
                x={x + barW / 2}
                y={height - pad.bottom + 14}
                textAnchor="middle"
                fontSize="9"
                className="fill-gray-500"
              >
                {b.lowerBound}
              </text>
            </g>
          );
        })}

        <line
          x1={thresholdX}
          x2={thresholdX}
          y1={pad.top}
          y2={pad.top + chartH}
          stroke="#dc2626"
          strokeWidth={2}
          strokeDasharray="4 3"
        />

        <text
          x={pad.left + chartW / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="10"
          className="fill-gray-500"
        >
          resolution time (hours)
        </text>
      </svg>
    </div>
  );
}
