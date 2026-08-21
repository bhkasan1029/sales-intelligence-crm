"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/lib/queries/rm";

/**
 * Header omni-search. Queries /api/search, which scopes results to whatever the
 * signed-in user is allowed to see. Selecting a hit deep-links into the
 * dashboard: a customer opens its review drawer, an action scrolls to and
 * highlights its card.
 */

const DEBOUNCE_MS = 200;

export default function OmniSearch({ placeholder }: { placeholder: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const term = q.trim();
  // Results only ever belong to the current term; a stale list is dropped in
  // render rather than cleared from the effect.
  const visible = term.length < 2 ? [] : hits;

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const json = await res.json();
        if (cancelled) return;
        setHits(res.ok ? (json.hits ?? []) : []);
        setCursor(0);
        setOpen(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const choose = (hit: SearchHit) => {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || visible.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = visible[cursor];
      if (hit) choose(hit);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-xl" ref={boxRef}>
      <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-white/50">
        search
      </span>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => visible.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        type="text"
        aria-label="Search workspace"
        className="w-full rounded-full border-none bg-white/10 py-xs pl-11 pr-md font-body-sm text-white outline-none transition-all placeholder:text-white/50 focus:ring-2 focus:ring-primary-fixed-dim"
      />
      {loading && (
        <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 animate-spin text-[18px] text-white/50">
          progress_activity
        </span>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[120%] z-50 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface shadow-xl">
          {visible.length === 0 ? (
            <p className="px-md py-sm font-body-sm text-on-surface-variant">
              Nothing matches “{q.trim()}”.
            </p>
          ) : (
            <ul>
              {visible.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(hit)}
                    className={cn(
                      "flex w-full items-center gap-sm px-md py-sm text-left transition-colors",
                      i === cursor ? "bg-surface-container-high" : "hover:bg-surface-container-high"
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      {hit.kind === "customer" ? "person" : "bolt"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-md text-on-surface">
                        {hit.title}
                      </span>
                      <span className="block truncate font-body-sm text-on-surface-variant">
                        {hit.subtitle}
                      </span>
                    </span>
                    {hit.meta && (
                      <span className="shrink-0 font-mono-data text-on-surface-variant">
                        {hit.meta}
                      </span>
                    )}
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
