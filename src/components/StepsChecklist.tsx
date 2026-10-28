"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Source, Step } from "@/lib/schema";
import { Evidence, OwnerTag } from "./Badges";

const PHASE: Record<Step["phase"], string> = {
  prepare: "Prepare",
  register: "Register",
  configure: "Configure",
  test: "Test",
  review: "Review",
  launch: "Launch",
};

const key = (slug: string) => `oauth-atlas:steps:${slug}`;
const EVENT = "oauth-atlas-steps";

/** Progress lives in this browser only; if storage is blocked the checklist still works for the visit. */
const memory: Record<string, string> = {};
const read = (slug: string) => {
  try {
    return localStorage.getItem(key(slug)) ?? memory[slug] ?? "{}";
  } catch {
    return memory[slug] ?? "{}";
  }
};
const write = (slug: string, value: string) => {
  memory[slug] = value;
  try {
    localStorage.setItem(key(slug), value);
  } catch {
    /* keep in memory only */
  }
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

export function StepsChecklist({ slug, steps, sources }: { slug: string; steps: Step[]; sources: Source[] }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => "{}",
  );
  const done = useMemo<Record<string, boolean>>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, [raw]);

  const toggle = (id: string) => write(slug, JSON.stringify({ ...done, [id]: !done[id] }));

  const count = steps.filter((s) => done[s.id]).length;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-2" aria-live="polite">
        {count} of {steps.length} done
      </p>
      <ol className="space-y-5">
        {steps.map((s, i) => {
          const checked = !!done[s.id];
          return (
            <li key={s.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <label className="flex cursor-pointer flex-col items-center gap-1 pt-0.5">
                <span className={`font-display text-lg font-extrabold leading-none ${checked ? "text-work" : "text-ink-3"}`}>{i + 1}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 accent-[var(--work)]"
                  aria-label={`Mark step ${i + 1} done: ${s.title}`}
                />
              </label>
              <div className={checked ? "opacity-60" : ""}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className={`text-base font-bold ${checked ? "line-through decoration-1" : ""}`}>{s.title}</h3>
                  <OwnerTag owner={s.owner} />
                  <span className="text-xs text-ink-3">{PHASE[s.phase]}</span>
                </div>
                <p className="mt-1 max-w-[70ch] text-ink-2">
                  {s.detail}{" "}
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noreferrer" className="underline">
                      Open
                    </a>
                  )}
                </p>
                <div className="mt-1">
                  <Evidence level={s.evidence} sourceIds={s.sourceIds} sources={sources} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
