import {
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  SectionHeading,
  StatCard,
  StatGrid,
} from "@/components/dashboard-ui";
import type { RmDetail, RmTask } from "@/lib/queries/branch";
import {
  formatDate,
  formatINR,
  formatPct,
  formatPeriod,
  formatRelative,
  humanise,
  monthProgress,
  toneForPct,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The whole "how is this RM doing" block: headline stats, target run-rate,
 * task completion, and the self-evaluation history.
 *
 * `viewer` only changes the copy — an RM opening their own self-evaluation page
 * and a branch manager drilling into that RM see the identical breakdown, which
 * is the point: neither side can argue with a number the other cannot see.
 */
export default function RmPerformance({
  detail,
  viewer = "manager",
}: {
  detail: RmDetail;
  viewer?: "manager" | "self";
}) {
  const first = detail.rm.name.split(" ")[0];
  const who = viewer === "self" ? "You" : first;
  const possessive = viewer === "self" ? "your" : `${first}'s`;

  const tone = toneForPct(detail.achieved_pct);
  const { elapsedDays, totalDays, pct: monthPct } = monthProgress();
  const runRateGap = detail.achieved_pct - monthPct;

  const completedTasks = detail.tasks.filter((t) => t.completed);
  const remainingTasks = detail.tasks.filter((t) => !t.completed);

  return (
    <div className="space-y-8">
      <StatGrid>
        <StatCard
          label="Target achieved"
          value={formatPct(detail.achieved_pct)}
          tone={tone.text}
          progress={detail.achieved_pct}
          hint={`${formatINR(detail.achieved_value)} of ${formatINR(detail.target_value)} · ${formatPeriod(detail.period)}`}
        />
        <StatCard
          label="Tasks completed"
          value={`${detail.tasks_completed}/${detail.tasks_total}`}
          progress={detail.task_completion_pct}
          hint={`${detail.tasks_remaining} still open`}
        />
        <StatCard
          label="Open actions"
          value={detail.open_total}
          hint={`${detail.closed_actions} closed · ${formatPct(detail.closure_pct)} closure rate`}
        />
        <StatCard
          label="Pipeline"
          value={formatINR(detail.pipeline_value)}
          hint={`${detail.customer_count} customers · ${detail.customers_active} active`}
        />
      </StatGrid>

      {/* Same action/customer breakdown the RM sees on their self-evaluation page. */}
      <section>
        <SectionHeading title="Actions" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBox label="Open" value={detail.open_actions} />
          <StatBox label="Snoozed" value={detail.snoozed_actions} />
          <StatBox label="Closed (7d)" value={detail.closed_week} />
          <StatBox label="Closed (all)" value={detail.closed_actions} />
        </div>
      </section>

      <section>
        <SectionHeading title="Customers" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBox label="Total" value={detail.customer_count} />
          <StatBox label="New leads" value={detail.customers_new} />
          <StatBox label="In progress" value={detail.customers_in_progress} />
          <StatBox label="Active" value={detail.customers_active} />
        </div>
      </section>

      {/* ---------------- Performance ---------------- */}
      <section>
        <SectionHeading
          title="Performance"
          subtitle={`How ${possessive} month is tracking against the run-rate.`}
        />

        <Card className="p-6">
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-[#1A1A1A]">
                {formatINR(detail.achieved_value)}{" "}
                <span className="font-normal text-gray-400">
                  of {formatINR(detail.target_value)}
                </span>
              </p>
              <Pill className={tone.badge}>{tone.label}</Pill>
            </div>

            <div className="relative">
              <ProgressBar pct={detail.achieved_pct} barClass={tone.bar} className="h-2.5" />
              {/* expected run-rate marker for today */}
              <div
                className="absolute top-0 h-2.5 w-px bg-[#1A1A1A]"
                style={{ left: `${Math.min(100, monthPct)}%` }}
                title={`Expected by day ${elapsedDays}`}
              />
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Day {elapsedDays} of {totalDays} — expected {formatPct(monthPct)},{" "}
              {runRateGap >= 0 ? (
                <span className="font-medium text-emerald-700">
                  {formatPct(Math.abs(runRateGap))} ahead of pace
                </span>
              ) : (
                <span className="font-medium text-red-700">
                  {formatPct(Math.abs(runRateGap))} behind pace
                </span>
              )}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-4">
            <Metric
              label="Closure rate"
              value={formatPct(detail.closure_pct)}
              hint={`${detail.closed_actions} of ${detail.closed_actions + detail.open_total} actions`}
            />
            <Metric
              label="Avg time to close"
              value={
                detail.avg_days_to_close == null
                  ? "—"
                  : `${detail.avg_days_to_close.toFixed(1)}d`
              }
              hint="From raised to resolved"
            />
            <Metric
              label="Avg open priority"
              value={detail.avg_open_priority.toFixed(0)}
              hint="Higher means more urgent"
            />
            <Metric
              label="Last activity"
              value={formatRelative(detail.last_activity_at)}
              hint="Most recent logged event"
            />
          </dl>
        </Card>
      </section>

      {/* ---------------- Tasks ---------------- */}
      <section>
        <SectionHeading
          title="Tasks"
          subtitle={`${detail.tasks_remaining} remaining, ${detail.tasks_completed} completed. Each task groups the actions that close together.`}
        />

        {detail.tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            hint={`${who} ${viewer === "self" ? "have" : "has"} no actions grouped into tasks for this period.`}
          />
        ) : (
          <div className="space-y-6">
            <TaskGroup
              heading="Remaining"
              count={remainingTasks.length}
              tasks={remainingTasks}
              emptyLabel="Nothing outstanding — every task is closed."
            />
            <TaskGroup
              heading="Completed"
              count={completedTasks.length}
              tasks={completedTasks}
              emptyLabel="No tasks completed yet this period."
            />
          </div>
        )}
      </section>

      {/* ---------------- Self-evaluations ---------------- */}
      <section>
        <SectionHeading
          title="Self-evaluations"
          subtitle={
            viewer === "self"
              ? "What you submitted, and how it lines up with the numbers above."
              : `What ${first} submitted, alongside the numbers above.`
          }
        />

        {detail.self_evaluations.length === 0 ? (
          <EmptyState
            title="No self-evaluation submitted"
            hint={`${who} ${viewer === "self" ? "have" : "has"} not filed one for any period yet.`}
          />
        ) : (
          <div className="space-y-3">
            {detail.self_evaluations.map((se) => (
              <Card key={se.id} className="p-5">
                <div className="mb-2 flex items-center gap-3">
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {formatPeriod(se.period)}
                  </p>
                  <RatingDots rating={se.self_rating} />
                  <span className="text-xs text-gray-400">
                    filed {formatDate(se.created_at)}
                  </span>
                </div>
                {se.notes && (
                  <p className="text-sm leading-relaxed text-gray-600">{se.notes}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Bare number tile — same shape as the one on the self-evaluation page. */
function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-[#1A1A1A]">{value}</dd>
      <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>
    </div>
  );
}

function TaskGroup({
  heading,
  count,
  tasks,
  emptyLabel,
}: {
  heading: string;
  count: number;
  tasks: RmTask[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {heading}
        </p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
          {count}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: RmTask }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white open:border-gray-300">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              task.completed ? "bg-emerald-500" : "bg-amber-500"
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#1A1A1A]">
              {/* Engine-generated titles are SHOUTED action types; leave
                  human-written ones (customer names) exactly as stored. */}
              {task.title === task.title.toUpperCase()
                ? humanise(task.title)
                : task.title}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {task.action_count} action{task.action_count === 1 ? "" : "s"}
              {task.completed
                ? " · all closed"
                : ` · ${task.open_count} still open`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Pill
            className={
              task.completed
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {task.completed ? "Completed" : "Remaining"}
          </Pill>
          <span className="text-xs text-gray-400 group-open:hidden">Show</span>
          <span className="hidden text-xs text-gray-400 group-open:inline">Hide</span>
        </div>
      </summary>

      <div className="border-t border-gray-100 px-4 py-3">
        {task.actions.length === 0 ? (
          <p className="text-xs text-gray-400">No actions linked to this task.</p>
        ) : (
          <ul className="space-y-3">
            {task.actions.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Pill>{humanise(a.type)}</Pill>
                    {a.customer_name && (
                      <span className="text-xs text-gray-500">{a.customer_name}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      priority {a.priority_score.toFixed(0)}
                    </span>
                  </div>
                  <p className="text-sm text-[#1A1A1A]">{a.message}</p>
                  {a.reason && (
                    <p className="mt-0.5 text-xs text-gray-500">{a.reason}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <Pill
                    className={
                      a.status === "open"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }
                  >
                    {a.status}
                  </Pill>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {formatRelative(a.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function RatingDots({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-xs text-gray-400">unrated</span>;
  }
  return (
    <span className="flex items-center gap-1" title={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i <= rating ? "bg-[#1A1A1A]" : "bg-gray-200"
          )}
        />
      ))}
      <span className="ml-1 text-xs text-gray-500">{rating}/5</span>
    </span>
  );
}
