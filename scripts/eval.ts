/**
 * Runs the live research agent on apps we verified by hand and compares field by field,
 * then on a few apps outside the library for manual spot checks.
 *
 *   npm run eval                  # default set (reads keys from .env.local)
 *   npm run eval -- github slack  # chosen library apps only
 *
 * With a free Gemini key the default set is smaller and runs are spaced out, because
 * free-tier quotas are per minute and per day (each guide uses roughly 5–10 requests).
 *
 * Writes docs/evaluation-results.md and docs/evaluation-results.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateGuide, pickProvider, providerModel } from "../src/lib/agent/generate";
import { compareGuides, type EvalRow } from "../src/lib/evaluate";
import { getLibraryGuide } from "../src/lib/library";
import { scoreGuide, timeHeadline } from "../src/lib/rubric";
import type { Guide } from "../src/lib/schema";

const provider = pickProvider();
const FREE_GEMINI = provider === "gemini";
const DEFAULT_KNOWN = FREE_GEMINI ? ["github", "slack", "google-gmail"] : ["github", "google-gmail", "slack", "hubspot", "zoom", "x-twitter"];
const UNSEEN = FREE_GEMINI ? ["Calendly"] : ["Calendly", "Linear", "Airtable"];
const PAUSE_MS = FREE_GEMINI ? 60_000 : 0;
const pause = () => (PAUSE_MS ? (console.log(`  (pausing ${PAUSE_MS / 1000}s for the free-tier per-minute limit)`), new Promise((r) => setTimeout(r, PAUSE_MS))) : Promise.resolve());

async function run(query: string): Promise<{ guide: Guide | null; ms: number; activity: number }> {
  const t = Date.now();
  let activity = 0;
  const guide = await generateGuide(query, (e) => {
    if (e.type === "activity") activity++;
    if (e.type === "stage") console.log(`  · ${e.message}`);
  });
  return { guide, ms: Date.now() - t, activity };
}

async function main() {
  if (!provider) {
    console.error("Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to .env.local first.");
    process.exit(1);
  }
  console.log(`Using ${provider} (${providerModel(provider)})`);
  const args = process.argv.slice(2);
  const known = args.length ? args : DEFAULT_KNOWN;
  const rows: (EvalRow & { seconds: number })[] = [];
  const unseen: { query: string; label: string; time: string; checker: string; uncertainties: number; seconds: number }[] = [];
  const failures: string[] = [];

  for (const slug of known) {
    const ref = getLibraryGuide(slug);
    if (!ref) {
      failures.push(`${slug}: not in library`);
      continue;
    }
    if (rows.length || failures.length) await pause();
    console.log(`\n▶ ${ref.name} (library comparison)`);
    try {
      const { guide, ms } = await run(ref.name);
      if (!guide) {
        failures.push(`${slug}: agent reported no OAuth`);
        continue;
      }
      rows.push({ ...compareGuides(ref, guide), seconds: Math.round(ms / 1000) });
    } catch (e) {
      failures.push(`${slug}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!args.length) {
    for (const q of UNSEEN) {
      await pause();
      console.log(`\n▶ ${q} (unseen)`);
      try {
        const { guide, ms } = await run(q);
        if (!guide) {
          unseen.push({ query: q, label: "no OAuth reported", time: "", checker: "", uncertainties: 0, seconds: Math.round(ms / 1000) });
          continue;
        }
        const c = guide.meta.checker;
        unseen.push({
          query: q,
          label: scoreGuide(guide).label,
          time: timeHeadline(guide),
          checker: c ? `${c.supported}/${c.checked} confirmed, ${c.downgraded} downgraded` : "n/a",
          uncertainties: guide.uncertainties.length,
          seconds: Math.round(ms / 1000),
        });
        mkdirSync("docs/eval-guides", { recursive: true });
        writeFileSync(`docs/eval-guides/${guide.slug}.json`, JSON.stringify(guide, null, 2));
      } catch (e) {
        failures.push(`${q}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
  const L: string[] = [];
  L.push(`# Agent evaluation results`, "", `Run on ${new Date().toISOString().slice(0, 10)} with ${provider} model ${providerModel(provider)}.`, "");
  L.push(`## Against hand-verified library guides`, "");
  L.push(`| App | Library | Agent | Difficulty overlaps | Factors match / hedged / conflict | Wait overlaps | Claims cited | Checker | Live checks | Time |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    L.push(
      `| ${r.slug} | ${r.difficultyRef} | ${r.difficultyGot} | ${r.difficultyOverlap ? "yes" : "**no**"} | ${r.factorMatches} / ${r.factorHedged} / ${r.factorConflicts.length ? `**${r.factorConflicts.join(", ")}**` : 0} | ${r.waitOverlap ? "yes" : "**no**"} | ${Math.round(r.citedShare * 100)}% | ${r.checker ? `${r.checker.supported}/${r.checker.checked}, ${r.checker.downgraded} down` : "n/a"} | ${r.probesPassed} | ${r.seconds}s |`,
    );
  }
  const n = rows.length;
  L.push("", `Summary: difficulty overlapped in ${pct(rows.filter((r) => r.difficultyOverlap).length, n)} of apps; ${rows.reduce((a, r) => a + r.factorConflicts.length, 0)} yes/no factor conflicts across ${n * 7} factors; wait ranges overlapped in ${pct(rows.filter((r) => r.waitOverlap).length, n)}.`);
  if (unseen.length) {
    L.push("", `## Apps outside the library (spot-check by hand)`, "", `| App | Difficulty | Time | Checker | Open questions | Time taken |`, `|---|---|---|---|---|---|`);
    unseen.forEach((u) => L.push(`| ${u.query} | ${u.label} | ${u.time} | ${u.checker} | ${u.uncertainties} | ${u.seconds}s |`));
    L.push("", "Full generated guides are in docs/eval-guides/.");
  }
  if (failures.length) L.push("", `## Failures`, "", ...failures.map((f) => `- ${f}`));
  writeFileSync("docs/evaluation-results.md", L.join("\n") + "\n");
  writeFileSync("docs/evaluation-results.json", JSON.stringify({ rows, unseen, failures }, null, 2));
  console.log("\n" + L.join("\n"));
}

main();
