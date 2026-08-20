/**
 * lib/rules-engine.ts — v3
 *
 * Design rules:
 *  - Pure. No DB, no Date.now(). Everything comes from EvaluationContext.
 *  - Every evaluator has the SAME signature: (ctx, rule) => ActionDraft[].
 *    Rules are dispatched by rules.action_type, so adding a rule row in the
 *    DB is enough to turn behaviour on/off. No imports by name.
 *  - One scoring function. Weights live in rules.condition.score_weights.
 *  - Manager alerts are not a flag — they are actions rows whose rm_id is the
 *    manager's user id. Nothing outside the schema is needed.
 *  - Every draft carries a dedupe_key so the same event can be replayed
 *    without duplicating actions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Schema-mirroring types
// ─────────────────────────────────────────────────────────────────────────────

export type Json = Record<string, any>;
export type Role = 'rm' | 'branch_manager' | 'regional_head' | 'admin';

export type User = {
  id: string;
  name: string;
  role: Role;
  manager_id: string | null;
  team_id: string | null;
};

export type Customer = {
  id: string;
  name: string;
  rm_id: string;
  segment: string | null;
  stage: string;
  potential_value: number;
  lead_source: string | null;
  assigned_at: string;
  last_contact_at: string | null;
  next_followup_at: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  type: string;
  customer_id: string | null;
  rm_id: string | null;
  payload: Json;
  created_at: string;
};

export type Rule = {
  id: string;
  name: string;
  condition: Json;
  action_type: string;
  weight: number;
  active: boolean;
  version: number;
  effective_date: string;
};

export type ActionRow = {
  id: string;
  customer_id: string | null;
  rm_id: string | null;
  type: string;
  status: string;
  priority_score: number;
  sla_deadline: string | null;
  source_rule_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TargetRow = {
  id: string;
  owner_id: string;
  owner_role: 'rm' | 'branch_manager';
  period: string;
  target_value: number;
  achieved_value: number;
};

/** What an evaluator produces. Maps 1:1 onto an `actions` insert, except
 *  dedupe_key which the writer uses for idempotency and then discards. */
export type ActionDraft = {
  dedupe_key: string;
  source_rule_id: string;
  source_event_id: string | null;
  customer_id: string | null;
  rm_id: string;
  type: string;
  message: string;
  reason: string;
  priority_score: number;
  sla_deadline: string | null;
};

export type EvaluationContext = {
  now: Date;
  period: string;                 // 'YYYY-MM'
  users: User[];
  customers: Customer[];
  events: EventRow[];             // window of recent events, newest-last
  targets: TargetRow[];
  openActions: ActionRow[];       // status in ('open','snoozed') — for dedup
};

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 86_400_000;

