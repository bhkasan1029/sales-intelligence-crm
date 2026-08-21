import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getAllTickets } from "@/lib/queries/branch";
import ExportButton from "@/components/export-button";
import TicketsTable, {
  type Ticket,
} from "@/app/(app)/BM_dashboard/feedback/tickets-table";

/**
 * Admin — Raised Tickets.
 *
 * Every ticket in the system, regardless of who filed it. Reuses the branch
 * manager's TicketsTable (search / filter / pagination / list-grid / detail
 * drawer) and turns on the role chip + "Raised by" filter by feeding rows that
 * carry `author_role`.
 */
export default async function AdminTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(ROLE_HOME[session.role]);

  const rows = await getAllTickets();

  const tickets: Ticket[] = rows.map((t) => ({
    id: t.id,
    code: ticketCode(t.id),
    category: t.category,
    subject: t.subject,
    body: t.body,
    status: t.status,
    created_at: String(t.created_at),
    resolved_at: t.resolved_at ? String(t.resolved_at) : null,
    author_name: t.author_name,
    author_avatar: t.author_avatar,
    author_role: t.author_role,
  }));

  const open = tickets.filter((t) => t.status === "open").length;
  const inReview = tickets.filter((t) => t.status === "ack").length;
  const resolved = tickets.filter((t) => t.status === "resolved").length;

  // Flat, spreadsheet-friendly view for the CSV export.
  const csvRows = tickets.map((t) => ({
    code: t.code,
    subject: t.subject,
    category: t.category,
    status: t.status,
    author_role: t.author_role ?? "",
    author_name: t.author_name,
    created_at: t.created_at,
    resolved_at: t.resolved_at ?? "",
  }));

  return (
    <div className="flex flex-col w-full px-xl py-xl gap-xl relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-error-container/20 rounded-full blur-[100px] pointer-events-none transform translate-x-1/2 -translate-y-1/2" />

      <div className="flex justify-between items-end z-10">
        <div>
          <span className="font-label-uppercase text-on-surface-variant tracking-widest block mb-xxs">
            Operations Control
          </span>
          <h1 className="font-display-lg text-on-surface">Raised Tickets</h1>
          <p className="font-body-lg text-on-surface-variant max-w-2xl mt-xs">
            Every ticket filed by RMs, branch managers and regional heads —
            triaged in one place for platform action.
          </p>
        </div>
        <ExportButton
          rows={csvRows as unknown as Record<string, unknown>[]}
          filename="tickets.csv"
          className="bg-primary hover:bg-primary-container text-on-primary font-body-md px-md py-sm rounded-lg shadow-sm flex items-center gap-xs transition-colors shrink-0 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export
        </ExportButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-md z-10">
        <SummaryCard label="Total" value={tickets.length} icon="confirmation_number" />
        <SummaryCard label="Open" value={open} icon="pending_actions" tone="primary" />
        <SummaryCard label="In Review" value={inReview} icon="visibility" tone="secondary" />
        <SummaryCard label="Resolved" value={resolved} icon="task_alt" tone="tertiary" />
      </div>

      <TicketsTable tickets={tickets} />
    </div>
  );
}

/** Short, stable display id derived from the uuid — e.g. "TKT-4A21". */
function ticketCode(id: string) {
  return `TKT-${id.replace(/-/g, "").slice(-4).toUpperCase()}`;
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: string;
  tone?: "primary" | "tertiary" | "secondary" | "error";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary-container/60 text-on-primary-container",
    tertiary: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
    secondary: "bg-secondary-container text-on-secondary-container",
    error: "bg-error-container text-on-error-container",
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md flex items-center gap-md">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </div>
      <div>
        <div className="font-label-uppercase text-on-surface-variant tracking-widest">
          {label}
        </div>
        <div className="font-headline-md text-on-surface">{value}</div>
      </div>
    </div>
  );
}
