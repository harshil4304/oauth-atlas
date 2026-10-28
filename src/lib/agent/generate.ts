import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runProbes } from "../probes";
import { scoreGuide } from "../rubric";
import { FACTOR_KEYS, Guide, type ProbeResult } from "../schema";
import { slugify } from "../store";
import { CHECK_SYSTEM, RESEARCH_SYSTEM } from "./prompts";

export type AgentEvent =
  | { type: "stage"; stage: "research" | "probe" | "check" | "score" | "save"; message: string }
  | { type: "activity"; kind: "search" | "fetch" | "note"; message: string }
  | { type: "probe"; probe: ProbeResult }
  | { type: "not_oauth"; message: string; docsUrl?: string }
  | { type: "done"; guide: Guide }
  | { type: "error"; message: string };

type Emit = (e: AgentEvent) => void;

/** What the research model fills in; the system adds slug, probes and meta. */
const Draft = Guide.omit({ slug: true, probes: true, meta: true });
type Draft = z.infer<typeof Draft>;

const NotOauth = z.object({
  reason: z.string(),
  authMethods: z.array(z.string()),
  docsUrl: z.string().url().optional(),
});

const Verdicts = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["supported", "partial", "unsupported"]),
      note: z.string().default(""),
    }),
  ),
});

const toInputSchema = (s: z.ZodType) => {
  const js = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js as Anthropic.Tool.InputSchema;
};

const model = () => process.env.OAUTH_ATLAS_MODEL || "claude-sonnet-5-5";

/** Runs one model turn with server tools, continuing through pause_turn, and reports search/fetch activity. */
async function runTurn(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages"> & { messages: Anthropic.MessageParam[] },
  emit: Emit,
): Promise<{ message: Anthropic.Message; messages: Anthropic.MessageParam[] }> {
  const messages = [...params.messages];
  for (let i = 0; i < 6; i++) {
    const stream = client.messages.stream({ ...params, messages });
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) emit({ type: "activity", kind: "search", message: input.query });
        if (block.name === "web_fetch" && input.url) emit({ type: "activity", kind: "fetch", message: input.url });
      }
    });
    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content as Anthropic.ContentBlockParam[] });
    if (message.stop_reason !== "pause_turn") return { message, messages };
  }
  throw new Error("The research turn did not finish.");
}

const findToolUse = (m: Anthropic.Message, name: string) =>
  m.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === name);

async function research(client: Anthropic, query: string, today: string, emit: Emit) {
  const tools: Anthropic.ToolUnion[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 10 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 10, max_content_tokens: 12000 },
    {
      name: "submit_guide",
      description: "Submit the finished OAuth setup guide. Call exactly once.",
      input_schema: toInputSchema(Draft),
    },
    {
      name: "report_not_oauth",
      description: "Use instead of submit_guide when the app offers no OAuth for third-party apps.",
      input_schema: toInputSchema(NotOauth),
    },
  ];
  let { message, messages } = await runTurn(
    client,
    {
      model: model(),
      max_tokens: 32000,
      system: RESEARCH_SYSTEM(today),
      tools,
      messages: [{ role: "user", content: `App to research: ${query}` }],
    },
    emit,
  );

  // Up to two repair rounds: missing tool call, or output that fails validation.
  for (let attempt = 0; attempt < 3; attempt++) {
    const notOauth = findToolUse(message, "report_not_oauth");
    if (notOauth) return { kind: "not_oauth" as const, data: NotOauth.parse(notOauth.input) };
    const call = findToolUse(message, "submit_guide");
    let feedback: string;
    if (call) {
      const parsed = Draft.safeParse(call.input);
      if (parsed.success) return { kind: "guide" as const, data: parsed.data };
      feedback = `submit_guide input failed validation:\n${z.prettifyError(parsed.error).slice(0, 3000)}\nFix these fields and call submit_guide again with the complete guide.`;
      messages = [...messages, { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: feedback, is_error: true }] }];
    } else {
      feedback = "You have not called submit_guide yet. Finish now: call submit_guide with the complete guide.";
      messages = [...messages, { role: "user", content: feedback }];
    }
    if (attempt === 2) break;
    emit({ type: "activity", kind: "note", message: call ? "Fixing fields that failed validation" : "Asking the agent to submit its guide" });
    ({ message, messages } = await runTurn(client, { model: model(), max_tokens: 32000, system: RESEARCH_SYSTEM(today), tools, messages }, emit));
  }
  throw new Error("The research agent did not produce a valid guide.");
}

