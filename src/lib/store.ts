import { promises as fs } from "node:fs";
import path from "node:path";
import { Guide } from "./schema";

/**
 * Where generated guides live so their links can be shared.
 *  - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL/TOKEN are set: durable, works on Vercel.
 *  - Otherwise a local .data/ folder (or /tmp on serverless hosts, which is NOT durable).
 * Every guide page also offers a self-contained share link that needs no storage at all.
 */

const KEY = (slug: string) => `oauth-atlas:guide:${slug}`;
const INDEX = "oauth-atlas:index";

const upstash = () => {
  // Vercel's marketplace integration may use the KV_* names instead.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
};

async function redis(cmd: (string | number)[]) {
  const cfg = upstash()!;
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  return ((await r.json()) as { result: unknown }).result;
}

const dataDir = () => (process.env.VERCEL ? "/tmp/oauth-atlas" : path.join(process.cwd(), ".data"));

export function storageMode(): "upstash" | "local" | "ephemeral" {
  if (upstash()) return "upstash";
  return process.env.VERCEL ? "ephemeral" : "local";
}

export async function saveGuide(g: Guide): Promise<void> {
  const json = JSON.stringify(g);
  if (upstash()) {
    await redis(["SET", KEY(g.slug), json]);
    await redis(["ZADD", INDEX, Date.now(), g.slug]);
    return;
  }
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${g.slug}.json`), json);
}

export async function loadGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = upstash()
      ? ((await redis(["GET", KEY(slug)])) as string | null)
      : await fs.readFile(path.join(dataDir(), `${slug}.json`), "utf8");
    if (!raw) return null;
    const parsed = Guide.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listGenerated(limit = 24): Promise<Pick<Guide, "slug" | "name" | "summary" | "category" | "meta">[]> {
  try {
    let slugs: string[];
    if (upstash()) {
      slugs = ((await redis(["ZRANGE", INDEX, 0, limit - 1, "REV"])) as string[]) ?? [];
    } else {
      const dir = dataDir();
      const files = await fs.readdir(dir).catch(() => [] as string[]);
      const stats = await Promise.all(
        files.filter((f) => f.endsWith(".json")).map(async (f) => ({ f, t: (await fs.stat(path.join(dir, f))).mtimeMs })),
      );
      slugs = stats.sort((a, b) => b.t - a.t).slice(0, limit).map((s) => s.f.replace(/\.json$/, ""));
    }
    const guides = await Promise.all(slugs.map(loadGuide));
    return guides.filter((g): g is Guide => !!g);
  } catch {
    return [];
  }
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\.(com|io|dev|ai|app|co|net|org)(\/.*)?$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "app"
  );
}
