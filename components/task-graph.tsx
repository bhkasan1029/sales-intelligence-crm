"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { StatCard, Card, Pill } from "@/components/dashboard-ui";
import type {
  CoverageData,
  GraphLink,
  GraphNode,
} from "@/lib/queries/task-graph";

type InitialData = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  coverage: CoverageData;
};

// Hardcoded demo dataset — 8 actions, 5 tasks, overlapping coverage designed
// so greedy set-cover picks exactly 3 tasks (T-hni + T-1on1 + T-cross). Used
// when the "Show demo dataset" toggle is on. Nothing in this dataset touches
// the DB — it's purely visual.
const DEMO: InitialData = {
  graph: {
    nodes: [
      { id: "a1", label: "Meridian Textiles", type: "action", group: "follow_up_breach", val: 6, color: "#EF4444", priority_score: 92 },
      { id: "a2", label: "Priya Enterprises", type: "action", group: "follow_up_breach", val: 6, color: "#EF4444", priority_score: 87 },
      { id: "a3", label: "Karan Oberoi", type: "action", group: "opportunity_at_risk", val: 6, color: "#F59E0B", priority_score: 82 },
      { id: "a4", label: "Suresh Traders", type: "action", group: "opportunity_at_risk", val: 6, color: "#F59E0B", priority_score: 78 },
      { id: "a5", label: "Nikita Advani", type: "action", group: "stale_pipeline", val: 6, color: "#8B5CF6", priority_score: 71 },
      { id: "a6", label: "Rohit Kapoor", type: "action", group: "target_gap", val: 6, color: "#3B82F6", priority_score: 66 },
      { id: "a7", label: "Farah Sheikh", type: "action", group: "meeting_no_outcome", val: 6, color: "#EC4899", priority_score: 58 },
      { id: "a8", label: "Aakash Iyer", type: "action", group: "major_win", val: 6, color: "#10B981", priority_score: 54 },
      { id: "t-hni", label: "Morning HNI calls", type: "task", group: "task", val: 10 },
      { id: "t-kyc", label: "Send KYC packets", type: "task", group: "task", val: 10 },
      { id: "t-cross", label: "Cross-sell campaign", type: "task", group: "task", val: 10 },
      { id: "t-1on1", label: "Weekly RM 1:1", type: "task", group: "task", val: 10 },
      { id: "t-stalled", label: "Review stalled deals", type: "task", group: "task", val: 10 },
    ],
    links: [
      { source: "a1", target: "t-hni", weight: 1, recommended: true },
      { source: "a2", target: "t-hni", weight: 1, recommended: true },
      { source: "a3", target: "t-hni", weight: 1, recommended: true },
      { source: "a1", target: "t-kyc", weight: 1, recommended: false },
      { source: "a2", target: "t-kyc", weight: 1, recommended: false },
      { source: "a3", target: "t-cross", weight: 1, recommended: true },
      { source: "a4", target: "t-cross", weight: 1, recommended: true },
      { source: "a5", target: "t-cross", weight: 1, recommended: true },
      { source: "a8", target: "t-cross", weight: 1, recommended: true },
      { source: "a5", target: "t-1on1", weight: 1, recommended: false },
      { source: "a6", target: "t-1on1", weight: 1, recommended: true },
      { source: "a7", target: "t-1on1", weight: 1, recommended: true },
      { source: "a6", target: "t-stalled", weight: 1, recommended: false },
      { source: "a7", target: "t-stalled", weight: 1, recommended: false },
      { source: "a8", target: "t-stalled", weight: 1, recommended: false },
    ],
  },
  coverage: {
    selectedTasks: ["t-hni", "t-cross", "t-1on1"],
    coverage: {
      "t-hni": ["a1", "a2", "a3"],
      "t-kyc": ["a1", "a2"],
      "t-cross": ["a3", "a4", "a5", "a8"],
      "t-1on1": ["a5", "a6", "a7"],
      "t-stalled": ["a6", "a7", "a8"],
    },
    uncoveredActions: [],
    totalActions: 8,
    totalTasks: 5,
    minTasksNeeded: 3,
  },
};

