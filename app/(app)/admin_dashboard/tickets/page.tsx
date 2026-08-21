import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";

type RaisedBy = "RM" | "BM" | "RH";
type Status = "Open" | "In Review" | "Resolved";
type Priority = "Low" | "Medium" | "High" | "Urgent";

type DummyTicket = {
  code: string;
  subject: string;
  category: string;
  raisedBy: RaisedBy;
  author: string;
  branch: string;
  region: string;
  priority: Priority;
  status: Status;
  age: string;
};

const TICKETS: DummyTicket[] = [
  {
    code: "TKT-4A21",
    subject: "Rule R-002 misfiring on joint accounts",
    category: "Rule Dispute",
    raisedBy: "RH",
    author: "Neha Iyer",
    branch: "—",
    region: "West",
    priority: "Urgent",
    status: "Open",
    age: "12m",
  },
  {
    code: "TKT-4A18",
    subject: "Deposit event delayed by ~40s in the feed",
    category: "Bug",
    raisedBy: "BM",
    author: "Ravi Kulkarni",
    branch: "Andheri East",
    region: "West",
    priority: "High",
    status: "In Review",
    age: "1h",
  },
  {
    code: "TKT-4A11",
    subject: "Task priority not refreshing after event ack",
    category: "Bug",
    raisedBy: "RM",
    author: "Ananya Sharma",
    branch: "Bandra Kurla",
    region: "West",
    priority: "Medium",
    status: "In Review",
    age: "3h",
  },
  {
    code: "TKT-4A08",
    subject: "Request: expose branch-level run-rate override",
    category: "Feature",
    raisedBy: "BM",
    author: "Deepak Menon",
    branch: "Indiranagar",
    region: "South",
    priority: "Medium",
    status: "Open",
    age: "5h",
  },
  {
    code: "TKT-4A02",
    subject: "Wrong RM assigned to escalation queue",
    category: "Data",
    raisedBy: "RM",
    author: "Meera Nair",
    branch: "Koregaon Park",
    region: "West",
    priority: "Low",
    status: "Resolved",
    age: "1d",
  },
  {
    code: "TKT-3F92",
    subject: "Quota anchor mismatch on last week's leaderboard",
    category: "Data",
    raisedBy: "RH",
    author: "Karan Singhania",
    branch: "—",
    region: "North",
    priority: "High",
    status: "Resolved",
    age: "2d",
  },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  Urgent: "bg-error-container text-on-error-container",
  High: "bg-error-container/60 text-on-error-container",
  Medium: "bg-secondary-container text-on-secondary-container",
  Low: "bg-surface-container-high text-on-surface-variant",
};

const STATUS_STYLES: Record<Status, string> = {
  Open: "bg-primary-container/60 text-on-primary-container",
  "In Review": "bg-secondary-container text-on-secondary-container",
  Resolved: "bg-tertiary-container/40 text-on-tertiary-fixed-variant",
};

const ROLE_STYLES: Record<RaisedBy, string> = {
  RM: "bg-primary/10 text-primary",
  BM: "bg-tertiary/10 text-tertiary",
  RH: "bg-secondary/10 text-secondary",
};

export default async function AdminTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(ROLE_HOME[session.role]);

  const open = TICKETS.filter((t) => t.status === "Open").length;
  const inReview = TICKETS.filter((t) => t.status === "In Review").length;
  const resolved = TICKETS.filter((t) => t.status === "Resolved").length;

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
        <button
          type="button"
          className="bg-primary hover:bg-primary-container text-on-primary font-body-md px-md py-sm rounded-lg shadow-sm flex items-center gap-xs transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-md z-10">
        <SummaryCard label="Total" value={TICKETS.length} icon="confirmation_number" />
        <SummaryCard label="Open" value={open} icon="pending_actions" tone="primary" />
        <SummaryCard label="In Review" value={inReview} icon="visibility" tone="secondary" />
        <SummaryCard label="Resolved" value={resolved} icon="task_alt" tone="tertiary" />
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden z-10">
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
          <div>
            <h2 className="font-headline-sm text-on-surface">All Tickets</h2>
            <p className="font-body-sm text-on-surface-variant">
              Sorted newest first. Click a row in a live build to open the
              triage drawer.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-xs">
            <button
              type="button"
              className="font-body-sm text-on-surface-variant hover:text-on-surface px-sm py-xxs rounded-md flex items-center gap-xxs"
            >
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Filter
            </button>
            <button
              type="button"
              className="font-body-sm text-on-surface-variant hover:text-on-surface px-sm py-xxs rounded-md flex items-center gap-xxs"
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              Sort
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr className="font-label-uppercase text-on-surface-variant">
                <th className="px-lg py-sm">Ticket</th>
                <th className="px-lg py-sm">Subject</th>
                <th className="px-lg py-sm">Raised By</th>
                <th className="px-lg py-sm">Branch / Region</th>
                <th className="px-lg py-sm">Priority</th>
                <th className="px-lg py-sm">Status</th>
                <th className="px-lg py-sm">Age</th>
              </tr>
            </thead>
            <tbody>
              {TICKETS.map((t) => (
                <tr
                  key={t.code}
                  className="border-t border-outline-variant hover:bg-surface-container-low/60 transition-colors"
                >
                  <td className="px-lg py-md">
                    <div className="font-mono-data text-on-surface-variant">
                      {t.code}
                    </div>
                    <div className="font-body-sm text-on-surface-variant">
                      {t.category}
                    </div>
                  </td>
                  <td className="px-lg py-md">
                    <div className="font-body-md font-semibold text-on-surface max-w-md">
                      {t.subject}
                    </div>
                  </td>
                  <td className="px-lg py-md">
                    <div className="flex items-center gap-xs">
                      <span
                        className={`inline-flex items-center justify-center h-6 w-8 rounded-md font-label-uppercase ${ROLE_STYLES[t.raisedBy]}`}
                      >
                        {t.raisedBy}
                      </span>
                      <span className="font-body-sm text-on-surface">
                        {t.author}
                      </span>
                    </div>
                  </td>
                  <td className="px-lg py-md font-body-sm text-on-surface-variant">
                    <div className="text-on-surface">{t.branch}</div>
                    <div>{t.region}</div>
                  </td>
                  <td className="px-lg py-md">
                    <span
                      className={`inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase ${PRIORITY_STYLES[t.priority]}`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-lg py-md">
                    <span
                      className={`inline-flex items-center px-sm py-xxs rounded-full font-label-uppercase ${STATUS_STYLES[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-lg py-md font-mono-data text-on-surface-variant">
                    {t.age}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
