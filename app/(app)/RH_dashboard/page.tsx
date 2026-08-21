import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";

/**
 * Branches Overview — the Regional Head's home.
 *
 * Placeholder data. The real rollup lands once the region-scoped branch query
 * is wired; every number below comes from the two consts here, so swapping in
 * a query means replacing those and nothing else in the markup.
 */

const REGION = {
  name: "Western Region",
  branchCount: 12,
  achievedValue: "$14.2M",
  targetValue: "$18.5M",
  quotaPct: 76,
  yoyDeltaPct: 4.2,
  ahead: 7,
  onTrack: 3,
  lagging: 2,
  slaCompliancePct: 92,
  slaDeltaPct: 1.4,
};

type BranchRow = {
  id: string;
  name: string;
  quotaPct: number;
  conversionPct: number;
  pipelineValue: string;
  breaches: number;
  tone: "ahead" | "ontrack" | "lag";
};

const BRANCHES: BranchRow[] = [
  { id: "b1", name: "Downtown LA", quotaPct: 112, conversionPct: 34.2, pipelineValue: "$2.45M", breaches: 0, tone: "ahead" },
  { id: "b2", name: "San Francisco North", quotaPct: 108, conversionPct: 31.8, pipelineValue: "$3.10M", breaches: 1, tone: "ahead" },
  { id: "b3", name: "Seattle Metro", quotaPct: 94, conversionPct: 28.5, pipelineValue: "$1.85M", breaches: 3, tone: "ontrack" },
  { id: "b4", name: "Portland East", quotaPct: 88, conversionPct: 24.1, pipelineValue: "$1.20M", breaches: 2, tone: "ontrack" },
  { id: "b5", name: "Vegas Strip", quotaPct: 62, conversionPct: 18.4, pipelineValue: "$0.85M", breaches: 12, tone: "lag" },
  { id: "b6", name: "San Diego South", quotaPct: 104, conversionPct: 30.1, pipelineValue: "$2.15M", breaches: 0, tone: "ahead" },
];

