import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getRoster, summarise, type RosterRow } from "@/lib/queries/branch";
import { formatINR, formatPct, initials, periodOf } from "@/lib/format";

/**
 * Ported from the code.html reference — pixel-parity where feasible while
 * driven by real branch-scoped data (getRoster + summarise).
 */

export default async function BMDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "branch_manager") redirect(ROLE_HOME[session.role]);

  const period = periodOf();
  const roster = await getRoster(session.user_id, period);
  const summary = summarise(roster, period);

  const branchAheadPct = summary.achieved_pct - 78; // "expected" baseline
  const rmsWithTargets = roster.filter((r) => r.target_value > 0);
  const teamMedianPct = rmsWithTargets.length
    ? median(rmsWithTargets.map((r) => r.achieved_pct))
    : 0;
  const lagging = roster.filter(
    (r) => r.target_value > 0 && r.achieved_pct < 60
  );
  const topPerformers = roster
    .filter((r) => r.achieved_pct >= 100)
    .sort((a, b) => b.achieved_pct - a.achieved_pct);

  return (
    <div className="flex flex-col w-full px-xl pb-xl gap-xl">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-md mb-md mt-sm">
        <div className="flex flex-col gap-xxs">
          <h1 className="font-display-lg text-on-surface">Team Management</h1>
          <p className="font-body-lg text-on-surface-variant max-w-2xl">
            Overview of Branch Alpha&apos;s relationship managers, performance
            metrics, and quota pacing.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <button className="flex items-center gap-xs px-md py-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-headline-sm rounded-lg transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[20px]">
              filter_list
            </span>
            Filter
          </button>
          <button className="flex items-center gap-xs px-md py-sm bg-primary hover:bg-surface-tint text-on-primary font-headline-sm rounded-lg transition-colors shadow-sm shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">
              person_add
            </span>
            Add RM
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
        {/* Branch Quota */}
        <div className="bg-surface-container-lowest p-lg rounded-xl shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
          <div className="flex items-center justify-between z-10">
            <h3 className="font-label-uppercase text-on-surface-variant">
              Branch Quota
            </h3>
            <span className="material-symbols-outlined text-primary text-[20px]">
              trending_up
            </span>
          </div>
          <div className="flex flex-col gap-xs z-10">
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-surface">
                {formatPct(summary.achieved_pct)}
              </span>
              <PaceBadge deltaPct={branchAheadPct} />
            </div>
            <p className="font-mono-data text-on-surface-variant text-sm">
              {formatINR(summary.achieved_value)} of{" "}
              {formatINR(summary.target_value)}
            </p>
          </div>
          <div className="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden z-10">
            <div
              className="h-full bg-primary rounded-full relative"
              style={{ width: `${clamp(summary.achieved_pct)}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/30 animate-shimmer"></div>
            </div>
          </div>
        </div>

        {/* Team Median */}
        <div className="bg-surface-container-lowest p-lg rounded-xl shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-tertiary/5 rounded-full blur-2xl group-hover:bg-tertiary/10 transition-colors"></div>
          <div className="flex items-center justify-between z-10">
            <h3 className="font-label-uppercase text-on-surface-variant">
              Team Median
            </h3>
            <span className="material-symbols-outlined text-tertiary text-[20px]">
              leaderboard
            </span>
          </div>
          <div className="flex flex-col gap-xs z-10 mt-auto">
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-surface">
                {formatPct(teamMedianPct)}
              </span>
              <span className="font-body-md text-on-surface-variant text-sm">
                Baseline
              </span>
            </div>
            <p className="font-body-sm text-on-surface-variant">
              Across {rmsWithTargets.length} RM
              {rmsWithTargets.length === 1 ? "" : "s"} with active targets
            </p>
          </div>
        </div>

        {/* Lagging RMs */}
        <div className="bg-error-container/40 p-lg rounded-xl shadow-sm flex flex-col gap-md relative overflow-hidden group hover:bg-error-container/60 transition-colors cursor-pointer border-l-4 border-error">
          {lagging.length > 0 && (
            <div className="absolute right-2 top-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-error"></span>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between z-10">
            <h3 className="font-label-uppercase text-on-error-container">
              Lagging RMs
            </h3>
            <span className="material-symbols-outlined text-on-error-container text-[20px]">
              warning
            </span>
          </div>
          <div className="flex flex-col gap-xs z-10 mt-auto">
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-error-container">
                {lagging.length}
              </span>
              <span className="font-body-md text-on-error-container text-sm">
                {lagging.length === 1 ? "Active Alert" : "Active Alerts"}
              </span>
            </div>
            <p className="font-body-sm text-on-error-container/80 underline decoration-on-error-container/40 underline-offset-2">
              Review intervention plans
            </p>
          </div>
        </div>

        {/* Top Performers */}
        <div
          className="bg-surface-container-highest p-lg rounded-xl shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow bg-repeat"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZTBlM2U1Ij48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjZDhkYWRjIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+\")",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-highest to-surface-container-highest/80"></div>
          <div className="flex items-center justify-between z-10">
            <h3 className="font-label-uppercase text-on-surface">
              Top Performers
            </h3>
            <span
              className="material-symbols-outlined text-on-surface text-[20px]"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              star
            </span>
          </div>
          <div className="flex flex-col gap-xs z-10 mt-auto">
            <div className="flex items-baseline gap-xs">
              <span className="font-display-lg text-on-surface">
                {topPerformers.length}
              </span>
              <span className="font-body-md text-on-surface-variant text-sm">
                RMs &gt; 100%
              </span>
            </div>
            <div className="flex -space-x-2 overflow-hidden mt-1">
              {topPerformers.slice(0, 3).map((r) => (
                <AvatarBubble key={r.id} name={r.name} src={r.avatar_url} />
              ))}
              {topPerformers.length > 3 && (
                <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-variant ring-2 ring-surface-container-highest">
                  <span className="font-mono-data text-[10px] text-on-surface-variant">
                    +{topPerformers.length - 3}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Roster table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col mt-sm">
        <div className="p-lg flex flex-col sm:flex-row sm:items-center justify-between gap-md border-b border-surface-variant">
          <div className="flex items-center gap-sm">
            <h2 className="font-headline-md text-on-surface">
              Performance Roster
            </h2>
            <span className="px-xs py-[2px] bg-surface-container-high text-on-surface-variant font-mono-data text-xs rounded-md">
              {roster.length} Active
            </span>
          </div>
          <div className="flex items-center gap-xs">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                className="w-64 bg-surface-bright border border-surface-variant py-sm pl-10 pr-md rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-body-sm transition-shadow"
                placeholder="Search RMs..."
                type="text"
              />
            </div>
            <button className="p-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
              <span className="material-symbols-outlined">more_vert</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest border-b border-surface-variant font-label-uppercase text-on-surface-variant">
                <th className="px-lg py-sm font-semibold w-1/4 cursor-pointer hover:bg-surface-container-lowest/80 transition-colors group">
                  <div className="flex items-center gap-xs">
                    RM &amp; ID
                    <span className="material-symbols-outlined text-[16px] opacity-0 group-hover:opacity-100 transition-opacity">
                      arrow_drop_down
                    </span>
                  </div>
                </th>
                <th className="px-md py-sm font-semibold w-1/4">
                  Quota Progress
                </th>
                <th className="px-md py-sm font-semibold">Pacing</th>
                <th className="px-md py-sm font-semibold text-right">
                  Conv. Rate
                </th>
                <th className="px-md py-sm font-semibold text-right">
                  Overdue Tasks
                </th>
                <th className="px-lg py-sm font-semibold text-right">
                  Active Leads
                </th>
                <th className="px-md py-sm font-semibold w-12"></th>
              </tr>
            </thead>
            <tbody className="font-body-sm">
              {roster.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-lg py-xl text-center text-on-surface-variant"
                  >
                    No RMs report to you yet.
                  </td>
                </tr>
              ) : (
                roster.map((rm, idx) => (
                  <RosterRow key={rm.id} rm={rm} index={idx} />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-md border-t border-surface-variant flex items-center justify-between text-body-sm text-on-surface-variant">
          <span>
            Showing 1 to {roster.length} of {roster.length} entries
          </span>
          <div className="flex items-center gap-xs">
            <button
              className="px-sm py-xxs border border-surface-variant rounded text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
              disabled
            >
              Prev
            </button>
            <button
              className="px-sm py-xxs border border-surface-variant rounded text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
              disabled
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row + small presentational bits                                     */
/* ------------------------------------------------------------------ */

function RosterRow({ rm, index }: { rm: RosterRow; index: number }) {
  const pct = rm.achieved_pct;
  const pacing = pacingOf(pct);
  const conv = convRateFor(rm);
  // No overdue-tasks column in the query yet — approximate with tasks_remaining
  // capped so the badge stays legible.
  const overdue = Math.min(rm.tasks_remaining, 99);

  const rowBase =
    "border-b border-surface-variant hover:bg-surface-bright transition-colors group";
  const rowClass =
    pacing.tone === "lag" ? `${rowBase} bg-error-container/10 hover:bg-error-container/20` : rowBase;
  const firstCellClass =
    pacing.tone === "lag"
      ? "px-lg py-md border-l-2 border-error"
      : "px-lg py-md";

  const progressBarColor =
    pacing.tone === "lag"
      ? "bg-error"
      : pacing.tone === "ontrack"
        ? "bg-primary/70"
        : "bg-primary";

  return (
    <tr className={rowClass}>
      <td className={firstCellClass}>
        <div className="flex items-center gap-sm">
          <RmAvatar name={rm.name} src={rm.avatar_url} tone={initialsTone(index)} />
          <div className="flex flex-col min-w-0">
            <Link
              href={`/BM_dashboard/rm/${rm.id}`}
              className="font-semibold text-on-surface truncate hover:underline"
            >
              {rm.name}
            </Link>
            <span className="font-mono-data text-on-surface-variant text-xs truncate">
              {rmIdFor(rm)}
            </span>
          </div>
        </div>
      </td>
      <td className="px-md py-md align-middle">
        <div className="flex flex-col gap-[6px] w-full max-w-[160px]">
          <div className="flex justify-between items-end">
            <span className="font-mono-data text-on-surface font-medium">
              {formatPct(pct)}
            </span>
            <span className="font-mono-data text-on-surface-variant text-[11px]">
              {formatINR(rm.achieved_value)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden">
            <div
              className={`h-full ${progressBarColor} rounded-full`}
              style={{ width: `${clamp(pct)}%` }}
            ></div>
          </div>
        </div>
      </td>
      <td className="px-md py-md align-middle">
        {pacing.tone === "ahead" && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-tertiary-container/10 text-tertiary font-semibold text-xs border border-tertiary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ahead
          </span>
        )}
        {pacing.tone === "ontrack" && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-variant text-on-surface-variant font-semibold text-xs border border-outline-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-outline"></span> On
            Track
          </span>
        )}
        {pacing.tone === "lag" && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-error-container/50 text-on-error-container font-semibold text-xs border border-error/20">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>{" "}
            Lagging
          </span>
        )}
      </td>
      <td className="px-md py-md text-right font-mono-data text-on-surface align-middle">
        {conv.toFixed(1)}%
      </td>
      <td className="px-md py-md text-right align-middle">
        {overdue > 0 ? (
          <span
            className={
              overdue >= 5
                ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-error text-on-error font-mono-data text-xs font-semibold shadow-sm shadow-error/30"
                : "inline-flex items-center justify-center w-6 h-6 rounded-full bg-error-container text-on-error-container font-mono-data text-xs font-semibold"
            }
          >
            {overdue}
          </span>
        ) : (
          <span className="font-mono-data text-on-surface-variant">0</span>
        )}
      </td>
      <td className="px-lg py-md text-right font-mono-data text-on-surface align-middle">
        {rm.customer_count}
      </td>
      <td className="px-md py-md align-middle">
        <Link
          href={`/BM_dashboard/rm/${rm.id}`}
          className="inline-block p-[4px] text-on-surface-variant hover:text-primary hover:bg-primary-container/10 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <span className="material-symbols-outlined text-[20px]">
            chevron_right
          </span>
        </Link>
      </td>
    </tr>
  );
}

function PaceBadge({ deltaPct }: { deltaPct: number }) {
  const rounded = Math.round(deltaPct);
  if (rounded > 0) {
    return (
      <span className="font-body-md text-tertiary font-medium bg-tertiary-container/20 px-xs py-[2px] rounded text-xs inline-flex items-center gap-[2px]">
        <span className="material-symbols-outlined text-[12px]">
          arrow_upward
        </span>
        {rounded}% ahead
      </span>
    );
  }
  if (rounded < 0) {
    return (
      <span className="font-body-md text-error font-medium bg-error-container/40 px-xs py-[2px] rounded text-xs inline-flex items-center gap-[2px]">
        <span className="material-symbols-outlined text-[12px]">
          arrow_downward
        </span>
        {Math.abs(rounded)}% behind
      </span>
    );
  }
  return (
    <span className="font-body-md text-on-surface-variant text-sm">
      On pace
    </span>
  );
}

function AvatarBubble({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className="inline-block h-6 w-6 rounded-full ring-2 ring-surface-container-highest object-cover"
      />
    );
  }
  return (
    <div className="inline-block h-6 w-6 rounded-full ring-2 ring-surface-container-highest bg-primary text-on-primary flex items-center justify-center text-[9px] font-semibold">
      {initials(name)}
    </div>
  );
}

function RmAvatar({
  name,
  src,
  tone,
}: {
  name: string;
  src: string | null;
  tone: "primary" | "secondary" | "muted";
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className="w-8 h-8 rounded-full object-cover shadow-sm"
      />
    );
  }
  const toneClass =
    tone === "secondary"
      ? "bg-secondary-container text-on-secondary-container"
      : tone === "muted"
        ? "bg-surface-variant text-on-surface-variant"
        : "bg-primary-container text-on-primary-container";
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center font-headline-sm shadow-sm ${toneClass}`}
    >
      {initials(name)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function median(nums: number[]) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pacingOf(pct: number): {
  tone: "ahead" | "ontrack" | "lag";
} {
  if (pct >= 80) return { tone: "ahead" };
  if (pct >= 60) return { tone: "ontrack" };
  return { tone: "lag" };
}

function convRateFor(rm: RosterRow) {
  // Approximation until we surface real conversion metrics: closed / (open+closed).
  const total = rm.open_actions + rm.closed_actions;
  return total ? (rm.closed_actions / total) * 100 : 0;
}

function rmIdFor(rm: RosterRow) {
  // Stable short id derived from the uuid — real employee ids come later.
  const tail = rm.id.replace(/-/g, "").slice(-3).toUpperCase();
  return `RM-${tail}`;
}

function initialsTone(idx: number): "primary" | "secondary" | "muted" {
  const wheel: Array<"primary" | "secondary" | "muted"> = [
    "primary",
    "secondary",
    "muted",
  ];
  return wheel[idx % wheel.length];
}
