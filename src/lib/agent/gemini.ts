import type { Content, FunctionCall, GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { toGeminiSchema } from "./gemini-schema";
import { GEMINI_CHECK_SYSTEM, GEMINI_RESEARCH_SYSTEM } from "./prompts";
import { fetchPage, normalizeUrl, relevantExcerpt, searchWeb, type FetchedPage } from "./web";

/**
 * Gemini path, designed for a free Google AI Studio key:
 *  - Google Search grounding is not part of the free tier, so our server does the
 *    searching and page fetching, exposed to Gemini as function calls (free).
 *  - Requests are rationed (free quotas are per minute and per day): several fetches
 *    per turn, a hard turn cap, one structuring call, one fact-check call.
 */

export type GeminiLike = { models: { generateContent(p: GenerateContentParameters): Promise<GenerateContentResponse> } };

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
export const newGeminiClient = (): GeminiLike => new GoogleGenAI({ apiKey: geminiKey() });

const MAX_TURNS = Number(process.env.GEMINI_MAX_TURNS || 7);
const MAX_CALLS_PER_TURN = 6;

type Emit = (e: { type: "activity"; kind: "search" | "fetch" | "note"; message: string }) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries short rate-limit waits and turns Gemini API errors into messages a developer can act on. */
export async function withGeminiRetry<T>(fn: () => Promise<T>, emit: Emit, delays = { rateLimitMaxMs: 45000, serverErrorMs: 4000 }): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      const msg = e instanceof Error ? e.message : String(e);
      const model = geminiModel();
      if (status === 429 || /RESOURCE_EXHAUSTED/.test(msg)) {
        if (/per ?day|PerDay|daily/i.test(msg)) {
          throw new Error(
            `The Gemini free-tier daily quota for ${model} is used up. Try again tomorrow, or set GEMINI_MODEL to a model with a bigger free quota (see your limits at aistudio.google.com/rate-limit).`,
          );
        }
        const wait = Math.ceil(Number(msg.match(/retry(?:Delay)?[^0-9]*([\d.]+)\s*s/i)?.[1] ?? 20) * 1000);
        if (attempt >= 2 || wait > delays.rateLimitMaxMs) {
          throw new Error(`Gemini's per-minute free-tier limit for ${model} was hit. Wait a minute and try again.`);
        }
        emit({ type: "activity", kind: "note", message: `Gemini rate limit reached; waiting ${Math.round(wait / 1000)}s` });
        await sleep(wait);
        continue;
      }
      if ((status === 500 || status === 503) && attempt < 2) {
        emit({ type: "activity", kind: "note", message: "Gemini is busy; retrying" });
        await sleep(delays.serverErrorMs * (attempt + 1));
        continue;
      }
      if (/API key not valid|API_KEY_INVALID/i.test(msg)) throw new Error("Google rejected the Gemini API key. Check GEMINI_API_KEY (create one at aistudio.google.com/apikey).");
      if (status === 404) throw new Error(`Gemini model "${model}" was not found. Set GEMINI_MODEL to a current model, e.g. gemini-3.5-flash-lite or gemini-3.8-flash.`);
      if (status === 403) throw new Error(`This Gemini API key can't use ${model}. Check the key's project in Google AI Studio.`);
      throw e;
    }
  }
}

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_web",
        description: "Web search run by our server. Returns up to 8 results with title, url and snippet. May return no results.",
        parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
      {
        name: "fetch_page",
        description: "Download a web page and return its readable text and the most relevant links on it.",
        parametersJsonSchema: { type: "object", properties: { url: { type: "string", description: "Absolute http(s) URL" } }, required: ["url"] },
      },
    ],
  },
];

export interface PageRecord {
  url: string;
  title: string;
  ok: boolean;
}