const hoursBetween = (a: Date | string, b: Date | string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / HOUR;

const daysBetween = (a: Date | string, b: Date | string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / DAY;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const isoAfter = (from: Date, hours: number) => new Date(from.getTime() + hours * HOUR).toISOString();

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** '2026-08' -> inclusive start / exclusive end, plus elapsed fraction. */
export function periodBounds(period: string, now: Date) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const total = daysBetween(start, end);
  const elapsed = Math.max(0, Math.min(total, daysBetween(start, now)));
  return { start, end, totalDays: total, elapsedDays: elapsed, elapsedPct: (elapsed / total) * 100 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Configurable scoring
//
// Every rule scores on the same five normalised (0..1) signals. A rule that
// doesn't care about a signal just leaves its weight at 0 in the DB.
// Default weights are overridable per-rule via condition.score_weights.
// ─────────────────────────────────────────────────────────────────────────────

export type ScoreSignals = {
  urgency: number;      // how far past threshold / how overdue
  value: number;        // money at stake
  importance: number;   // customer segment / strategic weight
  sla: number;          // proximity to a hard deadline
  confidence: number;   // how strongly the evidence supports the rule
};

export type ScoreWeights = Record<keyof ScoreSignals, number>;

export const DEFAULT_WEIGHTS: ScoreWeights = {
  urgency: 35, value: 25, importance: 15, sla: 15, confidence: 10,
};

export const SEGMENT_IMPORTANCE: Record<string, number> = {
  hni: 1.0, priority: 0.8, premium: 0.8, retail: 0.45, mass: 0.3,
};

export function segmentScore(segment: string | null | undefined): number {
  if (!segment) return 0.4;
  return SEGMENT_IMPORTANCE[segment.toLowerCase()] ?? 0.4;
}

/** Weighted mean of the signals, scaled by the rule's own weight, 0..100. */
export function score(rule: Rule, signals: Partial<ScoreSignals>): number {
  const w: ScoreWeights = { ...DEFAULT_WEIGHTS, ...(rule.condition?.score_weights ?? {}) };
  const s: ScoreSignals = {
    urgency: 0, value: 0, importance: 0, sla: 0, confidence: 0.5, ...signals,
  };
  let num = 0, den = 0;
  (Object.keys(w) as (keyof ScoreSignals)[]).forEach(k => {
    num += w[k] * clamp01(s[k]);
    den += w[k];
  });
  const base = den ? (num / den) * 100 : 0;
  // rule.weight is a multiplier around 1.0, so an admin can boost a whole rule
  // without rewriting its signal weights.
  return Math.round(Math.max(0, Math.min(100, base * (rule.weight ?? 1))));
}

/** Ratio of "how far past the line" -> 0..1, saturating at `cap`x over. */
export function breachRatio(elapsed: number, threshold: number, cap = 3): number {
  if (threshold <= 0) return 1;
  return clamp01(elapsed / threshold / cap);
}

/** Log-ish normalisation so ₹50L doesn't flatten every other amount to 0. */
export function valueScore(amount: number, ceiling: number): number {
  if (amount <= 0 || ceiling <= 0) return 0;
  return clamp01(Math.log10(1 + amount) / Math.log10(1 + ceiling));
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexes — built once per run so evaluators stay O(n)
// ─────────────────────────────────────────────────────────────────────────────

export type Indexes = {
  usersById: Map<string, User>;
  customersById: Map<string, Customer>;
  customersByRm: Map<string, Customer[]>;
  rmsByManager: Map<string, User[]>;
  eventsByCustomer: Map<string, EventRow[]>;
  eventsByRm: Map<string, EventRow[]>;
  targetByOwner: Map<string, TargetRow>;
  openByKey: Set<string>;
};

export function buildIndexes(ctx: EvaluationContext): Indexes {
  const ix: Indexes = {
    usersById: new Map(), customersById: new Map(), customersByRm: new Map(),
    rmsByManager: new Map(), eventsByCustomer: new Map(), eventsByRm: new Map(),
    targetByOwner: new Map(), openByKey: new Set(),
  };
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
    const arr = m.get(k); arr ? arr.push(v) : m.set(k, [v]);
  };

  ctx.users.forEach(u => {
    ix.usersById.set(u.id, u);
    if (u.role === 'rm' && u.manager_id) push(ix.rmsByManager, u.manager_id, u);
  });
  ctx.customers.forEach(c => {
    ix.customersById.set(c.id, c);
    push(ix.customersByRm, c.rm_id, c);
  });
  ctx.events.forEach(e => {
    if (e.customer_id) push(ix.eventsByCustomer, e.customer_id, e);
    if (e.rm_id) push(ix.eventsByRm, e.rm_id, e);
  });
  ctx.targets.filter(t => t.period === ctx.period)
    .forEach(t => ix.targetByOwner.set(t.owner_id, t));
  ctx.openActions.forEach(a =>
    ix.openByKey.add(dedupeKey(a.source_rule_id ?? a.type, a.rm_id, a.customer_id)));

  return ix;
}

/** Stable across re-runs: same rule + same subject => same key. */
export function dedupeKey(ruleId: string, rmId: string | null, customerId: string | null): string {
  return `${ruleId}:${rmId ?? '-'}:${customerId ?? '-'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived metrics — the single source of truth for both actions and dashboards
// ─────────────────────────────────────────────────────────────────────────────

export type RmMetrics = {
  rm_id: string;
  target_value: number;
  achieved_value: number;
  achieved_pct: number;
  expected_pct: number;
  gap_pct: number;              // positive = behind
  run_rate_projection: number;  // projected end-of-period value
  conversion_rate: number;      // converted / assigned in period
  activity_count: number;       // interactions logged in period
  pipeline_value: number;       // open potential value
  pipeline_coverage: number;    // pipeline / remaining gap
  overdue_actions: number;
  avg_action_age_hours: number;
};

const CONVERSION_EVENTS = new Set(['CONVERSION_COMPLETED', 'CUSTOMER_BECAME_ACTIVE']);
const ACTIVITY_EVENTS = new Set(['CALL_LOGGED', 'MEETING_COMPLETED', 'FOLLOWUP_LOGGED', 'ACTION_COMPLETED']);
const INTENT_EVENTS = new Set(['ENQUIRY_RAISED', 'WEBSITE_ACTIVITY', 'APP_ACTIVITY', 'CAMPAIGN_RESPONSE', 'PRODUCT_INTEREST']);
const OPEN_STAGES = new Set(['new', 'in_progress', 'contacted', 'qualified']);

/** targets v2: rm rows are stored, branch_manager rows are rolled up on read. */
export function resolveAchieved(ownerId: string, ctx: EvaluationContext, ix: Indexes): number {
  const t = ix.targetByOwner.get(ownerId);
  if (!t) return 0;
  if (t.owner_role === 'rm') return Number(t.achieved_value ?? 0);
  return (ix.rmsByManager.get(ownerId) ?? [])
    .reduce((sum, rm) => sum + Number(ix.targetByOwner.get(rm.id)?.achieved_value ?? 0), 0);
}

export function computeRmMetrics(rmId: string, ctx: EvaluationContext, ix: Indexes): RmMetrics {
  const { start, elapsedDays, totalDays, elapsedPct } = periodBounds(ctx.period, ctx.now);
  const target = ix.targetByOwner.get(rmId);
  const targetValue = Number(target?.target_value ?? 0);
  const achieved = resolveAchieved(rmId, ctx, ix);
  const achievedPct = targetValue > 0 ? (achieved / targetValue) * 100 : 0;

  const customers = ix.customersByRm.get(rmId) ?? [];
  const inPeriod = customers.filter(c => new Date(c.assigned_at) >= start);
  const events = (ix.eventsByRm.get(rmId) ?? []).filter(e => new Date(e.created_at) >= start);

  const convertedIds = new Set(
    events.filter(e => CONVERSION_EVENTS.has(e.type) && e.customer_id).map(e => e.customer_id!));
  const conversionRate = inPeriod.length ? convertedIds.size / inPeriod.length : 0;

  const openPipeline = customers.filter(c => OPEN_STAGES.has(c.stage));
  const pipelineValue = openPipeline.reduce((s, c) => s + Number(c.potential_value ?? 0), 0);
  const remainingGap = Math.max(0, targetValue - achieved);

  const mine = ctx.openActions.filter(a => a.rm_id === rmId);
  const overdue = mine.filter(a => a.sla_deadline && new Date(a.sla_deadline) < ctx.now);

  return {
    rm_id: rmId,
    target_value: targetValue,
    achieved_value: achieved,
    achieved_pct: achievedPct,
    expected_pct: elapsedPct,
    gap_pct: elapsedPct - achievedPct,
    run_rate_projection: elapsedDays > 0 ? (achieved / elapsedDays) * totalDays : 0,
    conversion_rate: conversionRate,
    activity_count: events.filter(e => ACTIVITY_EVENTS.has(e.type)).length,
    pipeline_value: pipelineValue,
    pipeline_coverage: remainingGap > 0 ? pipelineValue / remainingGap : Infinity,
    overdue_actions: overdue.length,
    avg_action_age_hours: mine.length
      ? mean(mine.map(a => hoursBetween(a.created_at, ctx.now))) : 0,
  };
}

export type TeamBenchmark = {
  manager_id: string;
  members: RmMetrics[];
  avg_achieved_pct: number;
  median_achieved_pct: number;
  avg_conversion: number;
  median_conversion: number;
  avg_activity: number;
  top_conversion_rm: string | null;
};

export function computeTeamBenchmark(managerId: string, ctx: EvaluationContext, ix: Indexes): TeamBenchmark {
  const members = (ix.rmsByManager.get(managerId) ?? []).map(rm => computeRmMetrics(rm.id, ctx, ix));
  const conv = members.map(m => m.conversion_rate);
  const top = members.length
    ? members.reduce((a, b) => (b.conversion_rate > a.conversion_rate ? b : a))
    : null;
  return {
    manager_id: managerId,
    members,
    avg_achieved_pct: mean(members.map(m => m.achieved_pct)),
    median_achieved_pct: median(members.map(m => m.achieved_pct)),
    avg_conversion: mean(conv),
    median_conversion: median(conv),
    avg_activity: mean(members.map(m => m.activity_count)),
    top_conversion_rm: top && top.conversion_rate > 0 ? top.rm_id : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluators
//
// Uniform signature. Each returns zero or more drafts. None of them touch
// Date.now(), none of them insert anything.
// ─────────────────────────────────────────────────────────────────────────────

export type Evaluator = (ctx: EvaluationContext, rule: Rule, ix: Indexes) => ActionDraft[];

const draft = (
  rule: Rule, rmId: string, customerId: string | null,
  message: string, reason: string, priority: number,
  slaDeadline: string | null = null, eventId: string | null = null,
): ActionDraft => ({
  dedupe_key: dedupeKey(rule.id, rmId, customerId),
  source_rule_id: rule.id,
  source_event_id: eventId,
  customer_id: customerId,
  rm_id: rmId,
  type: rule.action_type,
  message,
  reason,
  priority_score: priority,
  sla_deadline: slaDeadline,
});

const managerOf = (rmId: string, ix: Indexes) => ix.usersById.get(rmId)?.manager_id ?? null;
const nameOf = (id: string, ix: Indexes) => ix.usersById.get(id)?.name ?? 'RM';

// ── 1. Lead not contacted within SLA ────────────────────────────────────────
export const followUpBreach: Evaluator = (ctx, rule, ix) => {
  const slaHours = rule.condition.sla_hours ?? 24;
  const responseHours = rule.condition.response_hours ?? 4;
  const valueCeiling = rule.condition.value_ceiling ?? 1_000_000;

  return ctx.customers.flatMap(c => {
    if (!OPEN_STAGES.has(c.stage)) return [];
    const elapsed = hoursBetween(c.assigned_at, ctx.now);
    const contacted = c.last_contact_at && new Date(c.last_contact_at) > new Date(c.assigned_at);
    if (elapsed <= slaHours || contacted) return [];

    const priority = score(rule, {
      urgency: breachRatio(elapsed, slaHours),
      value: valueScore(c.potential_value, valueCeiling),
      importance: segmentScore(c.segment),
      sla: 1,
      confidence: 1,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: ${elapsed.toFixed(0)}h since assignment, no contact`,
      `SLA of ${slaHours}h breached; ${c.segment ?? 'unsegmented'} lead worth ${money(c.potential_value)}`,
      priority, isoAfter(ctx.now, responseHours))];
  });
};

