"use client";

import { useState } from "react";
import type { ProbeResult } from "@/lib/schema";

export function LiveChecks({ slug, initial, canRerun }: { slug: string; initial: ProbeResult[]; canRerun: boolean }) {
  const [probes, setProbes] = useState<ProbeResult[]>(initial);
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  const run = async () => {
    setState("running");
    try {
      const r = await fetch(`/api/probe/${slug}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { probes: ProbeResult[] };
      setProbes(j.probes);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="no-print">
      <h2 className="font-display text-base font-bold">Live checks</h2>
      <p className="mt-1 text-sm text-ink-3">
        Credential-free tests run from our server: OAuth endpoints answer, the portal loads, cited pages are still online. Nothing is created at the provider.
      </p>
      {probes.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {probes.map((p, i) => (
            <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1">
              <span aria-hidden className={p.result === "pass" ? "text-work" : p.result === "fail" ? "text-hard" : "text-ink-3"}>
                {p.result === "pass" ? "●" : p.result === "fail" ? "✕" : "○"}
              </span>
              <span>
                <span className="font-semibold">{p.name}</span>
                <span className="sr-only">: {p.result}</span>
                <span className="block break-words text-ink-3">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canRerun && (
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="mt-3 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {state === "running" ? "Running checks…" : probes.length ? "Run checks again" : "Run live checks"}
        </button>
      )}
      {state === "error" && <p className="mt-2 text-sm text-hard">Checks could not run. Try again, or open the portal link in step 1 yourself.</p>}
      {probes[0] && <p className="mt-2 text-xs text-ink-3">Last run {new Date(probes[0].ranAt).toLocaleString()}</p>}
    </div>
  );
}
