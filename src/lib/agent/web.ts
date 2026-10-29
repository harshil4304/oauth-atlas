/**
 * Server-side web access for agents that don't have built-in search/fetch (e.g. a free
 * Gemini key, where Google Search grounding isn't included). Because we fetch pages
 * ourselves, we know exactly which URLs were really read, and the guide can say so.
 */

const UA = "Mozilla/5.0 (compatible; OAuthAtlas/1.0; +https://github.com/harshil4304/oauth-atlas)";
const TIMEOUT_MS = 12000;
const MAX_BYTES = 2_000_000;

export interface FetchedPage {
  ok: boolean;
  url: string;
  status: number;
  title: string;
  text: string;
  links: { text: string; url: string }[];
  error?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Readable text from HTML: drops scripts, styles, nav chrome; keeps headings and list structure. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${"#".repeat(Number(n))} `)
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/table)[^>]*>/gi, "\n")
      .replace(/<td[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export function extractLinks(html: string, base: string, limit = 40): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = [];
  const seen = new Set<string>();
  const baseHost = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "";
    }
  })();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      url = new URL(decodeEntities(m[1]), base).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(url) || seen.has(url)) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text) continue;
    seen.add(url);
    out.push({ text, url });
  }
  // Prefer links that look relevant to OAuth setup and review, then same-site links.
  const rel = /oauth|auth|app|develop|api|review|verif|publish|market|partner|scope|distribut|pricing|changelog|limit/i;
  const score = (l: { text: string; url: string }) => (rel.test(l.text) || rel.test(l.url) ? 2 : 0) + (new URL(l.url).host === baseHost ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export async function fetchPage(rawUrl: string, maxChars = 12000): Promise<FetchedPage> {
  let url: string;
  try {
    url = new URL(rawUrl.trim()).toString();
    if (!/^https?:/.test(url)) throw new Error("not http");
  } catch {
    return { ok: false, url: rawUrl, status: 0, title: "", text: "", links: [], error: "Invalid URL" };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.5" },
    });
    const finalUrl = r.url || url;
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok) return { ok: false, url: finalUrl, status: r.status, title: "", text: "", links: [], error: `HTTP ${r.status}` };
    if (!/text|json|xml|markdown/i.test(type)) {
      return { ok: false, url: finalUrl, status: r.status, title: "", text: "", links: [], error: `Unsupported content type ${type || "unknown"}` };
    }
    const raw = (await r.text()).slice(0, MAX_BYTES);
    if (/html/i.test(type) || /^\s*<!doctype html|^\s*<html/i.test(raw)) {
      const { title, text } = htmlToText(raw);
      const links = extractLinks(raw, finalUrl);
      const thin = text.length < 400;
      return {
        ok: !thin || links.length > 0,
        url: finalUrl,
        status: r.status,
        title,
        text: text.slice(0, maxChars),
        links,
        error: thin ? "Very little readable text (the page may need JavaScript). Try a docs or .md version of the page." : undefined,
      };
    }
    return { ok: true, url: finalUrl, status: r.status, title: "", text: raw.slice(0, maxChars), links: [] };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : String(e);
    return { ok: false, url, status: 0, title: "", text: "", links: [], error: msg };
  } finally {
    clearTimeout(t);
  }
}

/** Parses DuckDuckGo's no-JavaScript results page. */
export function parseDuckDuckGo(html: string, limit = 8): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/class="result(?:__body| results_links)/).slice(1);
  for (const b of blocks) {
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = decodeEntities(a[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const snippet = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    results.push({
      title: decodeEntities(a[2].replace(/<[^>]+>/g, "")).trim(),
      url,
      snippet: decodeEntities(snippet.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
    });
    if (results.length >= limit) break;
  }
  return results;
}

/** Best-effort keyless web search. Callers must cope with an empty result (search engines may block servers). */
export async function searchWeb(query: string): Promise<{ results: SearchResult[]; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q: query }),
    });
    if (!r.ok) return { results: [], error: `Search returned HTTP ${r.status}` };
    const results = parseDuckDuckGo(await r.text());
    return results.length ? { results } : { results, error: "No results (the search engine may be rate-limiting this server)" };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Keep the paragraphs most relevant to some claims, within a size budget. */
export function relevantExcerpt(text: string, about: string[], maxChars = 6000): string {
  if (text.length <= maxChars) return text;
  const words = new Set(
    about
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
  const paras = text.split(/\n{2,}/).map((p, i) => {
    const toks = p.toLowerCase().split(/[^a-z0-9]+/);
    return { i, p, s: toks.filter((w) => words.has(w)).length / Math.sqrt(toks.length + 1) };
  });
  const keep = new Set<number>();
  let size = 0;
  for (const x of [...paras].sort((a, b) => b.s - a.s)) {
    if (size + x.p.length > maxChars) continue;
    keep.add(x.i);
    size += x.p.length;
  }
  return paras
    .filter((x) => keep.has(x.i))
    .map((x) => x.p)
    .join("\n\n");
}

export const normalizeUrl = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = "";
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
