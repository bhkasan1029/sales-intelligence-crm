import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { getRmDetail } from "@/lib/queries/branch";
import RmPerformance from "@/components/rm-performance";
import { Avatar, Pill } from "@/components/dashboard-ui";
import { formatPeriod, periodOf, toneForPct } from "@/lib/format";

export default async function BMRmDetailPage({
  params,
}: {
  params: Promise<{ rmId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "branch_manager") redirect(ROLE_HOME[session.role]);

  const { rmId } = await params;
  const period = periodOf();

  // Returns null when this RM does not report to the signed-in branch manager,
  // so a guessed id is a 404 rather than someone else's team data.
  const detail = await getRmDetail(session.user_id, rmId, period);
  if (!detail) notFound();

  const tone = toneForPct(detail.achieved_pct);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/BM_dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="size-4" />
        Back to your RMs
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={detail.rm.name} src={detail.rm.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-[#1A1A1A]">{detail.rm.name}</h2>
            <Pill className={tone.badge}>{tone.label}</Pill>
            {detail.open_complaints > 0 && (
              <Pill className="border-red-200 bg-red-50 text-red-700">
                {detail.open_complaints} open complaint
                {detail.open_complaints === 1 ? "" : "s"}
              </Pill>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {detail.rm.email} · Relationship Manager · {formatPeriod(period)}
          </p>
        </div>
      </div>

      <RmPerformance detail={detail} viewer="manager" />
    </div>
  );
}
