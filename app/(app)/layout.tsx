import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth";
import AppShell from "@/components/app-shell";
import BMShell from "@/components/bm-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "branch_manager") {
    return <BMShell session={{ name: session.name }}>{children}</BMShell>;
  }

  return (
    <AppShell
      session={{
        name: session.name,
        role: session.role,
        home: ROLE_HOME[session.role],
      }}
    >
      {children}
    </AppShell>
  );
}
