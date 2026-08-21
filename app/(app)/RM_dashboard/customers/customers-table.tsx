"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatINR, formatRelative, humanise, initials } from "@/lib/format";
import { ENTITY_LABEL } from "@/lib/opportunity";
import {
  ENTITY_FILTERS,
  STATUSES,
  STATUS_META,
  TIERS,
  TIER_CLASS,
  sortBook,
  type BookCustomer,
  type CustomerStatus,
  type EntityFilter,
  type SortKey,
  type Tier,
} from "@/lib/customer";
import ReviewDrawer from "../review-drawer";
import NewRecordDialog from "./new-record-dialog";

/**
 * Customers & Leads — the RM's whole book in one table.
 *
 * The server hands down every row it is allowed to see, so search, filtering,
 * sorting and paging all happen here against that array. Nothing in this file
 * decides what a tier or a status *means*; those come pre-derived from
 * lib/customer.ts so this table and the dashboard can never disagree.
 */

const PAGE_SIZE = 10;

const AVATAR_CLASS: Record<Tier, string> = {
  1: "bg-primary text-on-primary",
  2: "bg-secondary-container text-on-secondary-fixed",
  3: "bg-surface-container-high text-on-surface-variant",
};

const ENTITY_CHIP: Record<string, string> = {
  lead: "bg-surface-container-high text-on-surface-variant",
  client: "bg-primary/10 text-primary",
  portfolio: "bg-tertiary/10 text-tertiary",
};