// ── 2. Pipeline gone cold (contact-anchored, not assignment-anchored) ───────
export const stalePipeline: Evaluator = (ctx, rule, ix) => {
  const staleDays = rule.condition.stale_days ?? 14;
  const minValue = rule.condition.min_value ?? 0;
  const valueCeiling = rule.condition.value_ceiling ?? 1_000_000;

  return ctx.customers.flatMap(c => {
    if (!OPEN_STAGES.has(c.stage) || !c.last_contact_at) return [];
    if (Number(c.potential_value) < minValue) return [];
    const idle = daysBetween(c.last_contact_at, ctx.now);
    if (idle <= staleDays) return [];

    const priority = score(rule, {
      urgency: breachRatio(idle, staleDays),
      value: valueScore(c.potential_value, valueCeiling),
      importance: segmentScore(c.segment),
      sla: 0.3,
      confidence: 0.8,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: no contact in ${idle.toFixed(0)} days`,
      `Open at stage "${c.stage}" past the configured ${staleDays}-day idle limit`,
      priority, isoAfter(ctx.now, rule.condition.response_hours ?? 48))];
  });
};

// ── 3. Pay-in received, no follow-up ────────────────────────────────────────
export const opportunityAtRisk: Evaluator = (ctx, rule, ix) => {
  const windowDays = rule.condition.followup_window_days ?? 3;
  const amountCeiling = rule.condition.amount_ceiling ?? 500_000;
  const trigger = rule.condition.event_type ?? 'PAYIN_RECEIVED';

  const latest = new Map<string, EventRow>();
  ctx.events.filter(e => e.type === trigger && e.customer_id)
    .forEach(e => {
      const prev = latest.get(e.customer_id!);
      if (!prev || new Date(e.created_at) > new Date(prev.created_at)) latest.set(e.customer_id!, e);
    });

  return [...latest.values()].flatMap(e => {
    const c = ix.customersById.get(e.customer_id!);
    if (!c) return [];
    const days = daysBetween(e.created_at, ctx.now);
    const followedUp = c.last_contact_at && new Date(c.last_contact_at) > new Date(e.created_at);
    if (days <= windowDays || followedUp) return [];

    const amount = Number(e.payload?.amount ?? 0);
    const priority = score(rule, {
      urgency: breachRatio(days, windowDays),
      value: valueScore(amount, amountCeiling),
      importance: segmentScore(c.segment),
      sla: 0.8,
      confidence: 1,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: ${money(amount)} pay-in, no follow-up in ${days.toFixed(0)} days`,
      `Cross-sell window of ${windowDays} days elapsed without contact`,
      priority, isoAfter(ctx.now, rule.condition.response_hours ?? 24), e.id)];
  });
};

