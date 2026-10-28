import type { DurationRange, Guide } from "@/lib/schema";
import { formatRange } from "@/lib/rubric";

/**
 * The signature element: elapsed time until users outside your team can connect,
 * on a log scale so "30 minutes" and "6 weeks" fit on one line and rows compare.
 * Solid = lower bound, hatched tail = upper bound of the range.
 */

const ELAPSED = { minutes: 1, hours: 60, days: 1440, weeks: 10080 } as const;
const MIN = 10; // 10 minutes at the left edge
const MAX = 13 * 10080; // ~3 months at the right edge
const toMin = (r: DurationRange, end: "min" | "max") => r[end] * ELAPSED[r.unit];
const pos = (m: number) => Math.max(0, Math.min(1, Math.log(Math.max(m, MIN) / MIN) / Math.log(MAX / MIN)));

const TICKS = [
  { m: 60, label: "1 hour" },
  { m: 1440, label: "1 day" },
  { m: 10080, label: "1 week" },
  { m: 43200, label: "1 month" },
  { m: MAX, label: "3 months" },
];

export function Timeline({ guide, size = "lg" }: { guide: Pick<Guide, "time" | "name">; size?: "sm" | "lg" }) {
  const w = guide.time.handsOn;
  const wait = guide.time.approvalWait;
  const wMin = pos(toMin(w, "min"));
  const wMax = pos(toMin(w, "max"));
  const waitMin = wait ? pos(toMin(w, "max") + toMin(wait, "min")) : wMax;
  const waitMax = wait ? pos(toMin(w, "max") + toMin(wait, "max")) : wMax;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const h = size === "lg" ? "h-4" : "h-2.5";
  const label = `${guide.name}: ${formatRange(w)} of your work${wait ? `, then ${formatRange(wait)} waiting on the provider` : ", no approval wait"}.`;

  return (
    <div className="w-full" role="img" aria-label={label}>
      <div className={`relative ${h} w-full rounded-full bg-line/60`}>
        <div className="grow-in absolute inset-y-0 left-0 rounded-l-full bg-work" style={{ width: pct(Math.max(wMin, 0.012)) }} />
        {wMax > wMin && <div className="tail-work absolute inset-y-0" style={{ left: pct(wMin), width: pct(wMax - wMin) }} />}
        {wait && (
          <>
            <div className="grow-in absolute inset-y-0 bg-wait" style={{ left: pct(wMax), width: pct(Math.max(waitMin - wMax, 0.008)) }} />
            {waitMax > waitMin && <div className="tail-wait absolute inset-y-0 rounded-r-full" style={{ left: pct(waitMin), width: pct(waitMax - waitMin) }} />}
          </>
        )}
        {size === "lg" &&
          TICKS.map((t) => (
            <div key={t.m} className="absolute -bottom-1.5 h-2 w-px bg-line-strong" style={{ left: pct(pos(t.m)) }} aria-hidden />
          ))}
      </div>
      {size === "lg" && (
        <div className="relative mt-2 h-4 text-xs text-ink-3" aria-hidden>
          {TICKS.map((t, i) => (
            <span
              key={t.m}
              className={`absolute whitespace-nowrap ${i === TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2"} ${t.m === 43200 ? "hidden sm:inline" : ""}`}
              style={{ left: pct(pos(t.m)) }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TimelineLegend({ guide }: { guide: Pick<Guide, "time"> }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-work" aria-hidden />
        <dt className="text-ink-2">Your work</dt>
        <dd className="font-semibold">{formatRange(guide.time.handsOn)}</dd>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-wait" aria-hidden />
        <dt className="text-ink-2">Waiting on the provider</dt>
        <dd className="font-semibold">{guide.time.approvalWait ? formatRange(guide.time.approvalWait) : "none"}</dd>
      </div>
      <div className="flex items-center gap-2 text-ink-3">
        <span className="tail-work inline-block h-3 w-3 rounded-sm" aria-hidden />
        <span>Hatched = upper end of the range</span>
      </div>
    </dl>
  );
}
