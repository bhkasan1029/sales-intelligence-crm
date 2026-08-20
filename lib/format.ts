const INR = "₹";

/** Neon returns NUMERIC/BIGINT as strings — normalise before any maths. */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 850000 -> "₹8.5L", 18000000 -> "₹1.8Cr", 4200 -> "₹4,200" */
export function formatINR(value: unknown): string {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${INR}${trim(n / 10000000)}Cr`;
  if (abs >= 100000) return `${INR}${trim(n / 100000)}L`;
  if (abs >= 1000) return `${INR}${Math.round(n).toLocaleString("en-IN")}`;
  return `${INR}${Math.round(n)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatPct(value: unknown, digits = 0): string {
  return `${num(value).toFixed(digits)}%`;
}

/** 'YYYY-MM' for the month a date falls in. Defaults to now. */
export function periodOf(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/** How far through the current month we are, as a fraction and in days. */
export function monthProgress(now: Date = new Date()) {
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = now.getDate();
  return { elapsedDays, totalDays, pct: (elapsedDays / totalDays) * 100 };
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * ACTION_TYPE_LIKE_THIS -> "Action type like this", but a bare acronym stays
 * itself: "HNI" and "SME" are segment names, not shouting.
 */
export function humanise(value: string): string {
  if (/^[A-Z]{2,5}$/.test(value)) return value;
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Shared red/amber/emerald banding for "% of target achieved". */
export function toneForPct(pct: number) {
  if (pct >= 100) return {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    label: "Ahead",
  };
  if (pct >= 75) return {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    bar: "bg-amber-500",
    text: "text-amber-700",
    label: "On track",
  };
  return {
    badge: "bg-red-50 text-red-700 border-red-200",
    bar: "bg-red-500",
    text: "text-red-700",
    label: "Behind",
  };
}
