/**
 * The customer book as the Customers & Leads table reads it. Pure functions
 * only: `lib/queries/rm.ts` maps rows through these once on the server and the
 * table renders what it is given, so a customer's tier and status can never
 * mean one thing here and another on the dashboard.
 */

import { num } from "@/lib/format";
import { HIGH_VALUE_FLOOR, type EntityKind } from "@/lib/opportunity";

/* ── Tier ───────────────────────────────────────────────────────────────── */

export type Tier = 1 | 2 | 3;

/**
 * Tier is a read of potential value, not a column. Tier 1 starts exactly where
 * the action queue already stamps a deal "High Value" so the two agree.
 */
export const TIER_FLOOR: Record<Tier, number> = {
  1: HIGH_VALUE_FLOOR,
  2: 200_000,
  3: 0,
};

export const TIERS: Tier[] = [1, 2, 3];

export function tierOf(potentialValue: unknown): Tier {
  const v = num(potentialValue);
  if (v >= TIER_FLOOR[1]) return 1;
  if (v >= TIER_FLOOR[2]) return 2;
  return 3;
}

export const TIER_CLASS: Record<Tier, string> = {
  1: "bg-primary/10 text-primary",
  2: "bg-surface-container-high text-on-surface-variant",
  3: "bg-surface-container text-on-surface-variant",
};

/* ── Status ─────────────────────────────────────────────────────────────── */

export type CustomerStatus = "at_risk" | "active" | "nurturing" | "new";

export const STATUS_META: Record<
  CustomerStatus,
  { label: string; dot: string; text: string }
> = {
  at_risk: { label: "At Risk", dot: "bg-error", text: "text-error" },
  active: { label: "Active", dot: "bg-tertiary", text: "text-tertiary" },
  nurturing: { label: "Nurturing", dot: "bg-primary-fixed-dim", text: "text-on-surface-variant" },
  new: { label: "New", dot: "bg-outline-variant", text: "text-on-surface-variant" },
};

export const STATUSES: CustomerStatus[] = ["at_risk", "active", "nurturing", "new"];

/**
 * "At risk" outranks the pipeline stage: an overdue action or a follow-up date
 * that has come and gone is the thing the RM needs to see, whatever stage the
 * record sits in.
 */
export function statusOf(row: {
  stage: string;
  overdue_actions: number;
  next_followup_at: string | null;
  now?: number;
}): CustomerStatus {
  const now = row.now ?? Date.now();
  const followupOverdue =
    row.next_followup_at !== null && new Date(row.next_followup_at).getTime() < now;
  if (row.overdue_actions > 0 || followupOverdue) return "at_risk";
  if (row.stage === "active") return "active";
  if (row.stage === "in_progress") return "nurturing";
  return "new";
}

/* ── Row shape ──────────────────────────────────────────────────────────── */

export type BookCustomer = {
  id: string;
  /** Short quotable handle, e.g. "CUS-4821". Derived from the UUID. */
  ref: string;
  name: string;
  segment: string | null;
  stage: string;
  entity: EntityKind;
  tier: Tier;
  status: CustomerStatus;
  potential_value: number;
  lead_source: string | null;
  mobile: string | null;
  email: string | null;
  assigned_at: string;
  last_contact_at: string | null;
  next_followup_at: string | null;
  open_actions: number;
  overdue_actions: number;
};

/** Mirrors `oppRef` in lib/opportunity.ts — stable, no extra column needed. */
export function customerRef(id: string): string {
  const hex = (id ?? "").replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex || "0", 16);
  return `CUS-${1000 + (n % 9000)}`;
}

/* ── Filter vocabulary shared by the toolbar ────────────────────────────── */

export type EntityFilter = "all" | "lead" | "client";

export const ENTITY_FILTERS: { key: EntityFilter; label: string }[] = [
  { key: "all", label: "All Contacts" },
  { key: "lead", label: "Leads" },
  { key: "client", label: "Clients" },
];

export type SortKey = "value" | "contacted" | "name";

/** Sorts the table can apply. Value-desc is the default, as the query returns. */
export function sortBook(rows: BookCustomer[], key: SortKey, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case "name":
        return sign * a.name.localeCompare(b.name);
      case "contacted": {
        // Never-contacted sorts as the oldest possible contact, not as "now".
        const at = a.last_contact_at ? +new Date(a.last_contact_at) : 0;
        const bt = b.last_contact_at ? +new Date(b.last_contact_at) : 0;
        return sign * (at - bt);
      }
      default:
        return sign * (a.potential_value - b.potential_value);
    }
  });
  return sorted;
}
