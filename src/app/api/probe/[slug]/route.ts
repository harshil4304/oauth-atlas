import { getLibraryGuide } from "@/lib/library";
import { runProbes } from "@/lib/probes";
import { loadGuide } from "@/lib/store";

export const maxDuration = 60;

/** Re-run the credential-free live checks for a guide on demand. */
export async function GET(_req: Request, ctx: RouteContext<"/api/probe/[slug]">) {
  const { slug } = await ctx.params;
  const guide = getLibraryGuide(slug) ?? (await loadGuide(slug));
  if (!guide) return Response.json({ error: "Guide not found" }, { status: 404 });
  const probes = await runProbes(guide);
  return Response.json({ slug, probes, ranAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
