import { describe, expect, it } from "vitest";
import { findInLibrary, LIBRARY } from "./library";
import { scoreGuide, levelFor, timeHeadline } from "./rubric";
import { danglingSourceIds } from "./schema";

describe("library guides", () => {
  it("has at least 12 valid guides with unique slugs", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(12);
    expect(new Set(LIBRARY.map((g) => g.slug)).size).toBe(LIBRARY.length);
  });

  it.each(LIBRARY.map((g) => [g.slug, g] as const))("%s cites only sources it lists", (_slug, g) => {
    expect(danglingSourceIds(g)).toEqual([]);
  });

  it.each(LIBRARY.map((g) => [g.slug, g] as const))("%s marks uncited claims as uncertain", (_slug, g) => {
    const cited = [...g.steps, ...g.scopes, ...g.blockers, ...g.nuances, ...g.prerequisites, ...Object.values(g.factors)];
    for (const c of cited) {
      if (c.sourceIds.length === 0) expect(c.evidence).toBe("uncertain");
    }
  });

  it("spans every difficulty level", () => {
    const levels = new Set(LIBRARY.flatMap((g) => [scoreGuide(g).low, scoreGuide(g).high]));
    expect(levels).toEqual(new Set(["Easy", "Medium", "Hard"]));
  });

  it("scores known extremes sensibly", () => {
    const byslug = Object.fromEntries(LIBRARY.map((g) => [g.slug, scoreGuide(g)]));
    expect(byslug["github"].label).toBe("Easy");
    expect(byslug["google-gmail"].high).toBe("Hard");
  });
});

describe("rubric", () => {
  it("buckets scores", () => {
    expect(levelFor(0)).toBe("Easy");
    expect(levelFor(2)).toBe("Easy");
    expect(levelFor(3)).toBe("Medium");
    expect(levelFor(6)).toBe("Hard");
  });

  it("counts depends/unknown only toward the upper bound", () => {
    const g = LIBRARY.find((x) => x.slug === "slack")!;
    const d = scoreGuide(g);
    expect(d.min).toBeLessThan(d.max);
  });

  it("formats time", () => {
    expect(timeHeadline(LIBRARY.find((x) => x.slug === "github")!)).toMatch(/no approval wait/);
  });
});

describe("findInLibrary", () => {
  it.each([
    ["gmail", "google-gmail"],
    ["Slack", "slack"],
    ["https://www.hubspot.com", "hubspot"],
    ["jira", "atlassian-jira"],
    ["github.com", "github"],
    ["x.com", "x-twitter"],
  ])("%s → %s", (q, slug) => {
    expect(findInLibrary(q)?.slug).toBe(slug);
  });

  it("returns nothing for unknown apps", () => {
    expect(findInLibrary("Calendly")).toBeUndefined();
  });
});
