import type { DurationRange, FactorKey, Guide } from "./schema";

/**
 * Difficulty is computed from facts, not from the model's opinion, so the
 * library and live-generated guides are scored the same way.
 *
 * Factors are judged for the guide's stated scenario (e.g. "reads email for
 * users outside your company"), not for every possible path.
 *
 * "yes" counts fully. "depends" and "unknown" count only toward the upper
 * bound, so a guide can honestly say "Medium to Hard, depending on scopes".
 */
export const WEIGHTS: Record<FactorKey, number> = {
  policyAndDomain: 1,
  userCapBeforeApproval: 1,
  businessVerification: 2,
  adminApproval: 2,
  appReview: 3,
  paidOrPartner: 3,
  securityAssessment: 4,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  policyAndDomain: "Privacy policy, homepage or domain checks",
  userCapBeforeApproval: "User cap until approved",
  businessVerification: "Business or publisher verification",
  adminApproval: "Customer admins must install or approve",
  appReview: "Provider app review",
  paidOrPartner: "Paid plan or partner program",
  securityAssessment: "Third-party security assessment",
};

export type Level = "Easy" | "Medium" | "Hard";

export function levelFor(score: number): Level {
  if (score <= 2) return "Easy";
  if (score <= 5) return "Medium";
  return "Hard";
}

export interface Difficulty {
  min: number;
  max: number;
  low: Level;
  high: Level;
  label: string;
  drivers: { key: FactorKey | "effort"; label: string; points: number; value: string }[];
}

const MINUTES = { minutes: 1, hours: 60, days: 60 * 8, weeks: 60 * 40 } as const;
const toMinutes = (r: DurationRange, end: "min" | "max") => r[end] * MINUTES[r.unit];

/** One extra point when the hands-on setup itself takes a working day or more. */
export const EFFORT_POINT_THRESHOLD_MIN = MINUTES.days;

export function scoreGuide(g: Pick<Guide, "factors"> & Partial<Pick<Guide, "time">>): Difficulty {
  let min = 0;
  let max = 0;
  const drivers: Difficulty["drivers"] = [];
  if (g.time) {
    const lo = toMinutes(g.time.handsOn, "min") >= EFFORT_POINT_THRESHOLD_MIN;
    const hi = toMinutes(g.time.handsOn, "max") >= EFFORT_POINT_THRESHOLD_MIN;
    if (lo) min += 1;
    if (hi) {
      max += 1;
      drivers.push({ key: "effort", label: "A day or more of setup work", points: 1, value: lo ? "yes" : "depends" });
    }
  }
  for (const key of Object.keys(WEIGHTS) as FactorKey[]) {
    const f = g.factors[key];
    const w = WEIGHTS[key];
    if (f.value === "yes") {
      min += w;
      max += w;
    } else if (f.value === "depends" || f.value === "unknown") {
      max += w;
    }
    if (f.value !== "no") drivers.push({ key, label: FACTOR_LABELS[key], points: w, value: f.value });
  }
  const low = levelFor(min);
  const high = levelFor(max);
  return {
    min,
    max,
    low,
    high,
    label: low === high ? low : `${low} to ${high}`,
    drivers: drivers.sort((a, b) => b.points - a.points),
  };
}

export function formatRange(r: DurationRange): string {
  const unit = r.min === 1 && r.max === 1 ? r.unit.replace(/s$/, "") : r.unit;
  return r.min === r.max ? `${r.min} ${unit}` : `${r.min}–${r.max} ${unit}`;
}

export function timeHeadline(g: Pick<Guide, "time">): string {
  const hands = formatRange(g.time.handsOn);
  return g.time.approvalWait
    ? `${hands} of work + ${formatRange(g.time.approvalWait)} waiting`
    : `${hands} of work, no approval wait`;
}
