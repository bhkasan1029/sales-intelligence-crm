import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { sql } from "@/lib/db";
import FeedbackForm from "./feedback-form";

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

export default async function FeedbackPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);

  const history = await sql`
    SELECT * FROM feedback WHERE author_id = ${session.user_id}
    ORDER BY created_at DESC`;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">Feedback</h2>
        <p className="text-gray-500">Report a bug or flag a rule that seems off.</p>
      </div>

      <FeedbackForm />

      <div className="mt-10">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Your submissions
        </h3>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-500 text-sm">Nothing submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((f) => (
              <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${STATUS_TONE[f.status] ?? ""}`}>
                    {f.status}
                  </span>
                  <span className="text-xs text-gray-500">{CATEGORY_LABEL[f.category] ?? f.category}</span>
                  <span className="text-xs text-gray-400">· {new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">{f.subject}</p>
                <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{f.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
