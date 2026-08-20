"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SessionLite = {
  name: string;
  employee_id?: string | null;
  avatar_url?: string | null;
};

const NAV_ITEMS = [
  {
    label: "Team Management",
    href: "/BM_dashboard",
    icon: "group",
    activePrefixes: ["/BM_dashboard/rm"],
  },
  {
    label: "Reports & Analytics",
    href: "/BM_dashboard/overview",
    icon: "analytics",
  },
  {
    label: "Raised Tickets",
    href: "/BM_dashboard/feedback",
    icon: "confirmation_number",
  },
  {
    label: "Support",
    href: "/BM_dashboard/support",
    icon: "support_agent",
  },
];

export default function BMShell({
  session,
  children,
}: {
  session: SessionLite;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

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
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col border-r border-outline-variant shadow-sm">
        <div className="p-md flex items-center gap-xs border-b border-outline-variant">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-on-primary text-[20px]">
              insights
            </span>
          </div>
          <span className="font-headline-sm text-on-surface tracking-tight">
            Sales Intelligence
          </span>
        </div>

        <nav className="flex-1 px-sm py-md space-y-xxs">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.activePrefixes ?? []).some((p) => pathname.startsWith(p));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-sm px-md py-sm rounded-lg transition-all group",
                  active
                    ? "bg-primary-container text-on-primary-container font-semibold shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                )}
              >
                <span className="material-symbols-outlined text-md">
                  {item.icon}
                </span>
                <span className="font-body-md">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-md border-t border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-sm">
            {session.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.avatar_url}
                alt={session.name}
                className="w-10 h-10 rounded-full border border-outline-variant object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full border border-outline-variant bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-sm">
                {initials}
              </div>
            )}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-body-md font-semibold text-on-surface truncate">
                {session.name}
              </span>
              <span className="font-label-uppercase text-on-surface-variant font-mono-data">
                {session.employee_id ?? "BM"}
              </span>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              className="p-xxs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">
                logout
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Body */}
      <div className="pl-64">
        <header className="fixed top-0 left-64 right-0 h-16 bg-surface/80 backdrop-blur-md z-40 border-b border-outline-variant flex items-center justify-between px-xl">
          <div className="flex items-center gap-lg">
            <button className="flex items-center gap-xs px-sm py-xxs bg-surface-container-high rounded-md border border-outline-variant hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-sm text-primary">
                location_on
              </span>
              <span className="text-body-sm font-semibold text-on-surface">
                Branch Alpha - Mumbai Central
              </span>
              <span className="material-symbols-outlined text-sm">
                expand_more
              </span>
            </button>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                className="w-80 bg-surface-container-low border border-outline-variant py-xs pl-10 pr-md rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-body-sm"
                placeholder="Search team, RMs, or reports..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-md">
            <div className="flex items-center gap-xxs px-xs py-1 bg-tertiary-fixed text-on-tertiary-fixed-variant rounded-full font-label-uppercase border border-tertiary-container">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
              LIVE
            </div>
            <button className="relative p-xxs hover:bg-surface-container-high rounded-full transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">
                notifications
              </span>
              <span className="absolute -top-1 -right-1 bg-error text-on-error text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                3
              </span>
            </button>
            <div className="w-[1px] h-6 bg-outline-variant mx-xxs"></div>
            {session.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.avatar_url}
                alt={session.name}
                className="w-8 h-8 rounded-full ring-2 ring-surface-container-highest object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full ring-2 ring-surface-container-highest bg-primary text-on-primary flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
            )}
          </div>
        </header>

        <main className="relative pt-16 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
