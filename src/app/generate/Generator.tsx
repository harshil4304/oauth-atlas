"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuideView } from "@/components/GuideView";
import type { Guide, ProbeResult } from "@/lib/schema";

type Stage = "research" | "probe" | "check" | "score" | "save";
type Ev =
  | { type: "stage"; stage: Stage; message: string }
  | { type: "activity"; kind: "search" | "fetch" | "note"; message: string }
  | { type: "probe"; probe: ProbeResult }
  | { type: "not_oauth"; message: string; docsUrl?: string }
  | { type: "done"; guide: Guide }
  | { type: "saved"; slug: string; storage: string }
  | { type: "library" | "cached"; slug: string; name: string }
  | { type: "error"; message: string };

const STAGES: { id: Stage; label: string }[] = [
  { id: "research", label: "Read the provider's docs" },
  { id: "probe", label: "Run live checks" },
  { id: "check", label: "Fact-check each claim" },
  { id: "score", label: "Score difficulty" },
  { id: "save", label: "Save and share" },
];

interface LogLine {
  t: number;
  kind: string;
  text: string;
}

const shortUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.host.replace(/^www\./, "") + (x.pathname.length > 1 ? x.pathname : "");
  } catch {
    return u;
  }
};

export function Generator({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [passcode, setPasscode] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [saved, setSaved] = useState<{ slug: string; storage: string } | null>(null);
  const [existing, setExisting] = useState<{ slug: string; name: string; type: string } | null>(null);
  const [error, setError] = useState("");
  const [notOauth, setNotOauth] = useState<{ message: string; docsUrl?: string } | null>(null);
  const started = useRef(0);
  const autoRan = useRef(false);

  const run = useCallback(
    async (q: string, force = false) => {
      if (!q.trim()) {
        setError("Enter an app name or website first.");
        return;
      }
      setRunning(true);
      setError("");
      setGuide(null);
      setSaved(null);
      setExisting(null);
      setNotOauth(null);
      setLog([]);
      setProbes([]);
      setStage(null);
      started.current = Date.now();
      const add = (kind: string, text: string) => setLog((l) => [...l, { t: Date.now() - started.current, kind, text }]);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q, passcode: passcode || undefined, force }),
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; needsPasscode?: boolean };
          if (j.needsPasscode) setNeedsPasscode(true);
          throw new Error(j.error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line) as Ev;
            if (e.type === "stage") {
              setStage(e.stage);
              add("stage", e.message);
            } else if (e.type === "activity") add(e.kind, e.kind === "fetch" ? shortUrl(e.message) : e.message);
            else if (e.type === "probe") setProbes((p) => [...p, e.probe]);
            else if (e.type === "done") setGuide(e.guide);
            else if (e.type === "saved") setSaved({ slug: e.slug, storage: e.storage });
            else if (e.type === "library" || e.type === "cached") setExisting({ slug: e.slug, name: e.name, type: e.type });
            else if (e.type === "not_oauth") setNotOauth({ message: e.message, docsUrl: e.docsUrl });
            else if (e.type === "error") throw new Error(e.message);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunning(false);
      }
    },
    [passcode],
  );

  useEffect(() => {
    if (initialQuery && !autoRan.current) {
      autoRan.current = true;
      void run(initialQuery);
    }
  }, [initialQuery, run]);

  const stageIndex = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  const searches = log.filter((l) => l.kind === "search").length;
  const reads = log.filter((l) => l.kind === "fetch").length;
  const persisted = !!saved && (saved.storage === "upstash" || saved.storage === "local");

  return (
    <div className="pt-10">
      {!guide && (
        <>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Generate a guide for any app</h1>
          <p className="mt-3 max-w-[65ch] text-ink-2">
            The research agent finds the provider&apos;s developer docs, reads the pages on OAuth setup and app review, tests the public OAuth endpoints, then a
            second pass re-reads every cited page to confirm or downgrade each claim.
          </p>
          <form
            className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(query);
            }}
          >
            <label htmlFor="gen-q" className="sr-only">
              App name or website
            </label>
            <input
              id="gen-q"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError("");
              }}
              placeholder="App name or website, e.g. calendly.com"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-4 py-3 text-lg focus:border-ink focus:outline-none"
              disabled={running}
            />
            <button type="submit" disabled={running} className="rounded-lg bg-ink px-5 py-3 text-lg font-semibold text-paper disabled:opacity-60">
              {running ? "Researching…" : "Generate guide"}
            </button>
          </form>
          {needsPasscode && (
            <div className="mt-3 max-w-2xl">
              <label htmlFor="gen-pass" className="text-sm text-ink-2">
                This deployment asks for a passcode before spending API credits on new guides.
              </label>
              <input
                id="gen-pass"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2"
              />
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-6 max-w-2xl rounded-lg border border-hard p-4" role="alert">
          <p className="font-semibold text-hard">Generation stopped</p>
          <p className="mt-1 text-ink-2">{error}</p>
          {!running && query && (
            <button type="button" onClick={() => void run(query)} className="mt-3 rounded-md border border-ink px-3 py-1.5 text-sm font-semibold">
              Try again
            </button>
          )}
        </div>
      )}

      {existing && (
        <div className="mt-6 max-w-2xl rounded-lg bg-work-soft p-5">
          <p className="font-semibold">
            {existing.type === "library" ? `${existing.name} is already in the library.` : `A guide for ${existing.name} was generated earlier.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={`/apps/${existing.slug}`} className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-paper no-underline">
              Open the guide
            </Link>
            <button type="button" onClick={() => void run(query, true)} className="rounded-md border border-ink px-3 py-2 text-sm font-semibold">
              Generate a fresh one anyway
            </button>
          </div>
        </div>
      )}

      {notOauth && (
        <div className="mt-6 max-w-2xl rounded-lg border border-line-strong p-5">
          <p className="font-semibold">This app doesn&apos;t offer OAuth for third-party apps</p>
          <p className="mt-1 text-ink-2">{notOauth.message}</p>
          <p className="mt-2 text-sm text-ink-3">
            You won&apos;t need a provider OAuth app: users usually paste an API key instead.{" "}
            {notOauth.docsUrl && (
              <a href={notOauth.docsUrl} target="_blank" rel="noreferrer" className="underline">
                Provider auth docs
              </a>
            )}
          </p>
        </div>
      )}

      {(running || (log.length > 0 && !guide)) && (
        <div className="mt-8 grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
          <ol className="space-y-3" aria-label="Progress">
            {STAGES.map((s, i) => {
              const state = i < stageIndex || (!running && i <= stageIndex) ? "done" : i === stageIndex ? "now" : "todo";
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                      state === "done" ? "border-work bg-work text-paper" : state === "now" ? "border-ink text-ink" : "border-line-strong text-ink-3"
                    }`}
                    aria-hidden
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={state === "todo" ? "text-ink-3" : state === "now" ? "font-semibold" : ""}>
                    {s.label}
                    <span className="sr-only">{state === "done" ? " (done)" : state === "now" ? " (in progress)" : ""}</span>
                  </span>
                </li>
              );
            })}
            <li className="pt-2 text-sm text-ink-3">
              {searches} searches, {reads} pages read
            </li>
          </ol>
          <div className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
            <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
              {log.map((l, i) => (
                <li key={i} className="grid grid-cols-[3.5rem_4.5rem_minmax(0,1fr)] gap-2">
                  <span className="mono text-ink-3">{(l.t / 1000).toFixed(1)}s</span>
                  <span className="text-ink-3">{l.kind === "search" ? "Searched" : l.kind === "fetch" ? "Read" : l.kind === "stage" ? "Step" : "Note"}</span>
                  <span className={`break-words ${l.kind === "stage" ? "font-semibold" : ""}`}>{l.text}</span>
                </li>
              ))}
              {running && <li className="text-ink-3">Working…</li>}
            </ul>
            {probes.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                {probes.map((p, i) => (
                  <li key={i}>
                    <span className={p.result === "pass" ? "text-work" : "text-hard"}>{p.result === "pass" ? "● Pass" : "✕ Fail"}</span> {p.name}
                    <span className="text-ink-3">: {p.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {guide && (
        <>
          <div className="no-print mt-2 rounded-lg border border-line bg-surface p-4 text-sm">
            {saved && persisted ? (
              <p>
                Saved. Share this page:{" "}
                <Link href={`/apps/${saved.slug}`} className="font-semibold underline">
                  /apps/{saved.slug}
                </Link>
              </p>
            ) : (
              <p>
                This deployment doesn&apos;t keep generated guides permanently. Use <span className="font-semibold">Copy self-contained link</span> to share
                it.
              </p>
            )}
            <p className="mt-1 text-ink-3">
              Generated in {Math.round((guide.meta.durationMs ?? 0) / 1000)}s with {searches} searches and {reads} pages read.{" "}
              <button type="button" className="underline" onClick={() => void run(query, true)}>
                Regenerate
              </button>
            </p>
          </div>
          <GuideView guide={guide} persisted={persisted} />
        </>
      )}
    </div>
  );
}
