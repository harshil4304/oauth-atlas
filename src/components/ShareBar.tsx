"use client";

import { useState } from "react";
import type { Guide } from "@/lib/schema";
import { encodeGuide, guideToMarkdown } from "@/lib/export";

export function ShareBar({ guide, persisted }: { guide: Guide; persisted: boolean }) {
  const [msg, setMsg] = useState("");

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(done);
    } catch {
      setMsg("Copying is blocked in this browser. Select the address bar and copy it instead.");
    }
  };

  const pageLink = () => `${location.origin}/apps/${guide.slug}`;
  const selfContained = () => `${location.origin}/share#g=${encodeGuide(guide)}`;

  const download = () => {
    const blob = new Blob([guideToMarkdown(guide)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${guide.slug}-oauth-guide.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Markdown downloaded.");
  };

  const btn = "w-full rounded-md border border-line-strong px-3 py-2 text-left text-sm font-semibold hover:border-ink";

  return (
    <div className="no-print">
      <h2 className="font-display text-base font-bold">Share or keep</h2>
      <div className="mt-3 space-y-2">
        {persisted && (
          <button type="button" className={btn} onClick={() => copy(pageLink(), "Link copied.")}>
            Copy link
          </button>
        )}
        <button
          type="button"
          className={btn}
          onClick={() => copy(selfContained(), "Self-contained link copied. It works without our database.")}
          title="The whole guide is packed into the link"
        >
          Copy self-contained link
        </button>
        <button type="button" className={btn} onClick={() => copy(guideToMarkdown(guide), "Markdown copied. Paste it into a doc, issue or PR.")}>
          Copy as Markdown
        </button>
        <button type="button" className={btn} onClick={download}>
          Download Markdown
        </button>
        <button type="button" className={btn} onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <a className={`${btn} block no-underline`} href={`/compare?a=${guide.slug}`}>
          Compare with another app
        </a>
      </div>
      <p className="mt-2 min-h-5 text-sm text-work" role="status">
        {msg}
      </p>
    </div>
  );
}
