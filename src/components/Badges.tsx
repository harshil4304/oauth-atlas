import type { EvidenceLevel, Step } from "@/lib/schema";
import type { Difficulty, Level } from "@/lib/rubric";

const LEVEL_STYLE: Record<Level, string> = {
  Easy: "bg-work-soft text-work",
  Medium: "bg-wait-soft text-[color-mix(in_srgb,var(--wait)_70%,var(--ink))]",
  Hard: "bg-hard-soft text-hard",
};

export function DifficultyBadge({ d, large = false }: { d: Difficulty; large?: boolean }) {
  const cls = large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-sm";
  if (d.low === d.high) return <span className={`inline-block rounded-md font-semibold ${cls} ${LEVEL_STYLE[d.low]}`}>{d.low}</span>;
  return (
    <span className={`inline-flex overflow-hidden rounded-md font-semibold ${large ? "text-base" : "text-sm"}`} title="Range: depends on choices or facts we could not confirm">
      <span className={`${large ? "px-3 py-1" : "px-2 py-0.5"} ${LEVEL_STYLE[d.low]}`}>{d.low}</span>
      <span className={`${large ? "px-3 py-1" : "px-2 py-0.5"} ${LEVEL_STYLE[d.high]}`}>to {d.high}</span>
    </span>
  );
}

export const EVIDENCE: Record<EvidenceLevel, { label: string; mark: string; cls: string; help: string }> = {
  tested: { label: "Tested", mark: "●", cls: "text-work", help: "We ran a live check ourselves" },
  official: { label: "Official docs", mark: "◆", cls: "text-ink", help: "Stated on the provider's own pages" },
  community: { label: "Community", mark: "▲", cls: "text-[color-mix(in_srgb,var(--wait)_75%,var(--ink))]", help: "Developer reports or third-party guides" },
  uncertain: { label: "Unconfirmed", mark: "○", cls: "text-hard", help: "Inferred or could not be confirmed" },
};

export function Evidence({ level, sourceIds, sources }: { level: EvidenceLevel; sourceIds?: string[]; sources?: { id: string; url: string; title: string }[] }) {
  const e = EVIDENCE[level];
  const cited = (sourceIds ?? []).map((id) => sources?.find((s) => s.id === id)).filter(Boolean) as { id: string; url: string; title: string }[];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-xs text-ink-3">
      <span className={e.cls} title={e.help}>
        <span aria-hidden>{e.mark}</span> {e.label}
      </span>
      {cited.map((s) => (
        <a key={s.id} href={`#src-${s.id}`} className="text-ink-3 underline decoration-line-strong hover:text-ink" title={s.title}>
          [{s.id}]
        </a>
      ))}
    </span>
  );
}

const OWNER: Record<Step["owner"], { label: string; cls: string; help: string }> = {
  agent: { label: "Agent can do", cls: "border-work text-work", help: "An AI agent can do this without you" },
  you: { label: "You do", cls: "border-ink text-ink", help: "Needs a person: accounts, consoles, legal or payment details" },
  together: { label: "Agent drafts, you submit", cls: "border-wait text-[color-mix(in_srgb,var(--wait)_70%,var(--ink))]", help: "An agent prepares it; you review and submit" },
};

export function OwnerTag({ owner }: { owner: Step["owner"] }) {
  const o = OWNER[owner];
  return (
    <span className={`inline-block rounded border px-1.5 py-px text-xs font-semibold ${o.cls}`} title={o.help}>
      {o.label}
    </span>
  );
}

export function ComposioTag({ managed }: { managed: "yes" | "no" | "unknown" }) {
  if (managed === "yes") return <span className="text-sm text-work">Composio-managed app available</span>;
  if (managed === "no") return <span className="text-sm text-ink-2">Bring your own app</span>;
  return <span className="text-sm text-ink-3">Composio status unchecked</span>;
}
