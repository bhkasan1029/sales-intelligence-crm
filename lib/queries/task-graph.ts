import { sql } from "@/lib/db";
import { greedySetCover } from "@/lib/set-cover";

export type GraphNode = {
  id: string;
  label: string;
  type: "action" | "task";
  group: string;
  val: number;
  color?: string;
  priority_score?: number;
};

export type GraphLink = {
  source: string;
  target: string;
  weight: number;
  recommended: boolean;
};

export type CoverageData = {
  selectedTasks: string[];
  coverage: Record<string, string[]>;
  uncoveredActions: string[];
  totalActions: number;
  totalTasks: number;
  minTasksNeeded: number;
};

export type TaskGraphResult = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  coverage: CoverageData;
};

const ACTION_COLORS: Record<string, string> = {
  follow_up_breach: "#EF4444",
  opportunity_at_risk: "#F59E0B",
  stale_pipeline: "#8B5CF6",
  target_gap: "#3B82F6",
  meeting_no_outcome: "#EC4899",
  major_win: "#10B981",
  target_achievement: "#14B8A6",
  escalated_breach: "#DC2626",
};

/**
 * Bipartite action↔task graph for a branch, plus the minimum-cover set of
 * tasks (greedy) that clears every open action. Everything is scoped by the
 * caller's manager_id inside SQL — no per-row JS filter afterwards.
 */
export async function getBranchTaskGraph(
  bmId: string,
): Promise<TaskGraphResult> {
  const rmRows = await sql`
    SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'`;
  const rmIds = rmRows.map((r) => r.id as string);

  if (rmIds.length === 0) {
    return {
      graph: { nodes: [], links: [] },
      coverage: {
        selectedTasks: [],
        coverage: {},
        uncoveredActions: [],
        totalActions: 0,
        totalTasks: 0,
        minTasksNeeded: 0,
      },
    };
  }

  const [actions, tasks, links, customers] = await Promise.all([
    sql`SELECT id, type, priority_score, message, customer_id
        FROM actions
        WHERE rm_id = ANY(${rmIds}) AND status IN ('open', 'snoozed')`,
    sql`SELECT DISTINCT t.id, t.title
        FROM tasks t
        JOIN action_tasks at ON at.task_id = t.id
        JOIN actions a ON a.id = at.action_id
        WHERE a.rm_id = ANY(${rmIds}) AND a.status IN ('open', 'snoozed')`,
    sql`SELECT at.action_id, at.task_id, at.weight
        FROM action_tasks at
        JOIN actions a ON a.id = at.action_id
        WHERE a.rm_id = ANY(${rmIds}) AND a.status IN ('open', 'snoozed')`,
    sql`SELECT id, name FROM customers WHERE rm_id = ANY(${rmIds})`,
  ]);

  const custName = new Map<string, string>();
  for (const c of customers) custName.set(c.id as string, c.name as string);

  const taskCoverage = new Map<string, Set<string>>();
  for (const l of links) {
    const t = l.task_id as string;
    const a = l.action_id as string;
    let s = taskCoverage.get(t);
    if (!s) {
      s = new Set();
      taskCoverage.set(t, s);
    }
    s.add(a);
  }

  const actionIds = actions.map((a) => a.id as string);
  const { selected, uncovered } = greedySetCover(actionIds, taskCoverage);
  const selectedSet = new Set(selected);

  const nodes: GraphNode[] = [
    ...actions.map((a): GraphNode => {
      const cust = custName.get(a.customer_id as string);
      const label = cust ?? ((a.message as string) ?? "Action").slice(0, 28);
      return {
        id: a.id as string,
        label,
        type: "action",
        group: a.type as string,
        val: 6,
        color: ACTION_COLORS[a.type as string] ?? "#6B7280",
        priority_score: Number(a.priority_score ?? 0),
      };
    }),
    ...tasks.map(
      (t): GraphNode => ({
        id: t.id as string,
        label: t.title as string,
        type: "task",
        group: "task",
        val: 10,
      }),
    ),
  ];

  const graphLinks: GraphLink[] = links.map((l) => ({
    source: l.action_id as string,
    target: l.task_id as string,
    weight: Number(l.weight ?? 1),
    recommended: selectedSet.has(l.task_id as string),
  }));

  const coverageMap: Record<string, string[]> = {};
  for (const [taskId, actSet] of taskCoverage) {
    coverageMap[taskId] = [...actSet];
  }

  return {
    graph: { nodes, links: graphLinks },
    coverage: {
      selectedTasks: selected,
      coverage: coverageMap,
      uncoveredActions: uncovered,
      totalActions: actionIds.length,
      totalTasks: tasks.length,
      minTasksNeeded: selected.length,
    },
  };
}