export async function geminiResearchNotes(client: GeminiLike, query: string, today: string, emit: Emit) {
  const pages = new Map<string, PageRecord>();
  const contents: Content[] = [{ role: "user", parts: [{ text: `App to research: ${query}` }] }];
  const config = { systemInstruction: GEMINI_RESEARCH_SYSTEM(today, MAX_TURNS), tools: TOOLS };
  let notes = "";
  let requests = 0;

  const exec = async (call: FunctionCall, i: number): Promise<Record<string, unknown>> => {
    const args = (call.args ?? {}) as { query?: string; url?: string };
    if (i >= MAX_CALLS_PER_TURN) return { error: `Too many calls in one turn; at most ${MAX_CALLS_PER_TURN}.` };
    if (call.name === "search_web" && args.query) {
      emit({ type: "activity", kind: "search", message: args.query });
      const r = await searchWeb(args.query);
      return r.error ? { results: r.results, note: r.error } : { results: r.results };
    }
    if (call.name === "fetch_page" && args.url) {
      const key = normalizeUrl(args.url);
      if (pages.has(key)) return { error: "Already fetched; use what you have." };
      emit({ type: "activity", kind: "fetch", message: args.url });
      const p: FetchedPage = await fetchPage(args.url);
      pages.set(key, { url: p.url, title: p.title, ok: p.ok });
      if (p.ok) pages.set(normalizeUrl(p.url), { url: p.url, title: p.title, ok: true });
      return { url: p.url, ok: p.ok, status: p.status, title: p.title, error: p.error, text: p.text, links: p.links.slice(0, 25) };
    }
    return { error: `Unknown tool or missing argument: ${call.name}` };
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await withGeminiRetry(() => client.models.generateContent({ model: geminiModel(), contents, config }), emit);
    requests++;
    const calls = res.functionCalls ?? [];
    if (!calls.length) {
      notes = res.text ?? "";
      break;
    }
    const modelContent = res.candidates?.[0]?.content ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) };
    contents.push({ ...modelContent, role: "model" });
    const results = await Promise.all(calls.map(exec));
    contents.push({
      role: "user",
      parts: calls.map((c, i): Part => ({ functionResponse: { id: c.id, name: c.name, response: results[i] } })),
    });
  }

  if (!notes) {
    contents.push({ role: "user", parts: [{ text: "Stop researching now and write the research notes from what you have, in the required format." }] });
    const res = await withGeminiRetry(
      () =>
        client.models.generateContent({
          model: geminiModel(),
          contents,
          config: { ...config, toolConfig: { functionCallingConfig: { mode: "NONE" as never } } },
        }),
      emit,
    );
    requests++;
    notes = res.text ?? "";
  }
  if (!notes.trim()) throw new Error("Gemini did not return research notes.");
  return { notes, pages: [...new Map([...pages.values()].map((p) => [normalizeUrl(p.url), p])).values()], requests };
}

/** One structured-output call (no tools), with one repair round if validation fails. */
export async function geminiStructured<T extends z.ZodType>(
  client: GeminiLike,
  schema: T,
  system: string,
  prompt: string,
  emit: Emit,
): Promise<{ data: z.infer<T>; requests: number }> {
  const jsonSchema = toGeminiSchema(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }));
  const ask = (text: string) =>
    withGeminiRetry(
      () =>
        client.models.generateContent({
          model: geminiModel(),
          contents: [{ role: "user", parts: [{ text }] }],
          config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
        }),
      emit,
    );
  let requests = 0;
  let text = prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ask(text);
    requests++;
    const raw = res.text ?? "";
    let parsed: unknown;
    let problem: string;
    try {
      parsed = JSON.parse(raw);
      const r = schema.safeParse(parsed);
      if (r.success) return { data: r.data, requests };
      problem = z.prettifyError(r.error).slice(0, 3000);
    } catch {
      problem = "The response was not valid JSON.";
    }
    emit({ type: "activity", kind: "note", message: "Fixing fields that failed validation" });
    text = `${prompt}\n\nYour previous answer failed validation:\n${problem}\n\nPrevious answer:\n${raw.slice(0, 20000)}\n\nReturn the complete corrected JSON.`;
  }
  throw new Error("Gemini did not produce a valid guide.");
}

export function structurePrompt(query: string, notes: string, pages: PageRecord[]) {
  const fetched = pages.filter((p) => p.ok);
  return `App requested: ${query}

Pages actually fetched (use only these URLs as sources):
${fetched.map((p) => `- ${p.url}${p.title ? ` (${p.title})` : ""}`).join("\n") || "- none"}

Research notes:
${notes}`;
}

const Verdicts = z.object({
  verdicts: z.array(z.object({ id: z.string(), verdict: z.enum(["supported", "partial", "unsupported"]), note: z.string() })),
});

/** The server re-fetches cited pages; Gemini judges each claim against excerpts in one request. */
export async function geminiCheck(client: GeminiLike, claims: { id: string; text: string; urls: string[] }[], emit: Emit) {
  const urls = [...new Set(claims.flatMap((c) => c.urls))].slice(0, 8);
  const pages = await Promise.all(
    urls.map(async (u) => {
      emit({ type: "activity", kind: "fetch", message: u });
      return { u, p: await fetchPage(u, 80000) };
    }),
  );
  const excerpts = pages
    .map(({ u, p }) => {
      const about = claims.filter((c) => c.urls.includes(u)).map((c) => c.text);
      return `### ${u}\n${p.ok ? relevantExcerpt(p.text, about, 5000) : `(could not load: ${p.error ?? "unknown error"})`}`;
    })
    .join("\n\n");
  const list = claims.map((c) => `[${c.id}] ${c.text}\n  cites: ${c.urls.join(" , ")}`).join("\n");
  const { data } = await geminiStructured(client, Verdicts, GEMINI_CHECK_SYSTEM, `Claims:\n${list}\n\nPage excerpts:\n${excerpts}`, emit);
  return data.verdicts;
}
