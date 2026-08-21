import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getOwnFeedback } from "@/lib/queries/branch";
import { formatDate } from "@/lib/format";
// The same form an RM and a branch manager file through, narrowed to the one
// category a regional head can raise — see CATEGORY_BUG below.
import FeedbackForm, {
  CATEGORY_BUG,
} from "@/app/(app)/RM_dashboard/feedback/feedback-form";

const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  ack: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function RHSupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  const history = await getOwnFeedback(session.user_id);
  const open = history.filter((f) => f.status === "open").length;
  const resolved = history.filter((f) => f.status === "resolved").length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h2 className="mb-1 text-2xl font-bold text-[#1A1A1A]">Support</h2>
        <p className="text-gray-500">
          Report a technical bug. This goes straight to Admin — rule disputes
          route <em>to</em> you, so they are raised from the branches below and
          land on your Raised Tickets page.
        </p>
      </div>

      <FeedbackForm categories={[CATEGORY_BUG]} />

      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Your submissions
          </h3>
          {history.length > 0 && (
            <p className="text-xs text-gray-400">
              {history.length} total · {open} open · {resolved} resolved
            </p>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">Nothing submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_TONE[f.status] ?? ""}`}
                  >
                    {f.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDate(f.created_at)}
                  </span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">{f.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
