import { scoreGuide } from "./rubric";
import { FACTOR_KEYS, type DurationRange, type FactorKey, type Guide } from "./schema";

const ELAPSED = { minutes: 1, hours: 60, days: 1440, weeks: 10080 } as const;
const span = (r: DurationRange) => [r.min * ELAPSED[r.unit], r.max * ELAPSED[r.unit]] as const;

/** Ranges overlap, allowing a factor of 2 slack because estimates are coarse. */
export function rangesOverlap(a: DurationRange | null, b: DurationRange | null): boolean {
  if (!a || !b) return !a && !b;
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return a0 <= b1 * 2 && b0 <= a1 * 2;
}

export type FactorAgreement = "match" | "hedged" | "conflict";

/** match = same value; hedged = one side says depends/unknown; conflict = yes vs no. */
export function factorAgreement(ref: Guide, got: Guide, k: FactorKey): FactorAgreement {
  const a = ref.factors[k].value;
  const b = got.factors[k].value;
  if (a === b) return "match";
  if ((a === "yes" && b === "no") || (a === "no" && b === "yes")) return "conflict";
  return "hedged";
}

export interface EvalRow {
  slug: string;
  difficultyRef: string;
  difficultyGot: string;
  difficultyOverlap: boolean;
  factorMatches: number;
  factorHedged: number;
  factorConflicts: FactorKey[];
  waitOverlap: boolean;
  reviewAgrees: boolean;
  citedShare: number;
  checker: { checked: number; supported: number; downgraded: number } | null;
  probesPassed: string;
}

export function compareGuides(ref: Guide, got: Guide): EvalRow {
  const dr = scoreGuide(ref);
  const dg = scoreGuide(got);
  const agreement = FACTOR_KEYS.map((k) => [k, factorAgreement(ref, got, k)] as const);
  const claims = [...got.steps, ...got.blockers, ...got.nuances, ...got.prerequisites, ...Object.values(got.factors)];
  const cited = claims.filter((c) => c.sourceIds.length > 0 && c.evidence !== "uncertain").length;
  return {
    slug: ref.slug,
    difficultyRef: dr.label,
    difficultyGot: dg.label,
    difficultyOverlap: dr.min <= dg.max && dg.min <= dr.max,
    factorMatches: agreement.filter(([, a]) => a === "match").length,
    factorHedged: agreement.filter(([, a]) => a === "hedged").length,
    factorConflicts: agreement.filter(([, a]) => a === "conflict").map(([k]) => k),
    waitOverlap: rangesOverlap(ref.time.approvalWait, got.time.approvalWait),
    reviewAgrees: factorAgreement(ref, got, "appReview") !== "conflict",
    citedShare: claims.length ? cited / claims.length : 0,
    checker: got.meta.checker ? { checked: got.meta.checker.checked, supported: got.meta.checker.supported, downgraded: got.meta.checker.downgraded } : null,
    probesPassed: `${got.probes.filter((p) => p.result === "pass").length}/${got.probes.length}`,
  };
}