// ── 4. High-intent customer (digital signal clustering) ─────────────────────
export const highIntent: Evaluator = (ctx, rule, ix) => {
  const windowDays = rule.condition.intent_window_days ?? 7;
  const minSignals = rule.condition.min_signals ?? 3;
  const valueCeiling = rule.condition.value_ceiling ?? 1_000_000;
  const cutoff = new Date(ctx.now.getTime() - windowDays * DAY);

  const byCustomer = new Map<string, EventRow[]>();
  ctx.events.forEach(e => {
    if (!e.customer_id || !INTENT_EVENTS.has(e.type)) return;
    if (new Date(e.created_at) < cutoff) return;
    const arr = byCustomer.get(e.customer_id); arr ? arr.push(e) : byCustomer.set(e.customer_id, [e]);
  });

  return [...byCustomer.entries()].flatMap(([cid, evs]) => {
    if (evs.length < minSignals) return [];
    const c = ix.customersById.get(cid);
    if (!c || !OPEN_STAGES.has(c.stage)) return [];
    const last = evs.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a));
    if (c.last_contact_at && new Date(c.last_contact_at) > new Date(last.created_at)) return [];

    const kinds = new Set(evs.map(e => e.type));
    const priority = score(rule, {
      urgency: clamp01(evs.length / (minSignals * 2)),
      value: valueScore(c.potential_value, valueCeiling),
      importance: segmentScore(c.segment),
      sla: 0.6,
      confidence: clamp01(kinds.size / 3),   // varied signals ⇒ stronger evidence
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: ${evs.length} intent signals in ${windowDays} days`,
      `${[...kinds].join(', ')} — above the configured ${minSignals}-signal threshold, no contact since`,
      priority, isoAfter(ctx.now, rule.condition.response_hours ?? 8), last.id)];
  });
};

// ── 5. Meeting completed but no outcome / no next step ──────────────────────
export const meetingWithoutOutcome: Evaluator = (ctx, rule, ix) => {
  const graceHours = rule.condition.grace_hours ?? 24;
  return ctx.events.flatMap(e => {
    if (e.type !== 'MEETING_COMPLETED' || !e.customer_id) return [];
    if (hoursBetween(e.created_at, ctx.now) <= graceHours) return [];
    const hasOutcome = e.payload?.outcome != null && String(e.payload.outcome).length > 0;
    const c = ix.customersById.get(e.customer_id);
    if (!c || (hasOutcome && c.next_followup_at)) return [];

    const priority = score(rule, {
      urgency: breachRatio(hoursBetween(e.created_at, ctx.now), graceHours),
      value: valueScore(c.potential_value, rule.condition.value_ceiling ?? 1_000_000),
      importance: segmentScore(c.segment),
      sla: 0.5,
      confidence: 0.9,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: meeting logged, ${hasOutcome ? 'no next step scheduled' : 'no outcome recorded'}`,
      `Meeting closed ${hoursBetween(e.created_at, ctx.now).toFixed(0)}h ago; pipeline state is unresolved`,
      priority, isoAfter(ctx.now, 12), e.id)];
  });
};

