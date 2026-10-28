import { z } from "zod";

/**
 * One guide format shared by the hand-researched library and the live agent.
 * Every factual statement carries an evidence label and source ids so readers
 * can tell what was tested, what an official source says, and what is uncertain.
 */

export const EvidenceLevel = z.enum([
  "tested", // we ran a check ourselves (endpoint probe, walked a setup screen)
  "official", // stated in the provider's own docs or policy pages
  "community", // developer reports, forums, third-party write-ups
  "uncertain", // inferred, conflicting, or could not be confirmed
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

const Cited = {
  evidence: EvidenceLevel,
  sourceIds: z.array(z.string()).default([]),
};

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  kind: z.enum(["official", "community"]),
  checkedAt: z.string().describe("ISO date the source was read"),
});
export type Source = z.infer<typeof Source>;

export const Claim = z.object({
  text: z.string(),
  ...Cited,
});
export type Claim = z.infer<typeof Claim>;

/** Facts that drive the difficulty score. See lib/rubric.ts for weights. */
export const FACTOR_KEYS = [
  "policyAndDomain",
  "userCapBeforeApproval",
  "businessVerification",
  "adminApproval",
  "appReview",
  "paidOrPartner",
  "securityAssessment",
] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FactorValue = z.enum(["yes", "no", "depends", "unknown"]);
export type FactorValue = z.infer<typeof FactorValue>;

export const Factor = z.object({
  value: FactorValue,
  detail: z.string(),
  ...Cited,
});
export type Factor = z.infer<typeof Factor>;

export const DurationRange = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  unit: z.enum(["minutes", "hours", "days", "weeks"]),
});
export type DurationRange = z.infer<typeof DurationRange>;

export const Step = z.object({
  id: z.string(),
  phase: z.enum(["prepare", "register", "configure", "test", "review", "launch"]),
  title: z.string(),
  detail: z.string(),
  owner: z.enum(["agent", "you", "together"]).describe(
    "agent = an AI agent can do it unattended (research, drafting, code, config files); you = needs a human (accounts, legal, payment, consoles behind login, submitting for review); together = agent drafts, you review and submit",
  ),
  link: z.string().url().optional(),
  ...Cited,
});
export type Step = z.infer<typeof Step>;

export const Scope = z.object({
  name: z.string(),
  purpose: z.string(),
  sensitivity: z.enum(["basic", "sensitive", "restricted", "unknown"]),
  triggersReview: z.boolean().nullable(),
  ...Cited,
});
export type Scope = z.infer<typeof Scope>;

export const Blocker = z.object({
  issue: z.string(),
  fix: z.string(),
  ...Cited,
});
export type Blocker = z.infer<typeof Blocker>;

export const ProbeResult = z.object({
  name: z.string(),
  target: z.string(),
  result: z.enum(["pass", "fail", "skipped"]),
  detail: z.string(),
  ranAt: z.string(),
});
export type ProbeResult = z.infer<typeof ProbeResult>;

export const Guide = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  website: z.string().url(),
  category: z.string(),
  summary: z.string().describe("One sentence: what getting an OAuth app ready looks like here"),
  scenario: z
    .string()
    .describe("The typical AI-agent use case this guide assumes, e.g. 'read and send email for users outside your company'"),
  composio: z.object({
    managed: z.enum(["yes", "no", "unknown"]),
    note: z.string(),
    ...Cited,
  }),
  portal: z.object({
    url: z.string().url(),
    accountNeeded: z.string(),
  }),
  endpoints: z.object({
    authorize: z.string().url().optional(),
    token: z.string().url().optional(),
    discovery: z.string().url().optional(),
  }),
  factors: z.object({
    policyAndDomain: Factor,
    userCapBeforeApproval: Factor,
    businessVerification: Factor,
    adminApproval: Factor.describe("Each customer's admin must install, approve or allow the app before users can connect"),
    appReview: Factor,
    paidOrPartner: Factor,
    securityAssessment: Factor,
  }),
  time: z.object({
    handsOn: DurationRange,
    approvalWait: DurationRange.nullable().describe("null when no approval is needed"),
    note: z.string(),
    ...Cited,
  }),
  nextStep: z.string(),
  prerequisites: z.array(Claim),
  steps: z.array(Step).min(1),
  scopes: z.array(Scope),
  review: z.object({
    summary: z.string(),
    triggers: z.array(z.string()),
    reviewersCheck: z.array(z.string()),
    meanwhile: z.string().describe("What you can do before approval (test users, dev mode, own workspace)"),
    ...Cited,
  }),
  blockers: z.array(Blocker),
  nuances: z.array(Claim),
  uncertainties: z.array(z.string()),
  probes: z.array(ProbeResult).default([]),
  sources: z.array(Source).min(1),
  meta: z.object({
    origin: z.enum(["library", "agent"]),
    lastVerified: z.string(),
    model: z.string().optional(),
    durationMs: z.number().optional(),
    checker: z
      .object({
        checked: z.number(),
        supported: z.number(),
        downgraded: z.number(),
        notes: z.array(z.string()),
      })
      .optional(),
    corrections: z.array(z.string()).default([]),
  }),
});
export type Guide = z.infer<typeof Guide>;
export type GuideInput = z.input<typeof Guide>;

/** Every source id referenced in a guide must exist in guide.sources. */
export function danglingSourceIds(g: Guide): string[] {
  const ids = new Set(g.sources.map((s) => s.id));
  const refs: string[] = [];
  const collect = (x: { sourceIds: string[] }) => refs.push(...x.sourceIds);
  collect(g.composio);
  Object.values(g.factors).forEach(collect);
  collect(g.time);
  g.prerequisites.forEach(collect);
  g.steps.forEach(collect);
  g.scopes.forEach(collect);
  collect(g.review);
  g.blockers.forEach(collect);
  g.nuances.forEach(collect);
  return [...new Set(refs.filter((r) => !ids.has(r)))];
}
