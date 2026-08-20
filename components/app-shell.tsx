"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/logout-button";

type SessionLite = { name: string; role: string; home: string };

type NavItem = {
  label: string;
  href: string;
  enabled: boolean;
  /** Extra path prefixes that keep this item highlighted while on a sub-page. */
  activePrefixes?: string[];
};

const ROLE_LABEL: Record<string, string> = {
  rm: "Relationship Manager",
  branch_manager: "Branch Manager",
  regional_head: "Regional Head",
  admin: "Admin",
};

export default function AppShell({
  session,
  children,
}: {
  session: SessionLite;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const NAV_BY_ROLE: Record<string, NavItem[]> = {
    rm: [
      { label: "Tasks", href: "/RM_dashboard", enabled: true },
      { label: "Task tree", href: "/RM_dashboard/task-tree", enabled: true },
      { label: "Self evaluation", href: "/RM_dashboard/self-evaluation", enabled: true },
      { label: "Feedback", href: "/RM_dashboard/feedback", enabled: true },
    ],
    branch_manager: [
      // Drill-downs live under /BM_dashboard/rm/[rmId] and keep "Main dashboard" lit.
      {
        label: "Main dashboard",
        href: "/BM_dashboard",
        enabled: true,
        activePrefixes: ["/BM_dashboard/rm"],
      },
      { label: "Overview", href: "/BM_dashboard/overview", enabled: true },
      { label: "Raised tickets", href: "/BM_dashboard/feedback", enabled: true },
      { label: "Support", href: "/BM_dashboard/support", enabled: true },
    ],
    regional_head: [
      { label: "Home", href: session.home, enabled: true },
      { label: "Notifications", href: "#", enabled: false },
      { label: "Profile", href: "#", enabled: false },
      { label: "Feedback", href: "#", enabled: false },
    ],
    admin: [
      { label: "Home", href: session.home, enabled: true },
      { label: "Notifications", href: "#", enabled: false },
      { label: "Profile", href: "#", enabled: false },
    ],
  };
  const navItems = NAV_BY_ROLE[session.role] ?? [{ label: "Home", href: session.home, enabled: true }];
  const currentLabel =
    navItems.find(
      (item) =>
        item.enabled &&
        (pathname === item.href ||
          (item.activePrefixes ?? []).some((p) => pathname.startsWith(p)))
    )?.label ?? "Dashboard";

  return (
    <div className="flex h-screen bg-[#FAF8F5]">
      <aside className="w-60 bg-[#1A1A1A] flex flex-col">
        <div className="px-6 py-6">
          <p className="text-white font-bold text-base leading-tight">Sales Intelligence</p>
          <p className="text-white/50 text-xs">CRM</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const active =
              item.enabled &&
              (pathname === item.href ||
                (item.activePrefixes ?? []).some((p) => pathname.startsWith(p)));
            const base = "block px-3 py-2 rounded-md text-sm transition-colors";
            const cls = !item.enabled
              ? `${base} text-white/30 cursor-not-allowed`
              : active
                ? `${base} bg-white/10 text-white font-medium`
                : `${base} text-white/70 hover:bg-white/5 hover:text-white`;
            return item.enabled ? (
              <Link key={item.label} href={item.href} className={cls}>
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className={cls} title="Coming soon">
                {item.label}
              </span>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-white/10">
          <p className="text-white/40 text-[10px] uppercase tracking-wide">Phase 11 · v0.1</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{currentLabel}</p>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-[#1A1A1A]">{session.name}</p>
              <p className="text-xs text-gray-500">{ROLE_LABEL[session.role] ?? session.role}</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