// ── 6. Dormant customer worth reactivating ──────────────────────────────────
export const dormantReactivation: Evaluator = (ctx, rule, ix) => {
  const dormantDays = rule.condition.dormant_days ?? 90;
  const minValue = rule.condition.min_value ?? 100_000;
  return ctx.customers.flatMap(c => {
    if (c.stage !== 'active' && c.stage !== 'converted') return [];
    if (Number(c.potential_value) < minValue) return [];
    const evs = ix.eventsByCustomer.get(c.id) ?? [];
    const lastTouch = [c.last_contact_at, ...evs.map(e => e.created_at)]
      .filter(Boolean).sort().pop();
    if (!lastTouch) return [];
    const idle = daysBetween(lastTouch, ctx.now);
    if (idle <= dormantDays) return [];

    const priority = score(rule, {
      urgency: breachRatio(idle, dormantDays, 2),
      value: valueScore(c.potential_value, rule.condition.value_ceiling ?? 1_000_000),
      importance: segmentScore(c.segment),
      sla: 0.2,
      confidence: 0.7,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: dormant ${idle.toFixed(0)} days (${money(c.potential_value)} relationship)`,
      `No activity past the configured ${dormantDays}-day dormancy window`,
      priority, isoAfter(ctx.now, rule.condition.response_hours ?? 72))];
  });
};

// ── 7. Cross-sell opportunity ───────────────────────────────────────────────
export const crossSell: Evaluator = (ctx, rule, ix) => {
  const maxHoldings = rule.condition.max_holdings ?? 1;
  const windowDays = rule.condition.window_days ?? 30;
  const cutoff = new Date(ctx.now.getTime() - windowDays * DAY);

  const recentBuyers = new Map<string, EventRow>();
  ctx.events.forEach(e => {
    if (!e.customer_id) return;
    if (e.type !== 'PRODUCT_PURCHASED' && e.type !== 'CONVERSION_COMPLETED') return;
    if (new Date(e.created_at) < cutoff) return;
    const prev = recentBuyers.get(e.customer_id);
    if (!prev || new Date(e.created_at) > new Date(prev.created_at)) recentBuyers.set(e.customer_id, e);
  });

  return [...recentBuyers.entries()].flatMap(([cid, e]) => {
    const c = ix.customersById.get(cid);
    if (!c) return [];
    const holdings = Number(e.payload?.product_count ?? e.payload?.holdings ?? 1);
    if (holdings > maxHoldings) return [];

    const priority = score(rule, {
      urgency: 0.4,
      value: valueScore(c.potential_value, rule.condition.value_ceiling ?? 1_000_000),
      importance: segmentScore(c.segment),
      sla: 0.3,
      confidence: 0.6,
    });
    return [draft(rule, c.rm_id, c.id,
      `${c.name}: single-product holder, bought ${daysBetween(e.created_at, ctx.now).toFixed(0)} days ago`,
      `Holds ${holdings} product(s), at/below the configured ${maxHoldings}-product cross-sell trigger`,
      priority, null, e.id)];
  });
};

// ── 8. Target gap vs expected run-rate ──────────────────────────────────────
export const targetGap: Evaluator = (ctx, rule, ix) => {
  const threshold = rule.condition.gap_threshold_pct ?? 15;
  return ctx.users.filter(u => u.role === 'rm').flatMap(u => {
    const m = computeRmMetrics(u.id, ctx, ix);
    if (m.target_value <= 0 || m.gap_pct <= threshold) return [];

    const priority = score(rule, {
      urgency: clamp01(m.gap_pct / (threshold * 3)),
      value: valueScore(m.target_value - m.achieved_value, m.target_value || 1),
      importance: 0.7,
      sla: clamp01(m.expected_pct / 100),   // later in the period ⇒ more urgent
      confidence: 1,
    });
    const pipelineNote = m.pipeline_coverage < 1
      ? `pipeline covers only ${(m.pipeline_coverage * 100).toFixed(0)}% of the remaining gap`
      : `pipeline of ${money(m.pipeline_value)} can cover the gap`;

    return [draft(rule, u.id, null,
      `At ${m.achieved_pct.toFixed(0)}% of target vs ${m.expected_pct.toFixed(0)}% expected`,
      `${m.gap_pct.toFixed(0)}-point gap exceeds the configured ${threshold}-point threshold; ` +
      `${pipelineNote}; ${m.overdue_actions} overdue action(s)`,
      priority)];
  });
};

// ── 9. Escalation: breach still open past escalation window → manager ───────
export const escalatedBreach: Evaluator = (ctx, rule, ix) => {
  const escalationHours = rule.condition.escalation_hours ?? 48;
  const watchedTypes: string[] = rule.condition.watch_action_types
    ?? ['follow_up_breach', 'opportunity_at_risk'];

  return ctx.openActions.flatMap(a => {
    if (!watchedTypes.includes(a.type) || !a.rm_id) return [];
    const age = hoursBetween(a.created_at, ctx.now);
    if (age <= escalationHours) return [];
    const mgr = managerOf(a.rm_id, ix);
    if (!mgr) return [];
    const c = a.customer_id ? ix.customersById.get(a.customer_id) : null;

    const priority = score(rule, {
      urgency: breachRatio(age, escalationHours),
      value: c ? valueScore(c.potential_value, rule.condition.value_ceiling ?? 1_000_000) : 0.5,
      importance: c ? segmentScore(c.segment) : 0.6,
      sla: 1,
      confidence: 1,
    });
    return [{
      ...draft(rule, mgr, a.customer_id,
        `${nameOf(a.rm_id, ix)}: "${a.type}" unactioned for ${age.toFixed(0)}h`,
        `Past the configured ${escalationHours}-h escalation window${c ? ` on ${c.name}` : ''}`,
        priority, isoAfter(ctx.now, rule.condition.response_hours ?? 12)),
      // key on the underlying action so one breach escalates once
      dedupe_key: dedupeKey(rule.id, mgr, a.id),
    }];
  });
};

// ── 10. Conversion falling behind the team ──────────────────────────────────
export const conversionBelowBenchmark: Evaluator = (ctx, rule, ix) => {
  const dropPct = rule.condition.below_benchmark_pct ?? 25;
  const minSample = rule.condition.min_customers ?? 5;
  const basis = rule.condition.benchmark_basis ?? 'median';

  return ctx.users.filter(u => u.role === 'branch_manager').flatMap(mgr => {
    const bench = computeTeamBenchmark(mgr.id, ctx, ix);
    const reference = basis === 'mean' ? bench.avg_conversion : bench.median_conversion;
    if (reference <= 0) return [];

    return bench.members.flatMap(m => {
      const customers = (ix.customersByRm.get(m.rm_id) ?? []).length;
      if (customers < minSample) return [];
      const shortfall = ((reference - m.conversion_rate) / reference) * 100;
      if (shortfall <= dropPct) return [];

      const priority = score(rule, {
        urgency: clamp01(shortfall / (dropPct * 2)),
        value: valueScore(m.target_value - m.achieved_value, m.target_value || 1),
        importance: 0.6,
        sla: 0.4,
        confidence: clamp01(customers / (minSample * 2)),
      });
      return [draft(rule, mgr.id, null,
        `${nameOf(m.rm_id, ix)}: conversion ${(m.conversion_rate * 100).toFixed(0)}% vs team ${basis} ${(reference * 100).toFixed(0)}%`,
        `${shortfall.toFixed(0)}% below the team ${basis} over ${customers} customers, ` +
        `with ${m.activity_count} activities logged (team avg ${bench.avg_activity.toFixed(0)})`,
        priority)];
    });
  });
};

// ── 11. Weak pipeline coverage ──────────────────────────────────────────────
export const weakPipeline: Evaluator = (ctx, rule, ix) => {
  const minCoverage = rule.condition.min_coverage ?? 1.5;
  const minElapsedPct = rule.condition.min_elapsed_pct ?? 40;
  const { elapsedPct } = periodBounds(ctx.period, ctx.now);
  if (elapsedPct < minElapsedPct) return [];

  return ctx.users.filter(u => u.role === 'rm').flatMap(u => {
    const m = computeRmMetrics(u.id, ctx, ix);
    if (m.target_value <= 0 || !isFinite(m.pipeline_coverage)) return [];
    if (m.pipeline_coverage >= minCoverage) return [];
    const mgr = managerOf(u.id, ix);
    if (!mgr) return [];

    const priority = score(rule, {
      urgency: clamp01(1 - m.pipeline_coverage / minCoverage),
      value: valueScore(m.target_value - m.achieved_value, m.target_value || 1),
      importance: 0.7,
      sla: clamp01(elapsedPct / 100),
      confidence: 0.9,
    });
    return [draft(rule, mgr, null,
      `${nameOf(u.id, ix)}: pipeline coverage ${m.pipeline_coverage.toFixed(2)}x`,
      `${money(m.pipeline_value)} open against a ${money(m.target_value - m.achieved_value)} gap, ` +
      `below the configured ${minCoverage}x floor at ${elapsedPct.toFixed(0)}% of the period`,
      priority)];
  });
};

// ── 12. Overdue action backlog ──────────────────────────────────────────────
export const overdueBacklog: Evaluator = (ctx, rule, ix) => {
  const maxOverdue = rule.condition.max_overdue ?? 5;
  return ctx.users.filter(u => u.role === 'rm').flatMap(u => {
    const m = computeRmMetrics(u.id, ctx, ix);
    if (m.overdue_actions <= maxOverdue) return [];
    const mgr = managerOf(u.id, ix);
    if (!mgr) return [];

    const priority = score(rule, {
      urgency: clamp01(m.overdue_actions / (maxOverdue * 2)),
      value: 0.5,
      importance: 0.6,
      sla: 1,
      confidence: 1,
    });
    return [draft(rule, mgr, null,
      `${nameOf(u.id, ix)}: ${m.overdue_actions} actions past SLA`,
      `Above the configured limit of ${maxOverdue}; average action age ${m.avg_action_age_hours.toFixed(0)}h`,
      priority)];
  });
};

// ── 13. High-value opportunity nobody has touched ───────────────────────────
export const unactionedHighValue: Evaluator = (ctx, rule, ix) => {
  const minValue = rule.condition.min_value ?? 1_000_000;
  const ageHours = rule.condition.age_hours ?? 72;

  return ctx.openActions.flatMap(a => {
    if (!a.customer_id || !a.rm_id) return [];
    const c = ix.customersById.get(a.customer_id);
    if (!c || Number(c.potential_value) < minValue) return [];
    const age = hoursBetween(a.created_at, ctx.now);
    if (age <= ageHours) return [];
    const mgr = managerOf(a.rm_id, ix);
    if (!mgr) return [];

    const priority = score(rule, {
      urgency: breachRatio(age, ageHours),
      value: valueScore(c.potential_value, rule.condition.value_ceiling ?? 5_000_000),
      importance: segmentScore(c.segment),
      sla: 1,
      confidence: 1,
    });
    return [{
      ...draft(rule, mgr, a.customer_id,
        `${money(c.potential_value)} opportunity (${c.name}) untouched ${age.toFixed(0)}h`,
        `Assigned to ${nameOf(a.rm_id, ix)}; above the ${money(minValue)} threshold and past ${ageHours}h`,
        priority, isoAfter(ctx.now, 12)),
      dedupe_key: dedupeKey(rule.id, mgr, a.id),
    }];
  });
};

// ── 14. Target achievement milestone ────────────────────────────────────────
export const targetAchievement: Evaluator = (ctx, rule, ix) => {
  const milestone = rule.condition.achievement_pct ?? 120;
  return ctx.users.filter(u => u.role === 'rm').flatMap(u => {
    const m = computeRmMetrics(u.id, ctx, ix);
    if (m.target_value <= 0 || m.achieved_pct < milestone) return [];
    const priority = score(rule, {
      urgency: 0.2, value: clamp01(m.achieved_pct / 200),
      importance: 0.5, sla: 0, confidence: 1,
    });
    return [draft(rule, u.id, null,
      `${nameOf(u.id, ix)} crossed ${m.achieved_pct.toFixed(0)}% of target`,
      `At/above the configured ${milestone}% milestone with ${money(m.achieved_value)} achieved`,
      priority)];
  });
};

// ── 15. Early achievement (100% well before period end) ─────────────────────
export const earlyAchievement: Evaluator = (ctx, rule, ix) => {
  const leadPct = rule.condition.lead_pct ?? 20;   // finished ≥20 points early
  return ctx.users.filter(u => u.role === 'rm').flatMap(u => {
    const m = computeRmMetrics(u.id, ctx, ix);
    if (m.target_value <= 0 || m.achieved_pct < 100) return [];
    if (m.expected_pct > 100 - leadPct) return [];
    const priority = score(rule, {
      urgency: 0.2, value: clamp01((100 - m.expected_pct) / 100),
      importance: 0.6, sla: 0, confidence: 1,
    });
    return [draft(rule, u.id, null,
      `${nameOf(u.id, ix)} hit 100% with ${(100 - m.expected_pct).toFixed(0)}% of the period left`,
      `Target met at ${m.expected_pct.toFixed(0)}% elapsed; projected close ${money(m.run_rate_projection)}`,
      priority)];
  });
};

// ── 16. Best conversion in team ─────────────────────────────────────────────
export const topConversion: Evaluator = (ctx, rule, ix) => {
  const minLead = rule.condition.min_lead_pct ?? 20;
  const minSample = rule.condition.min_customers ?? 5;

  return ctx.users.filter(u => u.role === 'branch_manager').flatMap(mgr => {
    const bench = computeTeamBenchmark(mgr.id, ctx, ix);
    if (!bench.top_conversion_rm || bench.members.length < 2) return [];
    const top = bench.members.find(m => m.rm_id === bench.top_conversion_rm)!;
    if ((ix.customersByRm.get(top.rm_id) ?? []).length < minSample) return [];
    const lead = ((top.conversion_rate - bench.median_conversion) / (bench.median_conversion || 1)) * 100;
    if (lead < minLead) return [];

    const priority = score(rule, {
      urgency: 0.2, value: clamp01(top.conversion_rate),
      importance: 0.5, sla: 0, confidence: 1,
    });
    return [draft(rule, top.rm_id, null,
      `Best team conversion: ${(top.conversion_rate * 100).toFixed(0)}%`,
      `${lead.toFixed(0)}% above the team median of ${(bench.median_conversion * 100).toFixed(0)}%`,
      priority)];
  });
};

// ── 17. Major win ───────────────────────────────────────────────────────────
export const majorWin: Evaluator = (ctx, rule, ix) => {
  const minAmount = rule.condition.min_amount ?? 1_000_000;
  return ctx.events.flatMap(e => {
    if (e.type !== 'PAYIN_RECEIVED' && e.type !== 'CONVERSION_COMPLETED') return [];
    const amount = Number(e.payload?.amount ?? 0);
    if (amount < minAmount || !e.rm_id) return [];
    const c = e.customer_id ? ix.customersById.get(e.customer_id) : null;
    const priority = score(rule, {
      urgency: 0.2, value: valueScore(amount, rule.condition.value_ceiling ?? 10_000_000),
      importance: c ? segmentScore(c.segment) : 0.5, sla: 0, confidence: 1,
    });
    return [{
      ...draft(rule, e.rm_id, e.customer_id,
        `Major win: ${money(amount)}${c ? ` from ${c.name}` : ''}`,
        `Above the configured ${money(minAmount)} major-win threshold`,
        priority, null, e.id),
      dedupe_key: dedupeKey(rule.id, e.rm_id, e.id),
    }];
  });
};

// ── 18. Dormant customer recovered ──────────────────────────────────────────
export const dormantRecovery: Evaluator = (ctx, rule, ix) => {
  const dormantDays = rule.condition.dormant_days ?? 90;
  return ctx.events.flatMap(e => {
    if (e.type !== 'PAYIN_RECEIVED' && e.type !== 'CUSTOMER_BECAME_ACTIVE') return [];
    if (!e.customer_id || !e.rm_id) return [];
    const prior = (ix.eventsByCustomer.get(e.customer_id) ?? [])
      .filter(p => new Date(p.created_at) < new Date(e.created_at))
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const last = prior[prior.length - 1];
    if (!last) return [];
    const gap = daysBetween(last.created_at, e.created_at);
    if (gap < dormantDays) return [];

    const c = ix.customersById.get(e.customer_id);
    const priority = score(rule, {
      urgency: 0.2, value: valueScore(Number(e.payload?.amount ?? 0), 1_000_000),
      importance: c ? segmentScore(c.segment) : 0.5, sla: 0, confidence: 0.9,
    });
    return [{
      ...draft(rule, e.rm_id, e.customer_id,
        `Dormant customer recovered${c ? `: ${c.name}` : ''} after ${gap.toFixed(0)} days`,
        `Re-engaged past the configured ${dormantDays}-day dormancy line`,
        priority, null, e.id),
      dedupe_key: dedupeKey(rule.id, e.rm_id, e.customer_id),
    }];
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + runner
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTRY: Record<string, Evaluator> = {
  follow_up_breach: followUpBreach,
  stale_pipeline: stalePipeline,
  opportunity_at_risk: opportunityAtRisk,
  high_intent: highIntent,
  meeting_no_outcome: meetingWithoutOutcome,
  dormant_reactivation: dormantReactivation,
  cross_sell: crossSell,
  target_gap: targetGap,
  escalated_breach: escalatedBreach,
  conversion_below_benchmark: conversionBelowBenchmark,
  weak_pipeline: weakPipeline,
  overdue_backlog: overdueBacklog,
  unactioned_high_value: unactionedHighValue,
  target_achievement: targetAchievement,
  early_achievement: earlyAchievement,
  top_conversion: topConversion,
  major_win: majorWin,
  dormant_recovery: dormantRecovery,
};

export type RunResult = {
  drafts: ActionDraft[];
  skipped_duplicates: number;
  per_rule: Record<string, number>;
  errors: { rule_id: string; message: string }[];
};

/**
 * Run every active, in-effect rule. Idempotent: a draft whose dedupe_key
 * matches an existing open/snoozed action is dropped, so the same event
 * batch can be replayed safely.
 */
export function runRules(ctx: EvaluationContext, rules: Rule[]): RunResult {
  const ix = buildIndexes(ctx);
  const out: ActionDraft[] = [];
  const seen = new Set<string>();
  const per_rule: Record<string, number> = {};
  const errors: RunResult['errors'] = [];
  let skipped = 0;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.effective_date && new Date(rule.effective_date) > ctx.now) continue;
    const evaluator = REGISTRY[rule.action_type];
    if (!evaluator) { errors.push({ rule_id: rule.id, message: `no evaluator for "${rule.action_type}"` }); continue; }

    try {
      for (const d of evaluator(ctx, rule, ix)) {
        if (ix.openByKey.has(d.dedupe_key) || seen.has(d.dedupe_key)) { skipped++; continue; }
        seen.add(d.dedupe_key);
        out.push(d);
        per_rule[rule.id] = (per_rule[rule.id] ?? 0) + 1;
      }
    } catch (err: any) {
      errors.push({ rule_id: rule.id, message: err?.message ?? String(err) });
    }
  }

  out.sort((a, b) => b.priority_score - a.priority_score);
  return { drafts: out, skipped_duplicates: skipped, per_rule, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation — "change an SLA during judging and show the feed change"
// ─────────────────────────────────────────────────────────────────────────────

export type SimulationDiff = {
  before: number;
  after: number;
  added: ActionDraft[];
  removed: string[];          // dedupe_keys that would no longer fire
  score_shifts: { dedupe_key: string; from: number; to: number }[];
};

/** Re-runs the *same* evaluators with a proposed condition swapped in, so the
 *  simulator can never drift from the live engine. */
export function simulateRuleChange(
  ctx: EvaluationContext, rules: Rule[], ruleId: string, proposed: Json, proposedWeight?: number,
): SimulationDiff {
  const ix = buildIndexes(ctx);
  const original = rules.find(r => r.id === ruleId);
  if (!original) return { before: 0, after: 0, added: [], removed: [], score_shifts: [] };

  const modified: Rule = {
    ...original,
    condition: { ...original.condition, ...proposed },
    weight: proposedWeight ?? original.weight,
  };
  const evaluator = REGISTRY[original.action_type];
  if (!evaluator) return { before: 0, after: 0, added: [], removed: [], score_shifts: [] };

  const before = evaluator(ctx, original, ix);
  const after = evaluator(ctx, modified, ix);
  const beforeMap = new Map(before.map(d => [d.dedupe_key, d]));
  const afterMap = new Map(after.map(d => [d.dedupe_key, d]));

  return {
    before: before.length,
    after: after.length,
    added: after.filter(d => !beforeMap.has(d.dedupe_key)),
    removed: before.filter(d => !afterMap.has(d.dedupe_key)).map(d => d.dedupe_key),
    score_shifts: after
      .filter(d => beforeMap.has(d.dedupe_key) && beforeMap.get(d.dedupe_key)!.priority_score !== d.priority_score)
      .map(d => ({ dedupe_key: d.dedupe_key, from: beforeMap.get(d.dedupe_key)!.priority_score, to: d.priority_score })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Closed loop + effectiveness
// ─────────────────────────────────────────────────────────────────────────────

export type Outcome = 'converted' | 'contacted' | 'no_answer' | 'not_interested' | 'deferred';

/** What the API layer should write when an RM closes an action. Returned as
 *  plain objects so the caller owns the transaction. */
export function closeAction(
  action: ActionRow, outcome: Outcome, actorId: string, now: Date, note?: string,
) {
  return {
    actionUpdate: { id: action.id, status: 'done', updated_at: now.toISOString() },
    event: {
      type: 'ACTION_COMPLETED',
      customer_id: action.customer_id,
      rm_id: action.rm_id,
      payload: { action_id: action.id, source_rule_id: action.source_rule_id, outcome, note: note ?? null },
    },
    customerUpdate: action.customer_id
      ? { id: action.customer_id, last_contact_at: now.toISOString() }
      : null,
    audit: {
      actor_id: actorId, action: 'action.close', entity_type: 'actions', entity_id: action.id,
      before: { status: action.status }, after: { status: 'done', outcome },
    },
  };
}

export function snoozeAction(action: ActionRow, until: Date, actorId: string, now: Date) {
  return {
    // sla_deadline doubles as the wake-up time; dedup treats snoozed as present
    actionUpdate: { id: action.id, status: 'snoozed', sla_deadline: until.toISOString(), updated_at: now.toISOString() },
    audit: {
      actor_id: actorId, action: 'action.snooze', entity_type: 'actions', entity_id: action.id,
      before: { status: action.status, sla_deadline: action.sla_deadline },
      after: { status: 'snoozed', sla_deadline: until.toISOString() },
    },
  };
}

export function reassignAction(action: ActionRow, toRmId: string, actorId: string, now: Date) {
  return {
    actionUpdate: { id: action.id, rm_id: toRmId, updated_at: now.toISOString() },
    audit: {
      actor_id: actorId, action: 'action.reassign', entity_type: 'actions', entity_id: action.id,
      before: { rm_id: action.rm_id }, after: { rm_id: toRmId },
    },
  };
}

export type RuleEffectiveness = {
  rule_id: string;
  generated: number;
  completed: number;
  converted: number;
  completion_rate: number;
  conversion_rate: number;   // of completed actions, how many led to conversion
};

/** Which recommendations actually led somewhere. Joins ACTION_COMPLETED events
 *  back to their source rule via payload. */
export function ruleEffectiveness(allActions: ActionRow[], events: EventRow[]): RuleEffectiveness[] {
  const gen = new Map<string, number>();
  allActions.forEach(a => {
    if (!a.source_rule_id) return;
    gen.set(a.source_rule_id, (gen.get(a.source_rule_id) ?? 0) + 1);
  });

  const done = new Map<string, number>();
  const won = new Map<string, number>();
  events.filter(e => e.type === 'ACTION_COMPLETED').forEach(e => {
    const rid = e.payload?.source_rule_id;
    if (!rid) return;
    done.set(rid, (done.get(rid) ?? 0) + 1);
    if (e.payload?.outcome === 'converted') won.set(rid, (won.get(rid) ?? 0) + 1);
  });

  return [...gen.entries()].map(([rule_id, generated]) => {
    const completed = done.get(rule_id) ?? 0;
    const converted = won.get(rule_id) ?? 0;
    return {
      rule_id, generated, completed, converted,
      completion_rate: generated ? completed / generated : 0,
      conversion_rate: completed ? converted / completed : 0,
    };
  }).sort((a, b) => b.conversion_rate - a.conversion_rate);
}
