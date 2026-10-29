import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLibraryGuide } from "../library";
import { generateGuide, pickProvider, type AgentEvent } from "./generate";
import { withGeminiRetry, type GeminiLike } from "./gemini";
import { toGeminiSchema } from "./gemini-schema";
import { htmlToText, parseDuckDuckGo, relevantExcerpt } from "./web";

const OAUTH_DOC = "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app";

function fakeGemini(turns: ((p: GenerateContentParameters) => Partial<GenerateContentResponse>)[]) {
  const calls: GenerateContentParameters[] = [];
  const gemini: GeminiLike = {
    models: {
      async generateContent(p) {
        calls.push(structuredClone(p));
        const next = turns.shift();
        if (!next) throw new Error("unexpected extra Gemini call");
        return next(p) as GenerateContentResponse;
      },
    },
  };
  return { gemini, calls };
}

const draft = () => {
  const g = structuredClone(getLibraryGuide("github")!) as Record<string, unknown>;
  delete g.slug;
  delete g.probes;
  delete g.meta;
  return g;
};

/** Simulated internet: one readable docs page, a search engine, and OAuth endpoints for probes. */
function fakeWeb() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://html.duckduckgo.com")) {
      return new Response(
        `<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(OAUTH_DOC)}&rut=x">Creating an OAuth app</a><a class="result__snippet">Register a new application</a></div>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    if (url === OAUTH_DOC) {
      const body = `<html><head><title>Creating an OAuth app</title></head><body><nav>menu</nav><main><h1>Creating an OAuth app</h1><p>${"You can add up to 10 callback URLs. A user or organization can own up to 100 OAuth apps. ".repeat(12)}</p><a href="/en/apps/oauth-apps/scopes">Scopes for OAuth apps</a></main></body></html>`;
      return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (init?.method === "POST") return new Response('{"error":"invalid_grant"}', { status: 400 });
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Gemini research pipeline", () => {
  it("runs the tool loop on our own fetches, structures the guide and fact-checks it", async () => {
    fakeWeb();
    const { gemini, calls } = fakeGemini([
      () => ({
        functionCalls: [
          { id: "a", name: "search_web", args: { query: "GitHub OAuth app" } },
          { id: "b", name: "fetch_page", args: { url: OAUTH_DOC } },
        ],
        candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "a", name: "search_web", args: { query: "GitHub OAuth app" } } }] } }],
      }),
      () => ({ text: `Portal: Settings > Developer settings [${OAUTH_DOC}]`, functionCalls: undefined }),
      () => ({ text: JSON.stringify({ status: "guide", guide: draft() }) }),
      () => ({ text: JSON.stringify({ verdicts: [{ id: "factor.appReview", verdict: "unsupported", note: "not on page" }] }) }),
    ]);
    const events: AgentEvent[] = [];
    const guide = (await generateGuide("GitHub", (e) => events.push(e), { gemini }))!;

    // Tool results really came from our server's fetch, including page text and links.
    const toolTurn = JSON.stringify(calls[1].contents);
    expect(toolTurn).toContain("up to 10 callback URLs");
    expect(toolTurn).toContain("Scopes for OAuth apps");
    expect(toolTurn).toContain(OAUTH_DOC); // search result decoded from DuckDuckGo redirect
    // Structuring call uses JSON mode and lists only pages actually fetched.
    expect(calls[2].config?.responseMimeType).toBe("application/json");
    expect(JSON.stringify(calls[2].contents)).toContain(OAUTH_DOC);

    // adminApproval cited only a page the agent never opened, so it is downgraded.
    expect(guide.factors.adminApproval.evidence).toBe("uncertain");
    expect(guide.uncertainties.some((u) => u.includes("never actually opened"))).toBe(true);
    // Checker verdict applied.
    expect(guide.factors.appReview.value).toBe("unknown");
    expect(guide.meta.model).toMatch(/^gemini-/);
    expect(events.some((e) => e.type === "activity" && e.kind === "fetch" && e.message === OAUTH_DOC)).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it("stops researching at the turn cap and asks for notes without tools", async () => {
    fakeWeb();
    const loop = () => ({ functionCalls: [{ id: "x", name: "search_web", args: { query: "more" } }], candidates: [] });
    const { gemini, calls } = fakeGemini([
      ...Array.from({ length: 7 }, () => loop),
      () => ({ text: "Not OAuth? The app only offers API keys. [no source]" }),
      () => ({ text: JSON.stringify({ status: "not_oauth", notOauth: { reason: "Only API keys.", authMethods: ["API key"] } }) }),
    ]);
    const events: AgentEvent[] = [];
    expect(await generateGuide("KeyOnlyApp", (e) => events.push(e), { gemini })).toBeNull();
    expect(calls[7].config?.toolConfig?.functionCallingConfig?.mode).toBe("NONE");
    expect(events.some((e) => e.type === "not_oauth")).toBe(true);
  });

  it("repairs invalid structured output once", async () => {
    fakeWeb();
    const bad = { ...draft(), steps: [] };
    const { gemini, calls } = fakeGemini([
      () => ({ text: "notes [no source]" }),
      () => ({ text: JSON.stringify({ status: "guide", guide: bad }) }),
      (p) => {
        expect(JSON.stringify(p.contents)).toContain("failed validation");
        return { text: JSON.stringify({ status: "guide", guide: draft() }) };
      },
    ]);
    const guide = (await generateGuide("GitHub", () => {}, { gemini }))!;
    expect(guide.steps.length).toBeGreaterThan(0);
    // No page was fetched, so every sourced claim is downgraded and nothing is left to fact-check:
    // the checker request is skipped (3 Gemini calls, not 4), saving free-tier quota.
    expect(Object.values(guide.factors).every((f) => f.evidence === "uncertain")).toBe(true);
    expect(calls).toHaveLength(3);
  });
});

describe("withGeminiRetry", () => {
  const emit = () => {};
  it("explains an exhausted daily free quota", async () => {
    const err = Object.assign(new Error("RESOURCE_EXHAUSTED: Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier"), { status: 429 });
    await expect(withGeminiRetry(() => Promise.reject(err), emit)).rejects.toThrow(/daily quota/);
  });
  it("waits out a short per-minute limit and retries", async () => {
    const err = Object.assign(new Error('Quota exceeded. "retryDelay": "0.01s"'), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("ok");
    await expect(withGeminiRetry(fn, emit)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("explains a bad key", async () => {
    const err = Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 400 });
    await expect(withGeminiRetry(() => Promise.reject(err), emit)).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

describe("helpers", () => {
  it("converts zod JSON Schema into Gemini's subset", () => {
    const out = toGeminiSchema({
      $schema: "x",
      type: "object",
      properties: {
        site: { type: "string", format: "uri" },
        tags: { type: "array", items: { type: "string" }, default: [] },
        wait: { anyOf: [{ type: "object", properties: { n: { type: "number" } }, required: ["n"] }, { type: "null" }], description: "d" },
      },
    }) as { $schema?: unknown; properties: Record<string, Record<string, unknown>> };
    expect(out.$schema).toBeUndefined();
    expect(out.properties.site.format).toBeUndefined();
    expect(out.properties.tags.default).toBeUndefined();
    expect(out.properties.wait).toMatchObject({ type: ["object", "null"], description: "d", required: ["n"] });
    expect(out.properties.wait.anyOf).toBeUndefined();
  });

  it("extracts readable text and search results", () => {
    const { title, text } = htmlToText("<title>T &amp; C</title><script>x()</script><main><h2>Review</h2><p>Takes 10&nbsp;days</p></main>");
    expect(title).toBe("T & C");
    expect(text).toContain("## Review");
    expect(text).toContain("Takes 10 days");
    expect(text).not.toContain("x()");
    expect(parseDuckDuckGo('<div class="result__body"><a class="result__a" href="https://a.example/x">A</a><a class="result__snippet">s</a></div>')).toEqual([
      { title: "A", url: "https://a.example/x", snippet: "s" },
    ]);
  });

  it("keeps the most relevant paragraphs within budget", () => {
    const text = ["intro filler ".repeat(40), "verification review takes weeks", "unrelated footer ".repeat(40)].join("\n\n");
    const out = relevantExcerpt(text, ["review verification weeks"], 200);
    expect(out).toContain("verification review takes weeks");
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("picks the provider from env", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    expect(pickProvider()).toBe("anthropic");
    vi.stubEnv("GEMINI_API_KEY", "g");
    expect(pickProvider()).toBe("gemini");
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    expect(pickProvider()).toBe("anthropic");
  });
});
