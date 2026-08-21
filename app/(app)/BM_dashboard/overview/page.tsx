import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import ExportButton from "@/components/export-button";
import {
  getBranchIntelligence,
  getBranchRunRate,
  getBranchTopClients,
  type BranchIntelligence,
  type BranchRunRate,
  type BranchTopClient,
  type RunRatePoint,
} from "@/lib/queries/branch";
import { formatINR, formatPct, humanise, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function BMReportsAnalyticsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "branch_manager") redirect(ROLE_HOME[session.role]);

  const [runRate, topClients, intel] = await Promise.all([
    getBranchRunRate(session.user_id),
    getBranchTopClients(session.user_id, 5),
    getBranchIntelligence(session.user_id),
  ]);

  return (
    <div className="flex flex-col w-full px-xl pb-xl gap-xl">
      {/* Page header */}
      <div className="flex flex-col gap-xxs mt-sm">
        <h1 className="font-display-lg text-on-surface">Reports & Analytics</h1>
        <p className="font-body-lg text-on-surface-variant">
          Real-time operational metrics and run-rate pacing.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-lg">
        {/* Main column */}
        <div className="xl:col-span-2 flex flex-col gap-lg">
          <RunRateCard data={runRate} />
          <TopClientsCard clients={topClients} />
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-xl">
          <AutomatedIntelligence intel={intel} />
          <SpecialAchievements intel={intel} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Run-Rate Pacing                                                     */
/* ------------------------------------------------------------------ */

function RunRateCard({ data }: { data: BranchRunRate }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex flex-col gap-xxs">
          <h2 className="font-headline-md text-on-surface">Run-Rate Pacing</h2>
          <p className="font-body-sm text-on-surface-variant">
            Actual vs. Target ({data.period_label})
          </p>
        </div>
        <div className="flex items-center gap-md text-body-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
            Actual
          </span>
          <span className="inline-flex items-center gap-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-surface-container-highest"></span>
            Target
          </span>
        </div>
      </div>

      <RunRateChart data={data} />
    </section>
  );
}

