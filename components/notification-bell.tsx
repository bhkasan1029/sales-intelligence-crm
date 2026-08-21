"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { NotificationRow } from "@/lib/queries/rm";

/**
 * Header bell. Reads the notifications table, badges the unread count, and
 * marks rows read — one when you open its item, all from the header link.
 */

const POLL_MS = 60_000;

const TYPE_ICON: Record<string, string> = {
  sla_risk: "timer",
  opportunity_at_risk: "account_balance_wallet",
  target_gap: "speed",
  achievement: "workspace_premium",
};

export default function NotificationBell({
  homeHref,
  initial,
}: {
  homeHref: string;
  /** Rendered by the layout so the badge is correct on first paint. */
  initial: { items: NotificationRow[]; unread: number };
}) {
  const [items, setItems] = useState<NotificationRow[]>(initial.items);
  const [unread, setUnread] = useState(initial.unread);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setItems(json.items ?? []);
    setUnread(json.unread ?? 0);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const mark = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const json = await res.json();
    setItems(json.items ?? []);
    setUnread(json.unread ?? 0);
  };

  const openItem = async (n: NotificationRow) => {
    setOpen(false);
    if (!n.read_at) await mark({ id: n.id });
    if (n.action_id) router.push(`${homeHref}?focus=${n.action_id}`);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative rounded-full p-base transition-colors hover:bg-white/10"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span className="absolute right-xxs top-xxs flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-on-error">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[120%] z-50 w-80 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-outline-variant/40 px-md py-sm">
            <span className="font-label-uppercase text-on-surface-variant">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => void mark({ all: true })}
                className="font-body-sm text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-md py-sm font-body-sm text-on-surface-variant">
              Nothing here yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => void openItem(n)}
                    className={cn(
                      "flex w-full items-start gap-sm border-b border-outline-variant/20 px-md py-sm text-left transition-colors hover:bg-surface-container-high",
                      !n.read_at && "bg-primary-container/5"
                    )}
                  >
                    <span
                      className={cn(
                        "material-symbols-outlined text-[20px]",
                        n.read_at ? "text-on-surface-variant" : "text-primary"
                      )}
                    >
                      {TYPE_ICON[n.type] ?? "notifications"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate font-body-md",
                          n.read_at ? "text-on-surface-variant" : "font-semibold text-on-surface"
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block font-body-sm text-on-surface-variant">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-xxs block font-mono-data text-on-surface-variant">
                        {formatRelative(n.created_at)}
                      </span>
                    </span>
                    {!n.read_at && <span className="mt-xs h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