interface CheckableClaim {
  id: string;
  text: string;
  urls: string[];
  apply: (verdict: "supported" | "partial" | "unsupported", note: string) => void;
}

function collectClaims(d: Draft, uncertainties: string[]): CheckableClaim[] {
  const url = (ids: string[]) => ids.map((id) => d.sources.find((s) => s.id === id)?.url).filter((u): u is string => !!u);
  const claims: CheckableClaim[] = [];
  for (const key of FACTOR_KEYS) {
    const f = d.factors[key];
    if (f.evidence === "uncertain" || f.sourceIds.length === 0) continue;
    claims.push({
      id: `factor.${key}`,
      text: `${key} = ${f.value}: ${f.detail}`,
      urls: url(f.sourceIds),
      apply: (v, note) => {
        if (v === "unsupported") {
          uncertainties.push(`Could not confirm "${key}" (${f.value}) from the cited source${note ? `: ${note}` : ""}.`);
          f.value = "unknown";
          f.evidence = "uncertain";
          f.detail = `Unconfirmed. Draft said: ${f.detail}`;
        } else if (v === "partial" && note) uncertainties.push(`Partly confirmed (${key}): ${note}`);
      },
    });
  }
  if (d.time.sourceIds.length && d.time.evidence !== "uncertain") {
    claims.push({
      id: "time",
      text: `Approval wait ${d.time.approvalWait ? `${d.time.approvalWait.min}-${d.time.approvalWait.max} ${d.time.approvalWait.unit}` : "none"}. ${d.time.note}`,
      urls: url(d.time.sourceIds),
      apply: (v, note) => {
        if (v !== "supported") {
          d.time.evidence = "uncertain";
          uncertainties.push(`Timing not fully confirmed${note ? `: ${note}` : "."}`);
        }
      },
    });
  }
  d.blockers.forEach((b, i) => {
    if (b.evidence === "uncertain" || !b.sourceIds.length) return;
    claims.push({
      id: `blocker.${i}`,
      text: `${b.issue} Fix: ${b.fix}`,
      urls: url(b.sourceIds),
      apply: (v) => {
        if (v === "unsupported") b.evidence = "uncertain";
      },
    });
  });
  if (d.review.sourceIds.length && d.review.evidence !== "uncertain") {
    claims.push({
      id: "review",
      text: d.review.summary,
      urls: url(d.review.sourceIds),
      apply: (v) => {
        if (v === "unsupported") d.review.evidence = "uncertain";
      },
    });
  }
  return claims.filter((c) => c.urls.length > 0);
}

async function check(client: Anthropic, d: Draft, emit: Emit) {
  const uncertainties: string[] = [];
  const claims = collectClaims(d, uncertainties);
  if (!claims.length) return { checked: 0, supported: 0, downgraded: 0, notes: [], uncertainties };
  const list = claims.map((c) => `[${c.id}] ${c.text}\n  cited: ${c.urls.join(" , ")}`).join("\n");
  const tools: Anthropic.ToolUnion[] = [
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 8, max_content_tokens: 12000 },
    { name: "submit_verdicts", description: "Submit one verdict per claim id.", input_schema: toInputSchema(Verdicts) },
  ];
  const { message } = await runTurn(
    client,
    { model: model(), max_tokens: 8000, system: CHECK_SYSTEM, tools, messages: [{ role: "user", content: `Claims about ${d.name}:\n\n${list}` }] },
    emit,
  );
  const call = findToolUse(message, "submit_verdicts");
  const parsed = call ? Verdicts.safeParse(call.input) : null;
  if (!parsed?.success) {
    return { checked: 0, supported: 0, downgraded: 0, notes: ["Checker did not return verdicts; claims left as drafted."], uncertainties };
  }
  let supported = 0;
  let downgraded = 0;
  const notes: string[] = [];
  for (const v of parsed.data.verdicts) {
    const c = claims.find((x) => x.id === v.id);
    if (!c) continue;
    c.apply(v.verdict, v.note);
    if (v.verdict === "supported") supported++;
    if (v.verdict === "unsupported") downgraded++;
    if (v.verdict !== "supported") notes.push(`${v.id}: ${v.verdict}${v.note ? `, ${v.note}` : ""}`);
  }
  return { checked: claims.length, supported, downgraded, notes, uncertainties };
}