export default async function RHDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  const healthTotal = REGION.ahead + REGION.onTrack + REGION.lagging;

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto px-margin-desktop pb-xl">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between w-full gap-md mb-lg mt-lg relative z-10">
        <div className="flex flex-col">
          <div className="flex items-center gap-xs mb-xxs text-primary">
            <span className="material-symbols-outlined text-[18px]">
              share_location
            </span>
            <span className="font-label-uppercase tracking-wider">
              {REGION.name} Analytics
            </span>
          </div>
          <h1 className="font-display-lg text-on-surface">Overview &amp; Pacing</h1>
        </div>
        <div className="flex flex-col sm:text-right">
          <span className="font-label-uppercase text-on-surface-variant">
            Last Synchronized
          </span>
          <span className="font-mono-data text-on-surface flex items-center gap-xs sm:justify-end">
            <span className="flex h-1.5 w-1.5 rounded-full bg-tertiary animate-pulse" />
            Just now
          </span>
        </div>
      </div>

      {/* ── KPI bento grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-xl relative z-10">
        {/* Revenue pacing */}
        <div className="lg:col-span-6 bg-primary text-on-primary rounded-xl shadow-md p-lg relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-primary-fixed opacity-10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
          <div className="flex justify-between items-start relative z-10">
            <h2 className="font-headline-sm flex items-center gap-xs">
              <span className="material-symbols-outlined">trending_up</span>
              Revenue Pacing
            </h2>
            <span className="font-label-uppercase bg-white/20 px-xs py-xxs rounded-sm backdrop-blur-sm">
              Q3 Target
            </span>
          </div>
          <div className="mt-xl relative z-10">
            <div className="flex items-baseline gap-sm">
              <span className="font-display-lg tracking-tight">
                {REGION.achievedValue}
              </span>
              <span className="font-body-lg text-primary-fixed-dim">
                / {REGION.targetValue}
              </span>
            </div>
            <div className="flex justify-between items-end mt-md mb-xxs">
              <span className="font-label-uppercase text-primary-fixed">
                {REGION.quotaPct}% of Quota
              </span>
              <span className="font-mono-data text-on-primary font-bold">
                {REGION.yoyDeltaPct > 0 ? "+" : ""}
                {REGION.yoyDeltaPct}% YoY
              </span>
            </div>
            <div className="h-2 w-full bg-primary-fixed-dim/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-on-primary rounded-full relative"
                style={{ width: `${clamp(REGION.quotaPct)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
              </div>
            </div>
          </div>
        </div>

        {/* Branch health */}
        <div className="lg:col-span-3 bg-surface-container rounded-xl shadow-sm p-lg flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h2 className="font-headline-sm text-on-surface">Branch Health</h2>
            <button className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">
                more_vert
              </span>
            </button>
          </div>
          <div className="mt-md flex-1 flex flex-col justify-end">
            <div className="flex items-center gap-md mb-md">
              <HealthStat value={REGION.ahead} label="Ahead" tone="text-tertiary" />
              <div className="w-px h-10 bg-outline-variant/50" />
              <HealthStat value={REGION.onTrack} label="On Track" tone="text-primary" />
              <div className="w-px h-10 bg-outline-variant/50" />
              <HealthStat value={REGION.lagging} label="Lagging" tone="text-error" />
            </div>
            <div className="flex h-3 w-full rounded-full overflow-hidden gap-1">
              <div
                className="bg-tertiary h-full transition-all duration-1000"
                style={{ width: `${(REGION.ahead / healthTotal) * 100}%` }}
              />
              <div
                className="bg-primary h-full transition-all duration-1000"
                style={{ width: `${(REGION.onTrack / healthTotal) * 100}%` }}
              />
              <div
                className="bg-error h-full transition-all duration-1000"
                style={{ width: `${(REGION.lagging / healthTotal) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* SLA compliance */}
        <div className="lg:col-span-3 bg-surface-container rounded-xl shadow-sm p-lg relative overflow-hidden flex flex-col items-center justify-center">
          <h2 className="font-headline-sm text-on-surface absolute top-lg left-lg">
            SLA Compliance
          </h2>
          <Donut pct={REGION.slaCompliancePct} />
          <div className="w-full mt-xxs flex justify-center items-center gap-1 text-tertiary">
            <span className="material-symbols-outlined text-[16px]">
              arrow_upward
            </span>
            <span className="font-label-uppercase">
              {REGION.slaDeltaPct}% vs Last Month
            </span>
          </div>
        </div>
      </div>

      {/* ── Branch performance directory ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 bg-surface-container-lowest rounded-xl shadow-md overflow-hidden relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between p-md border-b border-surface-variant gap-md">
          <div className="flex items-center gap-sm">
            <h2 className="font-headline-sm text-on-surface">
              Branch Performance Directory
            </h2>
            <span className="bg-surface-container-high text-on-surface-variant font-mono-data px-xs py-0.5 rounded-sm">
              {REGION.branchCount} Results
            </span>
          </div>
          <div className="flex items-center gap-sm w-full md:w-auto">
            <div className="relative group flex-1 md:flex-none md:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                className="w-full bg-surface-container text-on-surface font-body-md rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder-on-surface-variant/70"
                placeholder="Filter branches..."
                type="text"
              />
            </div>
            <button className="flex items-center gap-xs bg-surface-container hover:bg-surface-container-high text-on-surface px-md py-xs rounded-lg transition-colors font-body-sm font-semibold">
              <span className="material-symbols-outlined text-[18px]">
                filter_list
              </span>
              Filter
            </button>
            <button className="flex items-center gap-xs bg-primary hover:bg-primary/90 text-on-primary px-md py-xs rounded-lg transition-colors font-body-sm font-semibold shadow-sm">
              <span className="material-symbols-outlined text-[18px]">
                download
              </span>
              Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container text-on-surface-variant font-label-uppercase select-none">
              <tr>
                <SortableTh>Branch Name</SortableTh>
                <SortableTh className="w-48">Quota Attainment</SortableTh>
                <SortableTh align="right">Conversion %</SortableTh>
                <SortableTh align="right">Pipeline Value</SortableTh>
                <SortableTh>SLA Health</SortableTh>
                <th className="px-md py-sm font-semibold w-16 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="font-body-md text-on-surface bg-surface-container-lowest divide-y divide-surface-variant">
              {BRANCHES.map((b) => (
                <BranchTableRow key={b.id} branch={b} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-md border-t border-surface-variant">
          <span className="font-body-sm text-on-surface-variant">
            Showing 1 to {BRANCHES.length} of {REGION.branchCount} branches
          </span>
          <div className="flex items-center gap-xs">
            <button
              className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-outline cursor-not-allowed"
              disabled
            >
              <span className="material-symbols-outlined text-[18px]">
                chevron_left
              </span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-on-primary font-body-sm shadow-sm">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container transition-colors text-on-surface font-body-sm">
              2
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container border border-transparent hover:border-outline-variant transition-colors text-on-surface">
              <span className="material-symbols-outlined text-[18px]">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational bits                                                 */
/* ------------------------------------------------------------------ */

function HealthStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <span className={`font-display-lg ${tone}`}>{value}</span>
      <span className="font-label-uppercase text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}

/** Circumference of the r=40 track, so the arc length maps straight to a %. */
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 40;

function Donut({ pct }: { pct: number }) {
  const offset = DONUT_CIRCUMFERENCE * (1 - clamp(pct) / 100);
  return (
    <div className="relative w-32 h-32 mt-md flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="stroke-surface-container-highest"
          cx="50"
          cy="50"
          fill="none"
          r="40"
          strokeWidth="8"
        />
        <circle
          className="stroke-tertiary"
          cx="50"
          cy="50"
          fill="none"
          r="40"
          strokeDasharray={DONUT_CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="8"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="font-display-lg text-on-surface">{pct}%</span>
      </div>
    </div>
  );
}

function SortableTh({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`px-md py-sm font-semibold cursor-pointer hover:bg-surface-container-high transition-colors group ${className}`}
    >
      <div
        className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}
      >
        {children}
        <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 transition-opacity">
          arrow_downward
        </span>
      </div>
    </th>
  );
}

function BranchTableRow({ branch }: { branch: BranchRow }) {
  const lagging = branch.tone === "lag";
  const barColor =
    branch.tone === "ahead"
      ? "bg-tertiary"
      : branch.tone === "ontrack"
        ? "bg-primary"
        : "bg-error";
  const dotColor = lagging ? "bg-error animate-pulse" : barColor;

  return (
    <tr
      className={`hover:bg-surface-container-low transition-colors group cursor-pointer h-10 ${
        lagging ? "bg-error/5" : ""
      }`}
    >
      <td className="px-md py-xs">
        <div className="flex items-center gap-sm">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="font-semibold text-on-surface">{branch.name}</span>
        </div>
      </td>
      <td className="px-md py-xs">
        <div className="flex items-center gap-sm">
          <span
            className={`font-mono-data w-10 text-right ${
              lagging ? "text-error font-bold" : ""
            }`}
          >
            {branch.quotaPct}%
          </span>
          <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full`}
              style={{ width: `${clamp(branch.quotaPct)}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-md py-xs text-right font-mono-data">
        {branch.conversionPct}%
      </td>
      <td className="px-md py-xs text-right font-mono-data">
        {branch.pipelineValue}
      </td>
      <td className="px-md py-xs">
        <SlaBadge breaches={branch.breaches} />
      </td>
      <td className="px-md py-xs text-center">
        <button className="text-on-surface-variant hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
          <span className="material-symbols-outlined text-[18px]">
            chevron_right
          </span>
        </button>
      </td>
    </tr>
  );
}

function SlaBadge({ breaches }: { breaches: number }) {
  const label = `${breaches} ${breaches === 1 ? "Breach" : "Breaches"}`;

  if (breaches === 0) {
    return (
      <span className="inline-flex items-center px-xs py-0.5 rounded-full bg-tertiary/10 text-tertiary font-label-uppercase gap-1">
        <span className="material-symbols-outlined text-[12px]">
          check_circle
        </span>
        {label}
      </span>
    );
  }
  if (breaches <= 5) {
    return (
      <span className="inline-flex items-center px-xs py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-uppercase gap-1 border border-outline-variant/30">
        <span className="material-symbols-outlined text-[12px]">warning</span>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-xs py-0.5 rounded-full bg-error-container/40 text-on-error-container font-label-uppercase gap-1 border border-error/20">
      <span className="material-symbols-outlined text-[12px]">error</span>
      {label}
    </span>
  );
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}
