"use client";

import { useMemo, useState } from "react";

/**
 * Regional Reports — branch comparison charts + the high-value client grid.
 *
 * Everything here runs off the module-level consts below. The schema has no
 * AUM / idle-balance / risk-profile columns yet, so the client grid is
 * placeholder data; the filtering, sorting and pagination around it are real,
 * so wiring a query later means replacing CLIENTS and PERIODS and nothing else.
 */

/* ── Data ─────────────────────────────────────────────────────────────── */

export type BranchMetric = {
  branch: string;
  /** Avg. days from MQL to Won — lower is better. */
  conversionDays: number;
  /** Hours to first touch — lower is better. */
  latencyHours: number;
};

const PERIODS = {
  "Q3 2023": {
    metrics: [
      { branch: "SF Bay", conversionDays: 14.2, latencyHours: 2.1 },
      { branch: "Seattle", conversionDays: 18.5, latencyHours: 5.8 },
      { branch: "Portland", conversionDays: 16.1, latencyHours: 3.2 },
      { branch: "LA", conversionDays: 11.8, latencyHours: 1.4 },
      { branch: "San Diego", conversionDays: 19.2, latencyHours: 4.5 },
    ] as BranchMetric[],
    conversionDelta: -12,
    latencyDelta: 2.4,
  },
  YTD: {
    metrics: [
      { branch: "SF Bay", conversionDays: 15.6, latencyHours: 2.8 },
      { branch: "Seattle", conversionDays: 17.1, latencyHours: 4.9 },
      { branch: "Portland", conversionDays: 16.8, latencyHours: 3.6 },
      { branch: "LA", conversionDays: 13.2, latencyHours: 2.0 },
      { branch: "San Diego", conversionDays: 18.4, latencyHours: 4.1 },
    ] as BranchMetric[],
    conversionDelta: -6,
    latencyDelta: 1.1,
  },
};

type PeriodKey = keyof typeof PERIODS;
const PERIOD_KEYS = Object.keys(PERIODS) as PeriodKey[];

type Risk = "Aggressive" | "Moderate" | "Conservative";

type Client = {
  id: string;
  name: string;
  branch: string;
  /** Millions USD. */
  aum: number;
  /** Millions USD sitting idle. */
  idle: number;
  rm: string;
  risk: Risk;
};

const CLIENTS: Client[] = [
  { id: "884-2910", name: "TechGrowth Partners LLC", branch: "SF Bay Area", aum: 142.5, idle: 12.4, rm: "S. Chen", risk: "Aggressive" },
  { id: "442-9912", name: "Vanguard Logistics", branch: "Los Angeles", aum: 89.2, idle: 2.1, rm: "M. Davis", risk: "Moderate" },
  { id: "112-4458", name: "Evergreen Endowments", branch: "Seattle", aum: 215.0, idle: 18.7, rm: "R. Sterling", risk: "Conservative" },
  { id: "993-2111", name: "Pacific BioMed", branch: "San Diego", aum: 75.4, idle: 4.5, rm: "J. Alvez", risk: "Aggressive" },
  { id: "556-3301", name: "Cascade Robotics", branch: "Seattle", aum: 128.9, idle: 11.2, rm: "R. Sterling", risk: "Aggressive" },
  { id: "771-8890", name: "Golden Gate Capital Trust", branch: "SF Bay Area", aum: 340.2, idle: 27.5, rm: "S. Chen", risk: "Conservative" },
  { id: "223-4417", name: "Sunset Media Group", branch: "Los Angeles", aum: 54.8, idle: 1.4, rm: "M. Davis", risk: "Moderate" },
  { id: "889-1123", name: "Rainier Freight Systems", branch: "Portland", aum: 63.1, idle: 6.8, rm: "K. Obi", risk: "Moderate" },
  { id: "334-7789", name: "Coastal Energy Holdings", branch: "San Diego", aum: 187.6, idle: 22.1, rm: "J. Alvez", risk: "Conservative" },
  { id: "667-2245", name: "Bayview Pharmaceuticals", branch: "SF Bay Area", aum: 96.3, idle: 3.2, rm: "S. Chen", risk: "Aggressive" },
  { id: "445-9931", name: "Cedar Ridge Ventures", branch: "Portland", aum: 41.7, idle: 5.9, rm: "K. Obi", risk: "Aggressive" },
  { id: "118-6642", name: "Harbor Point Industries", branch: "Seattle", aum: 152.4, idle: 9.3, rm: "R. Sterling", risk: "Moderate" },
  { id: "902-3358", name: "Silverline Aerospace", branch: "Los Angeles", aum: 268.0, idle: 31.4, rm: "M. Davis", risk: "Aggressive" },
  { id: "573-1180", name: "Redwood Analytics", branch: "SF Bay Area", aum: 33.9, idle: 1.8, rm: "S. Chen", risk: "Moderate" },
  { id: "246-8804", name: "Mission Bay Diagnostics", branch: "San Diego", aum: 110.5, idle: 14.6, rm: "J. Alvez", risk: "Conservative" },
  { id: "737-5529", name: "Columbia Timber Co.", branch: "Portland", aum: 78.2, idle: 2.7, rm: "K. Obi", risk: "Conservative" },
  { id: "381-4460", name: "Pinnacle Retail Group", branch: "Los Angeles", aum: 47.3, idle: 8.1, rm: "M. Davis", risk: "Moderate" },
  { id: "615-9073", name: "Emerald City Fintech", branch: "Seattle", aum: 199.8, idle: 16.9, rm: "R. Sterling", risk: "Aggressive" },
];