function RunRateChart({ data }: { data: BranchRunRate }) {
  const points = data.points;
  const width = 720;
  const height = 260;
  const padding = { top: 32, right: 24, bottom: 32, left: 24 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxValue = Math.max(
    ...points.map((p) => Math.max(p.target, p.actual ?? 0)),
    1
  );

  const xFor = (week: number) =>
    padding.left + ((week - 1) / Math.max(1, data.weeks_in_quarter - 1)) * plotW;
  const yFor = (value: number) =>
    padding.top + plotH - (value / maxValue) * plotH;

  const actualPoints = points.filter(
    (p): p is RunRatePoint & { actual: number } => p.actual != null
  );

  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.week)},${yFor(p.actual)}`)
    .join(" ");
  const areaPath =
    actualPoints.length > 0
      ? `${actualPath} L${xFor(actualPoints[actualPoints.length - 1].week)},${
          padding.top + plotH
        } L${xFor(actualPoints[0].week)},${padding.top + plotH} Z`
      : "";
  const targetPath = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${xFor(p.week)},${yFor(p.target)}`
    )
    .join(" ");

  const currentPoint = actualPoints[actualPoints.length - 1];
  const currentX = currentPoint ? xFor(currentPoint.week) : null;
  const currentY = currentPoint ? yFor(currentPoint.actual) : null;

  const hasData = data.branch_target > 0 || currentPoint != null;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[260px]"
        preserveAspectRatio="none"
        aria-label={`Run-rate pacing for ${data.period_label}`}
      >
        <defs>
          <linearGradient id="runRateArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {hasData && (
          <>
            {areaPath && <path d={areaPath} fill="url(#runRateArea)" />}
            <path
              d={targetPath}
              fill="none"
              stroke="var(--color-surface-dim)"
              strokeWidth="2"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
            {actualPoints.length > 1 && (
              <path
                d={actualPath}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {currentX != null && currentY != null && (
              <>
                <line
                  x1={currentX}
                  x2={currentX}
                  y1={currentY}
                  y2={padding.top + plotH}
                  stroke="var(--color-outline-variant)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
                <circle
                  cx={currentX}
                  cy={currentY}
                  r="6"
                  fill="var(--color-inverse-surface)"
                  stroke="var(--color-surface-container-lowest)"
                  strokeWidth="2"
                />
                <g transform={`translate(${currentX}, ${currentY - 18})`}>
                  <rect
                    x="-28"
                    y="-18"
                    width="56"
                    height="22"
                    rx="4"
                    fill="var(--color-inverse-surface)"
                  />
                  <text
                    x="0"
                    y="-3"
                    textAnchor="middle"
                    fill="var(--color-inverse-on-surface)"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="Inter, sans-serif"
                  >
                    {formatINR(currentPoint!.actual)}
                  </text>
                </g>
              </>
            )}
          </>
        )}

        {!hasData && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill="var(--color-on-surface-variant)"
            fontSize="14"
            fontFamily="Inter, sans-serif"
          >
            No pacing data for this quarter yet
          </text>
        )}
      </svg>

      <div
        className="grid font-body-sm text-on-surface-variant mt-xs px-[24px]"
        style={{
          gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
        }}
      >
        {points.map((p) => (
          <span
            key={p.week}
            className={cn(
              "text-center",
              p.is_current && "font-semibold text-on-surface"
            )}
          >
            {p.is_current ? `${p.label} (Current)` : p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Branch Top Clients                                                  */
/* ------------------------------------------------------------------ */

function TopClientsCard({ clients }: { clients: BranchTopClient[] }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col">
      <div className="p-lg flex items-start justify-between gap-md border-b border-outline-variant">
        <div className="flex flex-col gap-xxs">
          <h2 className="font-headline-md text-on-surface">Branch Top Clients</h2>
          <p className="font-body-sm text-on-surface-variant">
            Top 5 entities by current period volume
          </p>
        </div>
        <ExportButton
          rows={clients as unknown as Record<string, unknown>[]}
          filename="top-clients.csv"
          className="inline-flex items-center gap-xs px-md py-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-headline-sm rounded-lg transition-colors shadow-sm text-body-sm disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export
        </ExportButton>
      </div>

      {clients.length === 0 ? (
        <div className="p-lg text-center text-on-surface-variant text-body-sm">
          No clients assigned to this branch yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant font-label-uppercase text-on-surface-variant">
                <th className="px-lg py-sm font-semibold">Client / Entity</th>
                <th className="px-md py-sm font-semibold">Primary RM</th>
                <th className="px-md py-sm font-semibold text-right">
                  YTD Volume
                </th>
                <th className="px-md py-sm font-semibold text-right">
                  Growth YoY
                </th>
                <th className="px-lg py-sm font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="font-body-sm">
              {clients.map((c) => (
                <ClientRow key={c.id} client={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClientRow({ client }: { client: BranchTopClient }) {
  const status = statusForStage(client.stage);
  return (
    <tr className="border-b border-outline-variant last:border-b-0 hover:bg-surface-bright transition-colors">
      <td className="px-lg py-md">
        <div className="flex items-center gap-sm">
          <div className="w-8 h-8 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center font-headline-sm shadow-sm shrink-0">
            {initials(client.name)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-on-surface truncate">
              {client.name}
            </span>
            <span className="font-mono-data text-on-surface-variant text-xs truncate">
              ID: {shortId(client.id)}
              {client.segment ? ` · ${humanise(client.segment)}` : ""}
            </span>
          </div>
        </div>
      </td>
      <td className="px-md py-md text-on-surface align-middle">
        {client.rm_name}
      </td>
      <td className="px-md py-md text-right font-mono-data font-semibold text-on-surface align-middle">
        {formatINR(client.ytd_volume)}
      </td>
      <td className="px-md py-md text-right font-mono-data text-on-surface-variant align-middle">
        —
      </td>
      <td className="px-lg py-md text-right align-middle">
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-1 text-xs font-semibold",
            status.className
          )}
        >
          {status.label}
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Automated Intelligence                                              */
/* ------------------------------------------------------------------ */

function AutomatedIntelligence({ intel }: { intel: BranchIntelligence }) {
  const hasSlaAlert = intel.sla_breaches > 0;
  const hasLatencyAlert =
    intel.latency_change_pct != null && intel.latency_change_pct > 0;

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-xs">
        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
          warning
        </span>
        <h3 className="font-headline-sm text-on-surface">
          Automated Intelligence
        </h3>
      </div>

      <div className="flex flex-col gap-sm">
        {hasSlaAlert ? (
          <IntelCard
            tone="error"
            icon="pie_chart"
            title="SLA Breach Warning"
            timestamp="2h ago"
            body={`${formatPct(intel.sla_breach_pct)} pay-in SLA breaches detected across branch operations today.`}
            linkLabel="Investigate"
            href="/BM_dashboard"
          />
        ) : (
          <IntelCard
            tone="muted"
            icon="verified"
            title="SLA On Track"
            timestamp="now"
            body="No open actions are past their SLA deadline right now."
          />
        )}

        {hasLatencyAlert ? (
          <IntelCard
            tone="muted"
            icon="speed"
            title="Latency Increase"
            timestamp="4h ago"
            body={`${formatPct(
              intel.latency_change_pct!
            )} rise in average time-to-close vs the prior 30 days.`}
          />
        ) : intel.latency_change_pct != null ? (
          <IntelCard
            tone="muted"
            icon="speed"
            title="Latency Improving"
            timestamp="4h ago"
            body={`Average time-to-close is ${formatPct(
              Math.abs(intel.latency_change_pct)
            )} faster than the prior 30 days.`}
          />
        ) : (
          <IntelCard
            tone="muted"
            icon="speed"
            title="Latency"
            timestamp="—"
            body="Not enough closed actions in the last 7 days to compute a trend."
          />
        )}
      </div>
    </section>
  );
}

function IntelCard({
  tone,
  icon,
  title,
  timestamp,
  body,
  linkLabel,
  href,
}: {
  tone: "error" | "muted";
  icon: string;
  title: string;
  timestamp: string;
  body: string;
  linkLabel?: string;
  href?: string;
}) {
  const iconWrap =
    tone === "error"
      ? "bg-error-container text-error"
      : "bg-surface-container-high text-on-surface-variant";
  const titleClass =
    tone === "error" ? "text-error font-headline-sm" : "text-on-surface font-headline-sm";

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-md flex gap-sm items-start">
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
          iconWrap
        )}
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </div>
      <div className="flex flex-col gap-xxs min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-xs">
          <span className={titleClass}>{title}</span>
          <span className="font-label-uppercase text-on-surface-variant text-[10px] shrink-0">
            {timestamp}
          </span>
        </div>
        <p className="font-body-sm text-on-surface-variant">{body}</p>
        {linkLabel && href && (
          <Link
            href={href}
            className={cn(
              "font-body-sm font-semibold inline-flex items-center gap-xxs mt-xxs",
              tone === "error" ? "text-error" : "text-primary"
            )}
          >
            {linkLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Special Achievements                                                */
/* ------------------------------------------------------------------ */

function SpecialAchievements({ intel }: { intel: BranchIntelligence }) {
  const hasWin =
    intel.top_performer_name != null && intel.top_performer_over_pct != null;

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-xs">
        <span
          className="material-symbols-outlined text-on-surface-variant text-[18px]"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          workspace_premium
        </span>
        <h3 className="font-headline-sm text-on-surface">
          Special Achievements
        </h3>
      </div>

      {hasWin ? (
        <div className="rounded-xl shadow-sm p-md flex gap-sm items-start bg-tertiary-container text-on-tertiary-container">
          <div className="w-9 h-9 rounded-full bg-tertiary-container/60 flex items-center justify-center shrink-0 border border-on-tertiary-container/20">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              workspace_premium
            </span>
          </div>
          <div className="flex flex-col gap-xxs">
            <span className="font-headline-sm">Target Exceeded</span>
            <p className="font-body-sm opacity-90">
              {intel.top_performer_name} exceeded their target by{" "}
              {formatPct(intel.top_performer_over_pct!)} this period.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl shadow-sm p-md bg-surface-container-lowest text-on-surface-variant">
          <p className="font-body-sm">
            No RM has crossed 100% of target yet this period. Highlights will
            appear here as they land.
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function shortId(uuid: string) {
  const tail = uuid.replace(/-/g, "").slice(-6).toUpperCase();
  return `${tail.slice(0, 3)}-${tail.slice(3)}`;
}

function statusForStage(stage: string): { label: string; className: string } {
  switch (stage) {
    case "active":
      return {
        label: "Active",
        className: "bg-tertiary-container text-on-tertiary-container",
      };
    case "in_progress":
      return {
        label: "In Progress",
        className: "bg-primary-container text-on-primary-container",
      };
    case "new":
      return {
        label: "New",
        className: "bg-secondary-container text-on-secondary-container",
      };
    case "churn":
    case "lost":
      return {
        label: "Review",
        className: "bg-error-container text-on-error-container",
      };
    default:
      return {
        label: humanise(stage || "review"),
        className: "bg-surface-container-high text-on-surface-variant",
      };
  }
}
