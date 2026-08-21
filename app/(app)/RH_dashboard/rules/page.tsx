import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/lib/db";
import { getSession, ROLE_HOME } from "@/lib/auth";
import RulesSimulator, { type SimRule } from "@/components/rules-simulator";

export default async function RulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  const rules = await sql`
    SELECT id, name, description, condition, action_type
    FROM rules
    ORDER BY name`;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/RH_dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="size-4" />
        Back to overview
      </Link>

      <div className="mb-8">
        <h2 className="mb-1 text-2xl font-bold text-[#1A1A1A]">
          Rules &amp; Simulation
        </h2>
        <p className="text-gray-500">
          Click a rule to adjust its values, then hit Run Simulation to preview
          the impact. Nothing is saved — this is exploration only.
        </p>
      </div>

      <RulesSimulator rules={rules as unknown as SimRule[]} />
    </div>
  );
}