export default function CustomersTable({ initial }: { initial: BookCustomer[] }) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState<EntityFilter>("all");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [segments, setSegments] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<CustomerStatus[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "value",
    dir: "desc",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  // The drawer's clock is stamped when it opens rather than read during render.
  const [viewing, setViewing] = useState<{ id: string; at: number } | null>(null);
  const [creating, setCreating] = useState(false);

  /** Any change to what's being filtered has to drop you back to page one. */
  const reset = useCallback(<T,>(set: (v: T) => void) => {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }, []);

  const segmentOptions = useMemo(
    () =>
      Array.from(new Set(initial.map((c) => c.segment).filter((s): s is string => Boolean(s)))).sort(),
    [initial]
  );

  const filtered = useMemo(() => {
    // Refs render as "#CUS-4821", so a pasted ref keeps its hash. Drop it.
    const q = query.trim().replace(/^#/, "").toLowerCase();
    return initial.filter((c) => {
      if (entity !== "all" && c.entity !== entity) return false;
      if (tiers.length > 0 && !tiers.includes(c.tier)) return false;
      if (segments.length > 0 && !(c.segment && segments.includes(c.segment))) return false;
      if (statuses.length > 0 && !statuses.includes(c.status)) return false;
      if (!q) return true;
      return [c.name, c.ref, c.segment, c.email, c.mobile, c.lead_source]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [initial, query, entity, tiers, segments, statuses]);

  const sorted = useMemo(() => sortBook(filtered, sort.key, sort.dir), [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const rows = sorted.slice(start, start + PAGE_SIZE);

  const activeFilters =
    tiers.length + segments.length + statuses.length + (entity === "all" ? 0 : 1);

  const clearFilters = () => {
    setQuery("");
    setEntity("all");
    setTiers([]);
    setSegments([]);
    setStatuses([]);
    setPage(1);
  };

  /* ── Selection ─────────────────────────────────────────────────────────── */

  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someOnPageSelected = pageIds.some((id) => selected.includes(id));

  const toggleRow = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const togglePage = () =>
    setSelected((cur) =>
      allOnPageSelected
        ? cur.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...cur, ...pageIds]))
    );

  const exportSelected = () => {
    const chosen = initial.filter((c) => selected.includes(c.id));
    if (chosen.length === 0) return;
    const header = [
      "Ref",
      "Name",
      "Segment",
      "Tier",
      "Status",
      "Potential value",
      "Last contacted",
      "Mobile",
      "Email",
    ];
    const body = chosen.map((c) => [
      c.ref,
      c.name,
      c.segment ?? "",
      `Tier ${c.tier}`,
      STATUS_META[c.status].label,
      c.potential_value,
      c.last_contact_at ?? "",
      c.mobile ?? "",
      c.email ?? "",
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${chosen.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Sorting ───────────────────────────────────────────────────────────── */

  const toggleSort = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : // First click on a new column shows the interesting end: biggest
          // deals, but the customers you have gone longest without calling.
          { key, dir: key === "contacted" ? "asc" : key === "name" ? "asc" : "desc" }
    );
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-lg p-lg">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="max-w-2xl">
          <h1 className="font-display-lg text-on-surface">Customers &amp; Leads</h1>
          <p className="mt-xxs font-body-md text-on-surface-variant">
            Your assigned book — every active relationship, open opportunity and
            lead you own, ranked by what they are worth.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-xs rounded-lg bg-primary-container px-md py-sm font-body-md font-semibold text-on-primary-container shadow-sm transition-colors hover:bg-primary"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          New Record
        </button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-sm shadow-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <div className="relative min-w-[240px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
              search
            </span>
            <input
              value={query}
              onChange={(e) => reset(setQuery)(e.target.value)}
              type="search"
              placeholder="Search by name, segment, or ID…"
              aria-label="Search the customer book"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-xs pl-10 pr-md font-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-xxs">
            {ENTITY_FILTERS.map((f) => (
              <Pill
                key={f.key}
                active={entity === f.key}
                onClick={() => reset(setEntity)(f.key)}
              >
                {f.label}
              </Pill>
            ))}
          </div>

          <div className="h-6 w-px bg-outline-variant" />

          <div className="flex items-center gap-xxs">
            {TIERS.map((t) => (
              <Pill
                key={t}
                active={tiers.includes(t)}
                onClick={() =>
                  reset(setTiers)(
                    tiers.includes(t) ? tiers.filter((x) => x !== t) : [...tiers, t]
                  )
                }
              >
                Tier {t}
              </Pill>
            ))}
          </div>

          <button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-label="More filters"
            className={cn(
              "relative ml-auto rounded-lg border p-xs transition-colors",
              filtersOpen || segments.length + statuses.length > 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
            {segments.length + statuses.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
                {segments.length + statuses.length}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-sm grid gap-sm border-t border-outline-variant/40 pt-sm sm:grid-cols-2">
            <FilterGroup label="Segment">
              {segmentOptions.length === 0 && (
                <span className="font-body-sm text-on-surface-variant">
                  No segments on this book yet.
                </span>
              )}
              {segmentOptions.map((s) => (
                <Pill
                  key={s}
                  active={segments.includes(s)}
                  onClick={() =>
                    reset(setSegments)(
                      segments.includes(s)
                        ? segments.filter((x) => x !== s)
                        : [...segments, s]
                    )
                  }
                >
                  {humanise(s)}
                </Pill>
              ))}
            </FilterGroup>

            <FilterGroup label="Status">
              {STATUSES.map((s) => (
                <Pill
                  key={s}
                  active={statuses.includes(s)}
                  onClick={() =>
                    reset(setStatuses)(
                      statuses.includes(s)
                        ? statuses.filter((x) => x !== s)
                        : [...statuses, s]
                    )
                  }
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </Pill>
              ))}
            </FilterGroup>
          </div>
        )}
      </div>

      {/* ── Selection bar ───────────────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="flex items-center gap-sm rounded-xl border border-primary/30 bg-primary/5 px-md py-sm">
          <span className="font-body-md font-semibold text-primary">
            {selected.length} selected
          </span>
          <button
            onClick={exportSelected}
            className="inline-flex items-center gap-xxs rounded-lg border border-outline-variant bg-surface-container-lowest px-sm py-xs font-body-sm text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </button>
          <button
            onClick={() => setSelected([])}
            className="ml-auto rounded-lg px-sm py-xs font-body-sm text-on-surface-variant hover:bg-surface-container-high"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="bg-inverse-surface text-inverse-on-surface">
                <th scope="col" className="w-12 px-md py-sm">
                  <CheckBox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onChange={togglePage}
                    label="Select all rows on this page"
                    onDark
                  />
                </th>
                <SortHeader
                  label="Customer Name"
                  active={sort.key === "name"}
                  dir={sort.dir}
                  onClick={() => toggleSort("name")}
                />
                <th scope="col" className="px-md py-sm font-label-uppercase">
                  Segment
                </th>
                <th scope="col" className="px-md py-sm font-label-uppercase">
                  Tier
                </th>
                <SortHeader
                  label="Potential Value"
                  align="right"
                  active={sort.key === "value"}
                  dir={sort.dir}
                  onClick={() => toggleSort("value")}
                />
                <SortHeader
                  label="Last Contacted"
                  align="right"
                  active={sort.key === "contacted"}
                  dir={sort.dir}
                  onClick={() => toggleSort("contacted")}
                />
                <th scope="col" className="px-md py-sm font-label-uppercase">
                  Status
                </th>
                <th scope="col" className="w-12 px-md py-sm">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((c) => {
                const isSelected = selected.includes(c.id);
                const status = STATUS_META[c.status];
                return (
                  <tr
                    key={c.id}
                    onClick={() => setViewing({ id: c.id, at: Date.now() })}
                    className={cn(
                      "group cursor-pointer border-b border-outline-variant/30 transition-colors last:border-b-0",
                      isSelected ? "bg-primary/5" : "hover:bg-surface-container-low"
                    )}
                  >
                    <td className="px-md py-sm" onClick={(e) => e.stopPropagation()}>
                      <CheckBox
                        checked={isSelected}
                        onChange={() => toggleRow(c.id)}
                        label={`Select ${c.name}`}
                      />
                    </td>

                    <td className="px-md py-sm">
                      <div className="flex items-center gap-sm">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                            AVATAR_CLASS[c.tier]
                          )}
                          aria-hidden="true"
                        >
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-xs">
                            <span className="truncate font-body-md font-semibold text-on-surface">
                              {c.name}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-xs py-xxs font-label-uppercase text-[10px]",
                                ENTITY_CHIP[c.entity]
                              )}
                            >
                              {ENTITY_LABEL[c.entity]}
                            </span>
                          </div>
                          <span className="font-mono-data text-[11px] text-on-surface-variant">
                            #{c.ref}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-md py-sm font-body-md text-on-surface-variant">
                      {c.segment ? humanise(c.segment) : "—"}
                    </td>

                    <td className="px-md py-sm">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-xs py-xxs font-label-uppercase text-[10px]",
                          TIER_CLASS[c.tier]
                        )}
                      >
                        Tier {c.tier}
                      </span>
                    </td>

                    <td className="px-md py-sm text-right font-mono-data text-on-surface">
                      {c.potential_value > 0 ? formatINR(c.potential_value) : "—"}
                    </td>

                    <td className="px-md py-sm text-right font-body-md text-on-surface-variant">
                      {formatRelative(c.last_contact_at)}
                    </td>

                    <td className="px-md py-sm">
                      <span
                        className={cn(
                          "inline-flex items-center gap-xs font-body-sm font-semibold",
                          status.text
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                        {status.label}
                        {c.open_actions > 0 && (
                          <span className="font-mono-data text-[11px] font-normal text-on-surface-variant">
                            · {c.open_actions} open
                          </span>
                        )}
                      </span>
                    </td>

                    <td className="px-md py-sm text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setViewing({ id: c.id, at: Date.now() })}
                        aria-label={`View ${c.name}`}
                        className="rounded-lg p-xxs text-primary opacity-0 transition-opacity hover:bg-primary/10 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          visibility
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-xs px-md py-xl text-center">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
              {initial.length === 0 ? "groups" : "search_off"}
            </span>
            <p className="font-body-md text-on-surface">
              {initial.length === 0
                ? "No customers assigned to you yet."
                : "No records match these filters."}
            </p>
            <p className="font-body-sm text-on-surface-variant">
              {initial.length === 0
                ? "New leads appear here as soon as they are assigned to your book."
                : `${initial.length} records are hidden by the current search and filters.`}
            </p>
            {initial.length > 0 && activeFilters + (query ? 1 : 0) > 0 && (
              <button
                onClick={clearFilters}
                className="mt-xs rounded-lg border border-outline-variant px-sm py-xs font-body-sm text-on-surface hover:bg-surface-container-high"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-sm border-t border-outline-variant/40 bg-surface-container-low px-md py-sm">
          <span className="font-body-sm text-on-surface-variant">
            {sorted.length === 0
              ? "No records"
              : `Showing ${start + 1}–${start + rows.length} of ${sorted.length} record${
                  sorted.length === 1 ? "" : "s"
                }`}
            {sorted.length !== initial.length && ` (filtered from ${initial.length})`}
          </span>

          {pageCount > 1 && (
            <nav className="flex items-center gap-xxs" aria-label="Pagination">
              <PageButton
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
                label="Previous page"
                icon="chevron_left"
              />
              {pageList(current, pageCount).map((p, i) =>
                p === "…" ? (
                  <span
                    key={`gap-${i}`}
                    className="px-xs font-body-sm text-on-surface-variant"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-current={p === current ? "page" : undefined}
                    className={cn(
                      "h-8 min-w-8 rounded-lg px-xs font-body-sm transition-colors",
                      p === current
                        ? "bg-primary-container font-bold text-on-primary-container"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <PageButton
                disabled={current === pageCount}
                onClick={() => setPage(current + 1)}
                label="Next page"
                icon="chevron_right"
              />
            </nav>
          )}
        </div>
      </div>

      {/* The dashboard's Review drawer already renders a customer from its id —
          reused here so "view" means the same thing from both pages. */}
      {viewing && (
        <ReviewDrawer
          opp={null}
          customerId={viewing.id}
          now={viewing.at}
          busy={false}
          onClose={() => setViewing(null)}
          onEngage={() => setViewing(null)}
          onSkip={() => setViewing(null)}
        />
      )}

      {creating && (
        <NewRecordDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-xs whitespace-nowrap rounded-full border px-sm py-xs font-body-sm transition-colors",
        active
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-xs font-label-uppercase text-on-surface-variant">{label}</p>
      <div className="flex flex-wrap items-center gap-xxs">{children}</div>
    </div>
  );
}

function SortHeader({
  label,
  align = "left",
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: "left" | "right";
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-md py-sm", align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-xxs font-label-uppercase transition-opacity hover:opacity-100",
          align === "right" && "flex-row-reverse",
          active ? "opacity-100" : "opacity-80"
        )}
      >
        {label}
        <span className="material-symbols-outlined text-[16px]">
          {!active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"}
        </span>
      </button>
    </th>
  );
}

function CheckBox({
  checked,
  indeterminate,
  onChange,
  label,
  onDark,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  onDark?: boolean;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors",
        on
          ? "border-primary bg-primary text-on-primary"
          : onDark
            ? "border-inverse-on-surface/50 hover:border-inverse-on-surface"
            : "border-outline hover:border-primary"
      )}
    >
      {on && (
        <span className="material-symbols-outlined text-[14px]">
          {indeterminate ? "remove" : "check"}
        </span>
      )}
    </button>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  icon,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg p-xxs text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

/** 1 … n with the current page and its neighbours always shown. */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - (list[i - 1] as number) > 1) out.push("…");
    out.push(p);
  });
  return out;
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
