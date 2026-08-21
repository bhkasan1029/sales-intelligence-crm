import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";

/**
 * Scaffold for the RM sidebar pages that don't have real data wired yet.
 * Each page keeps the same RM-only guard as the live pages so routing and
 * access behave for real while the body is still a stub.
 */

export async function requireRM() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "rm") redirect(ROLE_HOME[session.role]);
  return session;
}

export function Placeholder({
  icon,
  title,
  description,
  sections,
}: {
  icon: string;
  title: string;
  description: string;
  sections: string[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <span className="material-symbols-outlined text-[24px] text-[#1A1A1A]">
            {icon}
          </span>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-2xl font-bold text-[#1A1A1A]">{title}</h2>
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
              Coming soon
            </span>
          </div>
          <p className="text-gray-500">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <div
            key={s}
            className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center"
          >
            <p className="text-sm font-medium text-gray-600">{s}</p>
            <p className="mt-1 text-xs text-gray-400">Not wired up yet</p>
          </div>
        ))}
      </div>
    </div>
  );
}
