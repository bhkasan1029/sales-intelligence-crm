"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatRelative, initials } from "@/lib/format";
import { FEEDBACK_CATEGORY_LABEL } from "@/lib/validations/feedback";

export type Ticket = {
  id: string;
  code: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  author_name: string;
  author_avatar: string | null;
  /** DB role of the author — only set for callers that mix roles (admin). */
  author_role?: string | null;
};

/** Short display for the author's role, and a colour class for the chip. */
const ROLE_CHIP: Record<string, { label: string; className: string }> = {
  rm: { label: "RM", className: "bg-primary/10 text-primary" },
  branch_manager: {
    label: "BM",
    className: "bg-tertiary/10 text-tertiary",
  },
  regional_head: {
    label: "RH",
    className: "bg-secondary-container text-on-secondary-container",
  },
  admin: {
    label: "Admin",
    className: "bg-error-container text-on-error-container",
  },
};

const ROLE_FILTERS = [
  { value: "all", label: "All" },
  { value: "rm", label: "RM" },
  { value: "branch_manager", label: "BM" },
  { value: "regional_head", label: "RH" },
];

const PAGE_SIZE = 8;

/* ------------------------------------------------------------------ */
/* Derived attributes                                                  */
/* ------------------------------------------------------------------ */

type Priority = "high" | "medium" | "low";

/**
 * `feedback` has no priority column — it is derived from the category the RM
 * picked, so the same ticket always sorts the same way for every viewer.
 */
function priorityOf(category: string): Priority {
  if (category === "system_bug") return "high";
  if (category === "rule_dispute") return "medium";
  return "low";
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** open / ack / resolved are the only states the schema allows. */
const STATUS_META: Record<
  string,
  { label: string; icon: string; tone: string; spin?: boolean }
> = {
  open: {
    label: "Open",
    icon: "radio_button_unchecked",
    tone: "text-on-surface-variant",
  },
  ack: { label: "In Review", icon: "sync", tone: "text-primary", spin: true },
  resolved: {
    label: "Resolved",
    icon: "check_circle",
    tone: "text-tertiary",
  },
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "ack", label: "In Review" },
  { value: "resolved", label: "Resolved" },
];

