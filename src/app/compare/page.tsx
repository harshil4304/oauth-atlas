import type { Metadata } from "next";
import Link from "next/link";
import { DifficultyBadge, Evidence } from "@/components/Badges";
import { Timeline } from "@/components/Timeline";
import { LIBRARY, getLibraryGuide } from "@/lib/library";
import { FACTOR_LABELS, WEIGHTS, scoreGuide, timeHeadline } from "@/lib/rubric";
import { FACTOR_KEYS, type Guide } from "@/lib/schema";
import { listGenerated, loadGuide } from "@/lib/store";

export const metadata: Metadata = { title: "Compare apps" };

const VALUE = { yes: "Required", no: "No", depends: "Sometimes", unknown: "Unknown" } as const;
const VALUE_CLS = { yes: "text-hard", no: "text-work", depends: "text-wait", unknown: "text-wait" } as const;

async function find(slug?: string): Promise<Guide | null> {
  if (!slug) return null;
  return getLibraryGuide(slug) ?? (await loadGuide(slug));
}

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const a = await find(typeof sp.a === "string" ? sp.a : undefined);
  const b = await find(typeof sp.b === "string" ? sp.b : undefined);
  const generated = await listGenerated(24);
  const options = [...LIBRARY.map((g) => ({ slug: g.slug, name: g.name })), ...generated.map((g) => ({ slug: g.slug, name: `${g.name} (generated)` }))];
  const picked = [a, b].filter((g): g is Guide => !!g);

  return (
    <div className="pt-10">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Compare two apps</h1>
      <p className="mt-2 max-w-[65ch] text-ink-2">Useful when you&apos;re deciding which integration to launch first, or explaining to your team why one takes longer.</p>
      <form action="/compare" method="get" className="mt-6 flex flex-wrap items-end gap-3">
        {(["a", "b"] as const).map((k, i) => (
          <label key={k} className="flex flex-col text-sm text-ink-2">
            {i === 0 ? "First app" : "Second app"}
            <select
              name={k}
              defaultValue={(i === 0 ? a : b)?.slug ?? ""}
              className="mt-1 min-w-56 rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink"
            >
              <option value="">Choose an app</option>
              {options.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">
          Compare
        </button>
      </form>

      {picked.length > 0 && (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left">
            <thead>
              <tr className="border-b-2 border-ink align-bottom">
                <th className="w-52 py-3 pr-4 font-normal text-ink-3" />
                {picked.map((g) => (
                  <th key={g.slug} className="py-3 pr-6">
                    <Link href={`/apps/${g.slug}`} className="font-display text-2xl font-extrabold">
                      {g.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-line">
                <th className="py-3 pr-4 text-sm font-normal text-ink-3">Difficulty</th>
                {picked.map((g) => (
                  <td key={g.slug} className="py-3 pr-6">
                    <DifficultyBadge d={scoreGuide(g)} />
                  </td>
                ))}
              </tr>
              <tr className="border-b border-line">
                <th className="py-3 pr-4 text-sm font-normal text-ink-3">Time</th>
                {picked.map((g) => (
                  <td key={g.slug} className="py-3 pr-6">
                    <p className="mb-2 font-semibold">{timeHeadline(g)}</p>
                    <Timeline guide={g} size="sm" />
                  </td>
                ))}
              </tr>
              {FACTOR_KEYS.map((k) => (
                <tr key={k} className="border-b border-line">
                  <th className="py-3 pr-4 text-sm font-normal text-ink-3">
                    {FACTOR_LABELS[k]} <span className="whitespace-nowrap">({WEIGHTS[k]} pts)</span>
                  </th>
                  {picked.map((g) => (
                    <td key={g.slug} className="py-3 pr-6 text-sm">
                      <span className={`font-semibold ${VALUE_CLS[g.factors[k].value]}`}>{VALUE[g.factors[k].value]}</span>
                      <span className="block text-ink-2">{g.factors[k].detail}</span>
                      <Evidence level={g.factors[k].evidence} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-line">
                <th className="py-3 pr-4 text-sm font-normal text-ink-3">Start here</th>
                {picked.map((g) => (
                  <td key={g.slug} className="py-3 pr-6 text-sm">
                    {g.nextStep}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
