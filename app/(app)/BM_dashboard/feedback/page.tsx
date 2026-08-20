import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getTeamTickets } from "@/lib/queries/branch";
import TicketsTable, { type Ticket } from "./tickets-table";

/**
 * Raised tickets — read-only view of complaints/bugs filed by the RMs under
 * this branch manager. Nothing to submit from here (BMs file upward via
 * the Support page, which is where "New Ticket" points).
 */
export default async function BMRaisedTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "branch_manager") redirect(ROLE_HOME[session.role]);

  const rows = await getTeamTickets(session.user_id);
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
  }));

  return (
    <div className="flex flex-col w-full px-xl py-xl gap-xl relative">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-error-container/20 rounded-full blur-[100px] pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>

      {/* Page header */}
      <div className="flex justify-between items-end z-10">
        <div>
          <span className="font-label-uppercase text-on-surface-variant tracking-widest block mb-xxs">
            Operations Control
          </span>
          <h1 className="font-display-lg text-on-surface">Raised Tickets</h1>
        </div>
        <Link
          href="/BM_dashboard/support"
          className="bg-primary hover:bg-primary-container text-on-primary font-body-md px-md py-sm rounded-lg shadow-sm flex items-center gap-xs transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Ticket
        </Link>
      </div>

      <TicketsTable tickets={tickets} />
    </div>
  );
}

/** Short, stable display id derived from the uuid — e.g. "TKT-4A21". */
function ticketCode(id: string) {
  return `TKT-${id.replace(/-/g, "").slice(-4).toUpperCase()}`;
}
