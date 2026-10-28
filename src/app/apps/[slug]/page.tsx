import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { getLibraryGuide } from "@/lib/library";
import { scoreGuide, timeHeadline } from "@/lib/rubric";
import { loadGuide } from "@/lib/store";

async function find(slug: string) {
  return getLibraryGuide(slug) ?? (await loadGuide(slug));
}

// Generated guides appear (and get regenerated) after deploy, so render per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">): Promise<Metadata> {
  const g = await find((await params).slug);
  if (!g) return { title: "Guide not found" };
  return {
    title: `${g.name} OAuth app setup`,
    description: `${scoreGuide(g).label}. ${timeHeadline(g)}. ${g.summary}`,
  };
}

export default async function AppGuidePage({ params }: PageProps<"/apps/[slug]">) {
  const g = await find((await params).slug);
  if (!g) notFound();
  return <GuideView guide={g} />;
}
