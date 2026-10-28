import { describe, expect, it } from "vitest";
import { compareGuides, factorAgreement, rangesOverlap } from "./evaluate";
import { getLibraryGuide } from "./library";

describe("evaluate", () => {
  it("a guide agrees fully with itself", () => {
    const g = getLibraryGuide("google-gmail")!;
    const r = compareGuides(g, g);
    expect(r.factorMatches).toBe(7);
    expect(r.factorConflicts).toEqual([]);
    expect(r.difficultyOverlap).toBe(true);
    expect(r.waitOverlap).toBe(true);
  });

  it("flags yes/no conflicts but treats hedges softly", () => {
    const ref = getLibraryGuide("google-gmail")!;
    const got = structuredClone(ref);
    got.factors.appReview.value = "no";
    got.factors.securityAssessment.value = "unknown";
    expect(factorAgreement(ref, got, "appReview")).toBe("conflict");
    expect(factorAgreement(ref, got, "securityAssessment")).toBe("hedged");
    expect(compareGuides(ref, got).reviewAgrees).toBe(false);
  });

  it("compares wait ranges across units with slack", () => {
    expect(rangesOverlap({ min: 1, max: 6, unit: "weeks" }, { min: 10, max: 20, unit: "days" })).toBe(true);
    expect(rangesOverlap({ min: 1, max: 2, unit: "hours" }, { min: 2, max: 4, unit: "weeks" })).toBe(false);
    expect(rangesOverlap(null, null)).toBe(true);
    expect(rangesOverlap(null, { min: 1, max: 2, unit: "days" })).toBe(false);
  });
});
