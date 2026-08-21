import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import RegionalReports from "@/components/regional-reports";

export default async function RHReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  return <RegionalReports />;
}
