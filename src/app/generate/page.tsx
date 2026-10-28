import type { Metadata } from "next";
import { Generator } from "./Generator";

export const metadata: Metadata = { title: "Generate a guide" };

export default async function GeneratePage({ searchParams }: PageProps<"/generate">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  return <Generator initialQuery={q} />;
}