export default function TaskGraphClient({
  initialData,
}: {
  initialData: InitialData;
}) {
  const [useDemo, setUseDemo] = useState(true);
  const active = useDemo ? DEMO : initialData;
  const nodes = active.graph.nodes;
  const links = active.graph.links;
  const coverage = active.coverage;
  const [view, setView] = useState<"graph" | "matrix">("graph");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (view !== "graph" || nodes.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.parentElement!.clientWidth;
    const cssH = 500;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW;
    const H = cssH;

    // Bipartite layout: actions in left column (priority-desc), tasks in right column.
    const actionNodes = nodes
      .filter((n) => n.type === "action")
      .slice()
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    const taskNodes = nodes.filter((n) => n.type === "task");

    const pos = new Map<string, { x: number; y: number; node: GraphNode }>();
    const laneY = (i: number, total: number) =>
      40 + ((H - 80) * (i + 0.5)) / Math.max(1, total);

    actionNodes.forEach((n, i) => {
      pos.set(n.id, { x: W * 0.25, y: laneY(i, actionNodes.length), node: n });
    });
    taskNodes.forEach((n, i) => {
      pos.set(n.id, { x: W * 0.75, y: laneY(i, taskNodes.length), node: n });
    });

    ctx.clearRect(0, 0, W, H);

    // Column headers
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.textAlign = "center";
    ctx.fillText("ACTIONS  (priority-ranked)", W * 0.25, 22);
    ctx.fillText("TASKS  (grouped)", W * 0.75, 22);

    // Links behind nodes
    for (const link of links) {
      const src = pos.get(link.source);
      const tgt = pos.get(link.target);
      if (!src || !tgt) continue;
      const targetSelected = coverage.selectedTasks.includes(tgt.node.id);
      const highlight = link.recommended && targetSelected;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      const mx = src.x + (tgt.x - src.x) * 0.5;
      ctx.bezierCurveTo(mx, src.y, mx, tgt.y, tgt.x, tgt.y);
      ctx.strokeStyle = highlight
        ? "#2563EB"
        : link.recommended
        ? "#93C5FD"
        : "#D1D5DB";
      ctx.lineWidth = highlight ? 2.5 : 1.5;
      if (!link.recommended) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Nodes on top
    for (const [, { x, y, node }] of pos) {
      const isTask = node.type === "task";
      const selected = coverage.selectedTasks.includes(node.id);
      const r = isTask ? 20 : 14;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (isTask) {
        ctx.fillStyle = selected ? "#2563EB" : "#E5E7EB";
        ctx.fill();
        ctx.strokeStyle = selected ? "#1E40AF" : "#9CA3AF";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = node.color ?? "#6B7280";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.font = "500 11px system-ui, sans-serif";
      ctx.fillStyle = "#374151";
      ctx.textAlign = isTask ? "left" : "right";
      const labelX = isTask ? x + r + 6 : x - r - 6;
      const label =
        node.label.length > 24 ? node.label.slice(0, 22) + "…" : node.label;
      ctx.fillText(label, labelX, y + 3);

      if (!isTask && node.priority_score) {
        ctx.font = "700 9px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(String(Math.round(node.priority_score)), x, y + 3);
      }
      if (isTask && selected) {
        ctx.font = "700 12px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText("✓", x, y + 4);
      }
    }
  }, [nodes, links, coverage, view]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setUseDemo(true)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              useDemo
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-[#1A1A1A]",
            )}
          >
            Demo dataset
          </button>
          <button
            type="button"
            onClick={() => setUseDemo(false)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              !useDemo
                ? "bg-[#1A1A1A] text-white"
                : "text-gray-500 hover:text-[#1A1A1A]",
            )}
          >
            Live data
          </button>
        </div>
        {useDemo && (
          <span className="text-[11px] text-gray-500">
            hardcoded demo · 8 actions · 5 tasks · min cover = 3
          </span>
        )}
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-600">
            No open actions on your team right now.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Once actions accumulate, the coverage map appears here — or switch to demo data above.
          </p>
        </div>
      ) : (
      <>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total actions" value={coverage.totalActions} />
        <StatCard label="Total tasks" value={coverage.totalTasks} />
        <StatCard
          label="Min tasks needed"
          value={coverage.minTasksNeeded}
          hint="for full coverage"
        />
        <StatCard
          label="Uncovered"
          value={coverage.uncoveredActions.length}
          tone={
            coverage.uncoveredActions.length > 0
              ? "text-red-600"
              : "text-emerald-600"
          }
        />
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setView("graph")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            view === "graph"
              ? "bg-[#1A1A1A] text-white"
              : "text-gray-500 hover:text-[#1A1A1A]",
          )}
        >
          Graph view
        </button>
        <button
          type="button"
          onClick={() => setView("matrix")}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            view === "matrix"
              ? "bg-[#1A1A1A] text-white"
              : "text-gray-500 hover:text-[#1A1A1A]",
          )}
        >
          Matrix view
        </button>
      </div>

      {view === "graph" ? (
        <Card>
          <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-6 rounded bg-blue-600" /> Recommended path
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-6 border-t-2 border-dashed border-gray-300" />{" "}
              Redundant
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-blue-600" /> Selected task
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-gray-400 bg-gray-200" />{" "}
              Unselected task
            </span>
          </div>
          <div className="w-full">
            <canvas ref={canvasRef} className="block h-[500px] w-full" />
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Covers</th>
                <th className="px-4 py-3">Min set</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {nodes
                .filter((n) => n.type === "task")
                .map((t) => {
                  const isSelected = coverage.selectedTasks.includes(t.id);
                  const covered = (coverage.coverage[t.id] ?? []).length;
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                        {t.label}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {covered} action{covered === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3">
                        {isSelected ? (
                          <Pill className="border-blue-200 bg-blue-50 text-blue-700">
                            Selected
                          </Pill>
                        ) : (
                          <Pill>Optional</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSelected ? (
                          <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            Priority
                          </Pill>
                        ) : (
                          <Pill>Can skip</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      )}
      </>
      )}
    </>
  );
}
