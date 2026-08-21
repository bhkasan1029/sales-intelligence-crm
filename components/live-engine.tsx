"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "Live Engine" chip. Pings /api/health on an interval and reports the real
 * round-trip, so a stalled database shows up in the header instead of a green
 * dot that always lies.
 */

const PING_MS = 20_000;

type State = { status: "connecting" | "connected" | "degraded" | "offline"; ms: number | null };

/** Above this the round-trip is worth flagging rather than celebrating. */
const DEGRADED_MS = 800;

export default function LiveEngine() {
  const [state, setState] = useState<State>({ status: "connecting", ms: null });

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      const started = performance.now();
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const ms = Math.round(performance.now() - started);
        if (cancelled) return;
        if (!res.ok) setState({ status: "degraded", ms });
        else setState({ status: ms > DEGRADED_MS ? "degraded" : "connected", ms });
      } catch {
        if (!cancelled) setState({ status: "offline", ms: null });
      }
    };

    void ping();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void ping();
    }, PING_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const label =
    state.status === "connecting"
      ? "Live Engine: Connecting…"
      : state.status === "offline"
        ? "Live Engine: Offline"
        : `Live Engine: ${state.status === "degraded" ? "Degraded" : "Connected"} (${state.ms}ms)`;

  const dot =
    state.status === "connected"
      ? "bg-tertiary"
      : state.status === "degraded"
        ? "bg-amber-400"
        : state.status === "offline"
          ? "bg-error"
          : "bg-white/40";

  return (
    <div
      title="Round-trip to the API and database"
      className="flex items-center gap-xs rounded-full border border-tertiary/30 bg-tertiary-container/20 px-sm py-xxs"
    >
      <span className={cn("h-2 w-2 rounded-full", dot, state.status !== "offline" && "animate-pulse")} />
      <span className="font-mono-data text-tertiary-fixed">{label}</span>
    </div>
  );
}
