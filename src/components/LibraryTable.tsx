import Link from "next/link";
import type { Guide } from "@/lib/schema";
import { scoreGuide, timeHeadline } from "@/lib/rubric";
import { ComposioTag, DifficultyBadge } from "./Badges";
import { Timeline } from "./Timeline";

export function LibraryTable({ guides }: { guides: Guide[] }) {
  const rows = guides
    .map((g) => ({ g, d: scoreGuide(g) }))
    .sort((a, b) => a.d.min + a.d.max - (b.d.min + b.d.max) || a.g.name.localeCompare(b.g.name));
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,13rem)_minmax(0,1fr)_9rem] gap-6 border-b border-line pb-2 text-sm text-ink-3 md:grid">
        <span>App</span>
        <span>Time until outside users can connect: your work, then the wait</span>
        <span>Difficulty</span>
      </div>
      <ul>
        {rows.map(({ g, d }) => (
          <li key={g.slug} className="border-b border-line">
            <Link
              href={`/apps/${g.slug}`}
              className="grid gap-x-6 gap-y-2 py-4 no-underline hover:bg-surface md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_9rem] md:items-center"
            >
              <span>
                <span className="block font-display text-lg font-bold">{g.name}</span>
                <span className="block text-sm text-ink-3">{g.category}</span>
              </span>
              <span className="block">
                <Timeline guide={g} size="sm" />
                <span className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-sm text-ink-2">
                  <span>{timeHeadline(g)}</span>
                  {g.composio.managed !== "unknown" && <ComposioTag managed={g.composio.managed} />}
                </span>
              </span>
              <span>
                <DifficultyBadge d={d} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-6 text-xs text-ink-3" aria-hidden>
        <span>Scale runs from 10 minutes to 3 months, logarithmic.</span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-work align-middle" />
          your work
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-wait align-middle" />
          waiting on the provider
        </span>
        <span>
          <span className="tail-wait mr-1 inline-block h-2 w-3 rounded-sm align-middle" />
          could take this long
        </span>
      </div>
    </div>
  );
}
