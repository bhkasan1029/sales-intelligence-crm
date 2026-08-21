import { redirect } from "next/navigation";

export default function AdminDashboardIndex() {
  redirect("/admin_dashboard/rules");
}
