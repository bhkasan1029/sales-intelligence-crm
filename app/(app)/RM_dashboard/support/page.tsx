import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getOwnFeedback } from "@/lib/queries/branch";
import { formatDate } from "@/lib/format";
import FeedbackForm from "../feedback/feedback-form";

const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  ack: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CATEGORY_LABEL: Record<string, string> = {
  system_bug: "Technical / code bug",
  rule_dispute: "Logical error",
  process: "Process",
  other: "Other",
};

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  const history = await getOwnFeedback(session.user_id);
  const open = history.filter((f) => f.status === "open").length;
  const resolved = history.filter((f) => f.status === "resolved").length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h2 className="mb-1 text-2xl font-bold text-[#1A1A1A]">Support</h2>
        <p className="text-gray-500">
          Report a bug or flag a rule that seems off. Your branch manager and
          admin see what you file here.
        </p>
      </div>

      <FeedbackForm />

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
                  <span className="text-xs text-gray-500">
                    {CATEGORY_LABEL[f.category] ?? f.category}
                  </span>
                  <span className="text-xs text-gray-400">
                    · {formatDate(f.created_at)}
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
