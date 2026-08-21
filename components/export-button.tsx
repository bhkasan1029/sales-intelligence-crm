"use client";

/**
 * Any-data-to-CSV download button. Server components pass the rows +
 * filename, we serialize on the client and trigger a Blob download —
 * no server round-trip, no library.
 */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}

function download(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportButton({
  rows,
  filename,
  className,
  children,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => download(filename, toCsv(rows))}
      className={className}
      disabled={rows.length === 0}
      title={rows.length === 0 ? "Nothing to export" : `Download ${filename}`}
    >
      {children ?? "Export"}
    </button>
  );
}