const PRIORITY_FILTERS = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [role, setRole] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Tickets carry an author_role only when the caller feeds a mixed-role set
   *  (the admin's global view). BM/RH pages leave it null and the chip/filter
   *  stay hidden. */
  const showRoles = tickets.some((t) => t.author_role);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (priority !== "all" && priorityOf(t.category) !== priority) {
        return false;
      }
      if (role !== "all" && t.author_role !== role) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.author_name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        (FEEDBACK_CATEGORY_LABEL[
          t.category as keyof typeof FEEDBACK_CATEGORY_LABEL
        ] ?? t.category)
          .toLowerCase()
          .includes(q)
      );
    });
  }, [tickets, query, status, priority, role]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter change can leave `page` past the end — clamp on read rather than
  // syncing state in an effect.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const filtersActive =
    status !== "all" || priority !== "all" || role !== "all";

  const reset = () => {
    setPage(1);
    setExpanded(null);
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-md z-10 flex flex-col">
      {/* Toolbar */}
      <div className="p-md flex flex-col sm:flex-row sm:justify-between sm:items-center gap-sm border-b border-outline-variant rounded-t-xl">
        <div className="flex gap-sm relative">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
              className="w-72 bg-surface border border-outline-variant py-xs pl-10 pr-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body-sm transition-shadow"
              placeholder="Search ID, RM, or keyword..."
              type="text"
            />
          </div>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            className={cn(
              "px-md py-xs border rounded-lg font-body-sm flex items-center gap-xs transition-colors",
              filtersActive
                ? "bg-primary-container/10 border-primary/40 text-primary"
                : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">
              filter_list
            </span>
            Filter
            {filtersActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute top-full left-0 mt-xs z-30 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-md p-md flex flex-col gap-md">
              <FilterGroup
                title="Status"
                options={STATUS_FILTERS}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  reset();
                }}
              />
              <FilterGroup
                title="Priority"
                options={PRIORITY_FILTERS}
                value={priority}
                onChange={(v) => {
                  setPriority(v);
                  reset();
                }}
              />
              {showRoles && (
                <FilterGroup
                  title="Raised by"
                  options={ROLE_FILTERS}
                  value={role}
                  onChange={(v) => {
                    setRole(v);
                    reset();
                  }}
                />
              )}
              <div className="flex justify-between items-center pt-xs border-t border-outline-variant">
                <button
                  onClick={() => {
                    setStatus("all");
                    setPriority("all");
                    setRole("all");
                    reset();
                  }}
                  className="font-body-sm text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="px-sm py-xxs rounded-lg bg-primary text-on-primary font-body-sm hover:bg-primary-container transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-xs">
          <ViewToggle
            icon="view_list"
            label="List view"
            active={view === "list"}
            onClick={() => setView("list")}
          />
          <ViewToggle
            icon="grid_view"
            label="Grid view"
            active={view === "grid"}
            onClick={() => setView("grid")}
          />
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <div className="px-md py-xl text-center">
          <p className="font-body-md text-on-surface-variant">
            {tickets.length === 0
              ? "No tickets raised by your RMs yet."
              : "No tickets match these filters."}
          </p>
        </div>
      ) : view === "list" ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {[
                  "Ticket ID",
                  "Submitting RM",
                  "Issue",
                  "Priority",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="py-sm px-md font-label-uppercase text-on-surface-variant tracking-wider"
                  >
                    {h}
                  </th>
                ))}
                <th className="py-sm px-md font-label-uppercase text-on-surface-variant tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-on-surface divide-y divide-outline-variant/50">
              {visible.map((t, i) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  index={start + i}
                  expanded={expanded === t.id}
                  onToggle={() =>
                    setExpanded((e) => (e === t.id ? null : t.id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-md grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
          {visible.map((t, i) => (
            <TicketCard key={t.id} ticket={t} index={start + i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="p-sm px-md flex justify-between items-center rounded-b-xl border-t border-outline-variant">
        <span className="font-body-sm text-on-surface-variant">
          {filtered.length === 0
            ? "No tickets"
            : `Showing ${start + 1} to ${Math.min(
                start + PAGE_SIZE,
                filtered.length
              )} of ${filtered.length} ticket${filtered.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex gap-xxs items-center">
          <button
            onClick={() => {
              setPage(current - 1);
              setExpanded(null);
            }}
            disabled={current === 1}
            aria-label="Previous page"
            className="p-xxs rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-[20px]">
              chevron_left
            </span>
          </button>
          {pageWindow(current, pageCount).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPage(p);
                setExpanded(null);
              }}
              aria-current={p === current ? "page" : undefined}
              className={cn(
                "w-8 h-8 rounded-lg font-body-sm flex items-center justify-center transition-colors",
                p === current
                  ? "bg-primary-container text-on-primary-container"
                  : "hover:bg-surface-container-high text-on-surface-variant"
              )}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => {
              setPage(current + 1);
              setExpanded(null);
            }}
            disabled={current === pageCount}
            aria-label="Next page"
            className="p-xxs rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-[20px]">
              chevron_right
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rows and cards                                                      */
/* ------------------------------------------------------------------ */

function TicketRow({
  ticket,
  index,
  expanded,
  onToggle,
}: {
  ticket: Ticket;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const resolved = ticket.status === "resolved";
  const status = STATUS_META[ticket.status] ?? STATUS_META.open;
  const priority = priorityOf(ticket.category);

  return (
    <>
      <tr
        className={cn(
          "hover:bg-surface-bright transition-colors group",
          resolved && !expanded && "opacity-60"
        )}
      >
        <td
          className={cn(
            "py-xs px-md font-mono-data whitespace-nowrap",
            resolved ? "text-outline" : "text-primary"
          )}
        >
          {ticket.code}
        </td>
        <td className="py-xs px-md">
          <div className="flex items-center gap-xs">
            <Avatar
              name={ticket.author_name}
              src={ticket.author_avatar}
              index={index}
            />
            <span className="font-semibold text-on-surface whitespace-nowrap">
              {ticket.author_name}
            </span>
            <RoleChip role={ticket.author_role} />
          </div>
        </td>
        <td className="py-xs px-md">
          <div className="flex items-center gap-xs min-w-0">
            <span
              className="truncate max-w-[280px] text-on-surface-variant"
              title={ticket.subject}
            >
              {ticket.subject}
            </span>
            <span className="shrink-0 font-label-uppercase text-outline">
              {FEEDBACK_CATEGORY_LABEL[
                ticket.category as keyof typeof FEEDBACK_CATEGORY_LABEL
              ] ?? ticket.category}
            </span>
          </div>
        </td>
        <td className="py-xs px-md">
          <PriorityBadge priority={priority} />
        </td>
        <td className="py-xs px-md">
          <span
            className={cn("flex items-center gap-xxs whitespace-nowrap", status.tone)}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[16px]",
                status.spin && "animate-spin"
              )}
            >
              {status.icon}
            </span>
            {status.label}
          </span>
        </td>
        <td className="py-xs px-md text-right">
          <div
            className={cn(
              "flex items-center justify-end gap-xs transition-opacity",
              expanded
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            )}
          >
            <button
              onClick={onToggle}
              aria-expanded={expanded}
              className="px-sm py-xxs text-primary font-body-sm hover:bg-primary-container/20 rounded-lg transition-colors"
            >
              {expanded ? "Hide" : "View"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-bright">
          <td colSpan={6} className="px-md pb-md pt-xs">
            <TicketDetail ticket={ticket} />
          </td>
        </tr>
      )}
    </>
  );
}

function TicketDetail({ ticket }: { ticket: Ticket }) {
  return (
    <div className="border-l-2 border-outline-variant pl-md flex flex-col gap-xs">
      <p className="font-body-md font-semibold text-on-surface">
        {ticket.subject}
      </p>
      <p className="font-body-sm text-on-surface-variant whitespace-pre-wrap">
        {ticket.body}
      </p>
      <p className="font-label-uppercase text-outline">
        Raised {formatDate(ticket.created_at)} ·{" "}
        {formatRelative(ticket.created_at)}
        {ticket.resolved_at
          ? ` · Resolved ${formatDate(ticket.resolved_at)}`
          : ""}
      </p>
    </div>
  );
}

function TicketCard({ ticket, index }: { ticket: Ticket; index: number }) {
  const status = STATUS_META[ticket.status] ?? STATUS_META.open;
  return (
    <div
      className={cn(
        "border border-outline-variant rounded-xl p-md flex flex-col gap-sm hover:shadow-sm transition-shadow",
        ticket.status === "resolved" && "opacity-70"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono-data text-primary">{ticket.code}</span>
        <PriorityBadge priority={priorityOf(ticket.category)} />
      </div>
      <p className="font-body-md font-semibold text-on-surface line-clamp-2">
        {ticket.subject}
      </p>
      <p className="font-body-sm text-on-surface-variant line-clamp-3">
        {ticket.body}
      </p>
      <div className="flex items-center justify-between mt-auto pt-xs border-t border-outline-variant">
        <div className="flex items-center gap-xs min-w-0">
          <Avatar
            name={ticket.author_name}
            src={ticket.author_avatar}
            index={index}
          />
          <span className="font-body-sm text-on-surface truncate">
            {ticket.author_name}
          </span>
          <RoleChip role={ticket.author_role} />
        </div>
        <span className={cn("flex items-center gap-xxs font-body-sm", status.tone)}>
          <span
            className={cn(
              "material-symbols-outlined text-[16px]",
              status.spin && "animate-spin"
            )}
          >
            {status.icon}
          </span>
          {status.label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational bits                                           */
/* ------------------------------------------------------------------ */

function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "high") {
    return (
      <div className="inline-flex items-center gap-xxs px-xs py-[2px] rounded-lg bg-error-container text-on-error-container font-label-uppercase w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
        {PRIORITY_LABEL.high}
      </div>
    );
  }
  if (priority === "medium") {
    return (
      <div className="inline-flex items-center gap-xxs px-xs py-[2px] rounded-lg bg-surface-container-highest text-on-surface-variant font-label-uppercase w-fit border border-outline-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        {PRIORITY_LABEL.medium}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-xxs px-xs py-[2px] rounded-lg bg-surface-container-low text-on-surface-variant font-label-uppercase w-fit">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
      {PRIORITY_LABEL.low}
    </div>
  );
}

function RoleChip({ role }: { role?: string | null }) {
  if (!role) return null;
  const meta = ROLE_CHIP[role];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center px-xs py-[1px] rounded-md font-label-uppercase",
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

function Avatar({
  name,
  src,
  index,
}: {
  name: string;
  src: string | null;
  index: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="w-6 h-6 rounded-full object-cover shrink-0"
      />
    );
  }
  const tones = [
    "bg-secondary-container text-on-secondary-container",
    "bg-tertiary-container text-on-tertiary-container",
    "bg-primary-container text-on-primary-container",
  ];
  return (
    <div
      className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center font-label-uppercase shrink-0",
        tones[index % tones.length]
      )}
    >
      {initials(name)}
    </div>
  );
}

function FilterGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="font-label-uppercase text-on-surface-variant">
        {title}
      </span>
      <div className="flex flex-wrap gap-xxs">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-sm py-xxs rounded-lg font-body-sm border transition-colors",
              value === o.value
                ? "bg-primary-container text-on-primary-container border-transparent"
                : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ViewToggle({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "p-xs rounded-lg transition-colors",
        active
          ? "bg-surface-container-high text-on-surface"
          : "bg-surface text-on-surface-variant hover:bg-surface-container-high"
      )}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

/** At most five page buttons, centred on the current page. */
function pageWindow(current: number, total: number): number[] {
  const size = Math.min(5, total);
  let first = Math.max(1, current - Math.floor(size / 2));
  first = Math.min(first, total - size + 1);
  return Array.from({ length: size }, (_, i) => first + i);
}