/** Enforce the evidence invariants no matter what the model wrote. */
function sanitize(d: Draft): Draft {
  const ids = new Set(d.sources.map((s) => s.id));
  const fix = <T extends { evidence: string; sourceIds: string[] }>(x: T): T => {
    x.sourceIds = x.sourceIds.filter((id) => ids.has(id));
    if (x.evidence === "tested" || x.sourceIds.length === 0) x.evidence = "uncertain";
    return x;
  };
  fix(d.composio);
  FACTOR_KEYS.forEach((k) => fix(d.factors[k]));
  fix(d.time);
  fix(d.review);
  [...d.prerequisites, ...d.steps, ...d.scopes, ...d.blockers, ...d.nuances].forEach(fix);
  return d;
}

/** Toolkit slugs to try for an app name: "Google (Gmail)" → googlegmail, google, gmail. */
export function toolkitCandidates(name: string, query: string): string[] {
  const words = `${name} ${query}`
    .toLowerCase()
    .replace(/https?:\/\/|www\.|\.(com|io|dev|ai|app|co|net|org)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
  const joined = name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
  return [...new Set([joined, ...words])].slice(0, 5);
}

/** Uses Composio's API (GET /api/v3/toolkits/{slug}, field composio_managed_auth_schemes) when a key is configured. */
export async function composioCheck(candidates: string[]): Promise<Guide["composio"] | null> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return null;
  for (const slug of candidates) {
    try {
      const r = await fetch(`https://backend.composio.dev/api/v3/toolkits/${encodeURIComponent(slug)}`, { headers: { "x-api-key": key } });
      if (!r.ok) continue;
      const j = (await r.json()) as { composio_managed_auth_schemes?: string[] };
      const managed = (j.composio_managed_auth_schemes ?? []).some((s) => /oauth/i.test(s));
      return {
        managed: managed ? "yes" : "no",
        note: managed
          ? `Composio provides a managed OAuth app for the "${slug}" toolkit, so you can start without registering your own. Register your own for your branding on the consent screen, custom scopes or separate rate limits.`
          : `Composio does not manage an OAuth app for the "${slug}" toolkit; register your own and add it as a custom auth config.`,
        evidence: "tested",
        sourceIds: [],
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export async function generateGuide(query: string, emit: Emit, opts: { client?: Anthropic } = {}): Promise<Guide | null> {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const client = opts.client ?? new Anthropic();

  emit({ type: "stage", stage: "research", message: `Researching ${query}: finding the developer portal, OAuth docs and review policies` });
  const r = await research(client, query, today, emit);
  if (r.kind === "not_oauth") {
    emit({ type: "not_oauth", message: `${r.data.reason} Supported auth: ${r.data.authMethods.join(", ") || "unknown"}.`, docsUrl: r.data.docsUrl });
    return null;
  }
  const draft = sanitize(r.data);
  draft.sources.forEach((s) => (s.checkedAt = today));

  emit({ type: "stage", stage: "probe", message: "Running live checks on endpoints, portal and sources" });
  const probes = await runProbes(draft);
  probes.forEach((p) => emit({ type: "probe", probe: p }));

  emit({ type: "stage", stage: "check", message: "Second pass: re-reading cited pages to verify each claim" });
  const checker = await check(client, draft, emit);
  draft.uncertainties.push(...checker.uncertainties);

  const composio = await composioCheck(toolkitCandidates(draft.name, query));
  if (composio) draft.composio = composio;

  emit({ type: "stage", stage: "score", message: "Scoring difficulty with the shared rubric" });
  const guide = Guide.parse({
    ...draft,
    slug: slugify(draft.name || query),
    probes,
    meta: {
      origin: "agent",
      lastVerified: today,
      model: model(),
      durationMs: Date.now() - started,
      checker: { checked: checker.checked, supported: checker.supported, downgraded: checker.downgraded, notes: checker.notes },
      corrections: [],
    },
  });
  const d = scoreGuide(guide);
  emit({ type: "activity", kind: "note", message: `Difficulty: ${d.label} (score ${d.min === d.max ? d.min : `${d.min}–${d.max}`})` });
  return guide;
}
