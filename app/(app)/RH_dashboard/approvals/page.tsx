import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import RHPlaceholder from "@/components/rh-placeholder";

export default async function RHApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "regional_head") redirect(ROLE_HOME[session.role]);

  return (
    <RHPlaceholder
      eyebrow="Western Region Operations"
      title="RM Approvals"
      description="Requests raised by branch managers that need a regional sign-off before they take effect."
      icon="verified_user"
      planned={[
        "Queue of pending RM onboarding and reassignment requests",
        "Target revisions filed by branch managers mid-period",
        "Approve / reject with a required justification on the audit log",
      ]}
    />
  );
}