const BRANCHES = ["All Branches", ...Array.from(new Set(CLIENTS.map((c) => c.branch)))];
const AUM_FILTERS = [10, 50, 100];
const IDLE_FILTERS = [1, 5];
const PAGE_SIZE = 4;

/** Idle balance at or above this (millions) gets flagged as capital sitting still. */
const IDLE_ALERT_THRESHOLD = 10;

/* ── Component ────────────────────────────────────────────────────────── */

export default function RegionalReports() {
  const [period, setPeriod] = useState<PeriodKey>("Q3 2023");
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const [branch, setBranch] = useState(BRANCHES[0]);
  const [minAum, setMinAum] = useState(AUM_FILTERS[0]);
  const [minIdle, setMinIdle] = useState(IDLE_FILTERS[0]);
  const [page, setPage] = useState(1);

  const active = PERIODS[period];
  const metrics = active.metrics.filter((m) => !hiddenBranches.includes(m.branch));

  const filtered = useMemo(
    () =>
      CLIENTS.filter(
        (c) =>
          (branch === "All Branches" || c.branch === branch) &&
          c.aum > minAum &&
          c.idle > minIdle
      ).sort((a, b) => b.aum - a.aum),
    [branch, minAum, minIdle]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter change can strand the viewer past the last page; clamp on read so
  // the grid never renders empty while results exist.
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /** Every filter change resets paging — otherwise page 3 of 3 becomes page 3 of 1. */
  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="flex flex-col w-full p-xl gap-12">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-md">
        <h1 className="font-display-lg text-on-surface">
          Regional Reports &amp; Top Clients
        </h1>
        <p className="font-body-lg text-on-surface-variant max-w-2xl">
          Analyze branch performance metrics side-by-side and monitor high-value
          clients across the Western Region.
        </p>
      </div>

      {/* ── Branch performance matrix ────────────────────────────────── */}
      <section className="flex flex-col gap-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
          <h2 className="font-headline-md text-on-surface flex items-center gap-xs">
            <span className="material-symbols-outlined text-primary">speed</span>
            Branch Performance Matrix
          </h2>
          <div className="flex items-center gap-md">
            <div className="relative">
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className={`font-body-sm px-md py-xs rounded flex items-center gap-xs transition-colors shadow-sm ${
                  hiddenBranches.length
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  filter_list
                </span>
                Filter Branches
                {hiddenBranches.length > 0 && ` (${metrics.length})`}
              </button>

              {filterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setFilterOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-xs z-20 w-56 bg-surface-container-lowest rounded-lg shadow-md border border-outline-variant/30 p-xs">
                    {active.metrics.map((m) => {
                      const shown = !hiddenBranches.includes(m.branch);
                      return (
                        <button
                          key={m.branch}
                          onClick={() =>
                            setHiddenBranches((h) =>
                              shown
                                ? [...h, m.branch]
                                : h.filter((b) => b !== m.branch)
                            )
                          }
                          className="w-full flex items-center gap-xs px-xs py-xs rounded hover:bg-surface-container transition-colors font-body-sm text-on-surface"
                        >
                          <span
                            className={`material-symbols-outlined text-[18px] ${
                              shown ? "text-primary" : "text-outline"
                            }`}
                          >
                            {shown ? "check_box" : "check_box_outline_blank"}
                          </span>
                          {m.branch}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="bg-surface-container rounded p-1 flex shadow-sm">
              {PERIOD_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setPeriod(k)}
                  className={`px-md py-1.5 rounded font-label-uppercase transition-colors ${
                    period === k
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-xl">
          <ChartCard
            title="Conversion Velocity"
            subtitle="Avg. days from MQL to Won"
            delta={active.conversionDelta}
            deltaSuffix="% vs last Q"
            metrics={metrics}
            valueOf={(m) => m.conversionDays}
            format={(v) => `${v} Days`}
          />
          <ChartCard
            title="Lead Turnaround Latency"
            subtitle="Time to first touch (Hours)"
            delta={active.latencyDelta}
            deltaSuffix="h vs Target"
            metrics={metrics}
            valueOf={(m) => m.latencyHours}
            format={(v) => `${v}h`}
          />
        </div>
      </section>

      {/* ── Regional top clients ─────────────────────────────────────── */}
      <section className="flex flex-col gap-lg">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-md">
          <h2 className="font-headline-md text-on-surface flex items-center gap-xs">
            <span className="material-symbols-outlined text-primary">diamond</span>
            Regional Top Clients
          </h2>

          <div className="flex flex-wrap items-center bg-surface-container-lowest p-xxs rounded-lg shadow-sm border border-outline-variant/30">
            <SelectFilter
              icon="storefront"
              value={branch}
              onChange={onFilterChange(setBranch)}
              options={BRANCHES.map((b) => ({ value: b, label: b }))}
              divider
            />
            <SelectFilter
              icon="account_balance_wallet"
              value={String(minAum)}
              onChange={onFilterChange((v: string) => setMinAum(Number(v)))}
              options={AUM_FILTERS.map((n) => ({
                value: String(n),
                label: `AUM > $${n}M`,
              }))}
              divider
            />
            <SelectFilter
              icon="savings"
              value={String(minIdle)}
              onChange={onFilterChange((v: string) => setMinIdle(Number(v)))}
              options={IDLE_FILTERS.map((n) => ({
                value: String(n),
                label: `Idle > $${n}M`,
              }))}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/50 font-label-uppercase text-on-surface-variant">
                  <th className="p-md">Client Name</th>
                  <th className="p-md">Branch</th>
                  <th className="p-md">Total AUM</th>
                  <th className="p-md">Idle Pay-In Balance</th>
                  <th className="p-md">Account RM</th>
                  <th className="p-md">Risk Profile</th>
                  <th className="p-md text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-xl text-center font-body-md text-on-surface-variant"
                    >
                      No clients match these filters.
                    </td>
                  </tr>
                ) : (
                  visible.map((c) => <ClientRow key={c.id} client={c} />)
                )}
              </tbody>
            </table>
          </div>

          <div className="p-md border-t border-outline-variant/30 flex items-center justify-between">
            <span className="font-body-sm text-on-surface-variant">
              {filtered.length === 0
                ? "No matching clients"
                : `Showing ${(safePage - 1) * PAGE_SIZE + 1}-${
                    (safePage - 1) * PAGE_SIZE + visible.length
                  } of ${filtered.length} High-Value Clients`}
            </span>
            <div className="flex items-center gap-xs">
              <PageButton
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 1}
                icon="chevron_left"
              />
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-8 h-8 flex items-center justify-center rounded font-body-sm transition-colors ${
                    n === safePage
                      ? "bg-primary text-on-primary shadow-sm"
                      : "hover:bg-surface-container text-on-surface"
                  }`}
                >
                  {n}
                </button>
              ))}
              <PageButton
                onClick={() => setPage(safePage + 1)}
                disabled={safePage === pageCount}
                icon="chevron_right"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Chart ────────────────────────────────────────────────────────────── */

function ChartCard({
  title,
  subtitle,
  delta,
  deltaSuffix,
  metrics,
  valueOf,
  format,
}: {
  title: string;
  subtitle: string;
  delta: number;
  deltaSuffix: string;
  metrics: BranchMetric[];
  valueOf: (m: BranchMetric) => number;
  format: (v: number) => string;
}) {
  const values = metrics.map(valueOf);
  const max = Math.max(...values, 0);
  const min = Math.min(...values);
  // Both metrics are "lower is better" (fewer days, fewer hours), so a drop is
  // always the good direction.
  const good = delta < 0;

  return (
    <div className="bg-surface-container-lowest p-lg rounded-xl shadow-md flex flex-col gap-lg">
      <div className="flex justify-between items-start gap-md">
        <div>
          <h3 className="font-headline-sm text-on-surface">{title}</h3>
          <p className="font-body-sm text-on-surface-variant">{subtitle}</p>
        </div>
        <span
          className={`px-sm py-1 rounded-full font-label-uppercase flex items-center gap-1 whitespace-nowrap ${
            good
              ? "bg-tertiary/10 text-tertiary"
              : "bg-error-container/20 text-error"
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {delta < 0 ? "trending_down" : "trending_up"}
          </span>
          {delta > 0 ? "+" : ""}
          {delta}
          {deltaSuffix}
        </span>
      </div>

      <div className="relative h-64 w-full flex items-end justify-between gap-xs px-xs pb-8">
        <div className="absolute inset-0 flex flex-col justify-between pb-8 opacity-20 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-b border-outline-variant w-full h-0" />
          ))}
        </div>

        {metrics.length === 0 ? (
          <p className="w-full text-center font-body-sm text-on-surface-variant self-center pb-8">
            All branches hidden.
          </p>
        ) : (
          metrics.map((m) => {
            const v = valueOf(m);
            const tone =
              v === min
                ? "bg-tertiary"
                : v === max
                  ? "bg-error"
                  : "bg-secondary";
            return (
              <div
                key={m.branch}
                className="flex flex-col items-center gap-xs group w-full relative z-10"
              >
                <div
                  className={`w-full ${tone} rounded-t-sm transition-all duration-300 hover:opacity-80 relative shadow-sm`}
                  style={{ height: `${max ? (v / max) * 100 : 0}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-inverse-surface text-inverse-on-surface font-body-sm px-xs py-1 rounded whitespace-nowrap transition-opacity pointer-events-none">
                    {format(v)}
                  </div>
                </div>
                <span className="font-label-uppercase text-on-surface-variant absolute -bottom-6 w-full text-center truncate">
                  {m.branch}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

function SelectFilter({
  icon,
  value,
  onChange,
  options,
  divider = false,
}: {
  icon: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-xs px-sm py-1.5 ${
        divider ? "border-r border-outline-variant/50" : ""
      }`}
    >
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
        {icon}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-none font-body-sm text-on-surface outline-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-primary-container text-on-primary",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-surface-container-highest text-on-surface",
];

function ClientRow({ client }: { client: Client }) {
  const idleAlert = client.idle >= IDLE_ALERT_THRESHOLD;
  // Stable per-client tone so the avatar colour doesn't shuffle between pages.
  const tone =
    AVATAR_TONES[
      client.name.charCodeAt(0) % AVATAR_TONES.length
    ];

  return (
    <tr className="border-b border-outline-variant/30 hover:bg-surface-container transition-colors group">
      <td className="p-md">
        <div className="flex items-center gap-sm">
          <div
            className={`w-8 h-8 rounded flex items-center justify-center font-headline-sm shrink-0 ${tone}`}
          >
            {client.name[0]}
          </div>
          <div className="flex flex-col">
            <span className="font-body-md font-semibold text-on-surface">
              {client.name}
            </span>
            <span className="font-mono-data text-on-surface-variant text-[11px]">
              ID: {client.id}
            </span>
          </div>
        </div>
      </td>
      <td className="p-md font-body-md text-on-surface">{client.branch}</td>
      <td className="p-md font-mono-data text-on-surface font-semibold">
        ${client.aum.toFixed(1)}M
      </td>
      <td className="p-md font-mono-data text-on-surface">
        {idleAlert ? (
          <div className="flex items-center gap-xs">
            <span className="text-tertiary">${client.idle.toFixed(1)}M</span>
            <span
              className="material-symbols-outlined text-[14px] text-tertiary"
              title="Idle capital above threshold"
            >
              warning
            </span>
          </div>
        ) : (
          `$${client.idle.toFixed(1)}M`
        )}
      </td>
      <td className="p-md">
        <div className="flex items-center gap-xs">
          <div className="w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center text-[10px] font-semibold shrink-0">
            {client.rm.replace(/[^A-Z]/g, "").slice(0, 2)}
          </div>
          <span className="font-body-sm text-on-surface">{client.rm}</span>
        </div>
      </td>
      <td className="p-md">
        <span className="bg-surface-container-high text-on-surface px-xs py-1 rounded text-[11px] font-label-uppercase">
          {client.risk}
        </span>
      </td>
      <td className="p-md text-right">
        <button
          title="More actions"
          className="text-primary hover:text-on-primary-fixed-variant opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </td>
    </tr>
  );
}

function PageButton({
  onClick,
  disabled,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container text-on-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
