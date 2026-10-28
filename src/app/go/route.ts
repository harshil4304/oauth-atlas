import { redirect } from "next/navigation";
import { findInLibrary } from "@/lib/library";
import { loadGuide, slugify } from "@/lib/store";

/** Search box target: library guide, then a previously generated guide, else live generation. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) redirect("/");
  const lib = findInLibrary(q);
  if (lib) redirect(`/apps/${lib.slug}`);
  const saved = await loadGuide(slugify(q));
  if (saved) redirect(`/apps/${saved.slug}`);
  redirect(`/generate?q=${encodeURIComponent(q)}`);
}
