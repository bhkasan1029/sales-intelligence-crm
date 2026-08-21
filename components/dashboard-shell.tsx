"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROLE_HOME, type Role } from "@/lib/roles";
import type { BranchInfo, NotificationRow } from "@/lib/queries/rm";
import OmniSearch from "@/components/omni-search";
import NotificationBell from "@/components/notification-bell";
import BranchChip from "@/components/branch-chip";

/**
 * One shell for every dashboard. The chrome — sidebar and header — is identical
 * across roles; only the nav list and the role chip change. Adding a page to a
 * dashboard means adding a row to NAV_BY_ROLE, nothing else.
 */

type SessionLite = {
  name: string;
  role: Role;
  employee_id?: string | null;
  avatar_url?: string | null;
  /** Where this user sits in the hierarchy; drives the header's branch chip. */
  branch?: BranchInfo | null;
  /** First page of the bell, rendered server-side so the badge never flashes. */
  notifications?: { items: NotificationRow[]; unread: number };
};

type NavItem = {
  label: string;
  href: string;
  /** Material Symbols ligature name. */
  icon: string;
  /** Extra path prefixes that keep this item lit while on a sub-page. */
  activePrefixes?: string[];
  /** Rendered greyed out and unclickable when false. */
  enabled?: boolean;
};

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  rm: [
    { label: "Dashboard", href: "/RM_dashboard", icon: "dashboard" },
    { label: "Customers & Leads", href: "/RM_dashboard/customers", icon: "groups" },
    { label: "Performance", href: "/RM_dashboard/performance", icon: "trending_up" },
    { label: "Task Tree", href: "/RM_dashboard/task-tree", icon: "account_tree" },
    { label: "Support", href: "/RM_dashboard/support", icon: "support_agent" },
  ],
  branch_manager: [
    // Drill-downs live at /BM_dashboard/rm/[rmId] and keep this item lit.
    {
      label: "Team Management",
      href: "/BM_dashboard",
      icon: "group",
      activePrefixes: ["/BM_dashboard/rm"],
    },
    { label: "Reports & Analytics", href: "/BM_dashboard/overview", icon: "analytics" },
    // Raised tickets still exists at /BM_dashboard/feedback; it hangs off
    // Support rather than the sidebar.
    {
      label: "Support",
      href: "/BM_dashboard/support",
      icon: "support_agent",
      activePrefixes: ["/BM_dashboard/feedback"],
    },
  ],
  regional_head: [
    { label: "Branches Overview", href: "/RH_dashboard", icon: "account_tree" },
    { label: "Regional Reports", href: "/RH_dashboard/reports", icon: "analytics" },
    { label: "Rules & Simulation", href: "/RH_dashboard/rules", icon: "model_training" },
    { label: "RM Approvals", href: "/RH_dashboard/approvals", icon: "verified_user" },
    { label: "Raised Tickets", href: "/RH_dashboard/tickets", icon: "confirmation_number" },
    { label: "Support", href: "/RH_dashboard/support", icon: "contact_support" },
  ],
  admin: [
    { label: "Rules Engine", href: "/admin_dashboard/rules", icon: "rule" },
    { label: "Raised Tickets", href: "/admin_dashboard/tickets", icon: "confirmation_number" },
    { label: "Notifications", href: "#", icon: "notifications", enabled: false },
    { label: "Profile", href: "#", icon: "person", enabled: false },
  ],
};

const ROLE_CHIP: Record<Role, { label: string; icon: string }> = {
  rm: { label: "Relationship Manager", icon: "person" },
  branch_manager: { label: "Branch Manager", icon: "location_on" },
  regional_head: { label: "Regional Head", icon: "public" },
  admin: { label: "Admin", icon: "shield_person" },
};

const SEARCH_PLACEHOLDER: Record<Role, string> = {
  rm: "Search customers, tasks, or actions...",
  branch_manager: "Search team, RMs, or reports...",
  regional_head: "Search branches, managers, or reports...",
  admin: "Search rules, users, or requests...",
};

export default function DashboardShell({
  session,
  children,
}: {
  session: SessionLite;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = NAV_BY_ROLE[session.role] ?? [];
  const chip = ROLE_CHIP[session.role];

  const initials = session.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex items-center gap-xs border-b border-outline-variant p-md">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <span className="material-symbols-outlined text-[20px] text-on-primary">
              insights
            </span>
          </div>
          <span className="font-headline-sm tracking-tight text-on-surface">
            Sales Intelligence
          </span>
        </div>

        <nav className="flex-1 space-y-xxs px-sm py-md">
          {navItems.map((item) => {
            const enabled = item.enabled !== false;
            const active =
              enabled &&
              (pathname === item.href ||
                (item.activePrefixes ?? []).some((p) => pathname.startsWith(p)));

            const className = cn(
              "flex items-center gap-sm rounded-lg px-md py-sm transition-all",
              !enabled
                ? "cursor-not-allowed text-on-surface-variant/40"
                : active
                  ? "bg-primary-container font-semibold text-on-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            );

            const inner = (
              <>
                <span className="material-symbols-outlined text-md">{item.icon}</span>
                <span className="font-body-md">{item.label}</span>
              </>
            );

            return enabled ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {inner}
              </Link>
            ) : (
              <span key={item.label} className={className} title="Coming soon">
                {inner}
              </span>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-outline-variant bg-surface-container-low p-md">
          <div className="flex items-center gap-sm">
            {session.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.avatar_url}
                alt=""
                className="h-10 w-10 rounded-full border border-outline-variant object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-primary-container text-sm font-semibold text-on-primary-container">
                {initials}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-md font-semibold text-on-surface">
                {session.name}
              </span>
              <span className="font-label-uppercase font-mono-data text-on-surface-variant">
                {session.employee_id ?? chip.label}
              </span>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              className="rounded-md p-xxs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Header + page body ──────────────────────────────────────────── */}
      <div className="pl-64">
        <header className="fixed left-64 right-0 top-0 z-40 flex h-16 items-center justify-between gap-lg bg-[#0F172A] px-lg text-white">
          <OmniSearch placeholder={SEARCH_PLACEHOLDER[session.role]} />

          <div className="ml-lg flex items-center gap-lg">
            <NotificationBell
              homeHref={ROLE_HOME[session.role]}
              initial={session.notifications ?? { items: [], unread: 0 }}
            />
            {session.branch ? (
              <BranchChip branch={session.branch} />
            ) : (
              <div className="flex items-center gap-xs rounded-lg px-xs py-xxs">
                <span className="material-symbols-outlined text-[18px]">{chip.icon}</span>
                <span className="hidden font-body-sm font-bold xl:block">{chip.label}</span>
              </div>
            )}
            <div className="mx-xxs h-6 w-[1px] bg-white/20" />
            {session.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary ring-2 ring-white/20">
                {initials}
              </div>
            )}
          </div>
        </header>

        <main className="relative min-h-screen pt-16">{children}</main>
      </div>
    </div>
  );
}
