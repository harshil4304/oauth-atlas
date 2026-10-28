/**
 * Fills in "Is there a Composio-managed OAuth app?" for every library guide using
 * Composio's API, and records it as tested evidence.
 *
 *   COMPOSIO_API_KEY=... npm run sync:composio
 *
 * Writes back to data/guides/*.json. Review the diff before committing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composioCheck } from "../src/lib/agent/generate";

const TOOLKITS: Record<string, string[]> = {
  github: ["github"],
  "google-gmail": ["gmail"],
  slack: ["slack"],
  "microsoft-outlook": ["outlook"],
  notion: ["notion"],
  "atlassian-jira": ["jira"],
  dropbox: ["dropbox"],
  hubspot: ["hubspot"],
  zoom: ["zoom"],
  salesforce: ["salesforce"],
  linkedin: ["linkedin"],
  "x-twitter": ["twitter", "x"],
};

async function main() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error("Set COMPOSIO_API_KEY first (Composio dashboard → Settings → API keys).");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const [slug, candidates] of Object.entries(TOOLKITS)) {
    const file = path.join(process.cwd(), "data/guides", `${slug}.json`);
    const g = JSON.parse(readFileSync(file, "utf8"));
    const result = await composioCheck(candidates);
    if (!result) {
      console.log(`${slug.padEnd(18)} not found via API, left unchanged`);
      continue;
    }
    g.composio = { ...result, note: `${result.note} Checked via Composio API on ${today}.` };
    writeFileSync(file, JSON.stringify(g, null, 2) + "\n");
    console.log(`${slug.padEnd(18)} managed: ${result.managed}`);
  }
}

main();
