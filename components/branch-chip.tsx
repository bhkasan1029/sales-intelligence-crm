"use client";

import { useEffect, useRef, useState } from "react";
import { humanise } from "@/lib/format";
import type { BranchInfo } from "@/lib/queries/rm";

/**
 * Header branch selector. An RM belongs to exactly one branch, so this reports
 * where they sit — manager, reporting line and team size — rather than
 * pretending to switch between branches they cannot see.
 */
export default function BranchChip({ branch }: { branch: BranchInfo }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const label = branch.label;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-xs rounded-lg p-xs transition-colors hover:bg-white/10"
      >
        <span className="hidden text-right xl:block">
          <span className="block font-label-uppercase leading-none text-white/60">Branch</span>
          <span className="block font-body-sm font-bold">{label}</span>
        </span>
        <span className="material-symbols-outlined">expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[120%] z-50 w-64 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-md text-on-surface shadow-xl">
          <p className="font-label-uppercase text-on-surface-variant">Reporting line</p>
          <dl className="mt-xs space-y-xs">
            <Row
              label={branch.manager_role ? humanise(branch.manager_role) : "Manager"}
              value={branch.manager_name ?? "Not assigned"}
            />
            <Row label="Regional head" value={branch.regional_head ?? "—"} />
            <Row
              label="RMs in branch"
              value={branch.team_size > 0 ? String(branch.team_size) : "—"}
            />
          </dl>
          {!branch.manager_name && (
            <p className="mt-sm font-body-sm text-on-surface-variant">
              You have not been attached to a branch yet, so targets and team
              benchmarks will be empty.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-sm">
      <dt className="font-body-sm text-on-surface-variant">{label}</dt>
      <dd className="truncate font-body-sm font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
