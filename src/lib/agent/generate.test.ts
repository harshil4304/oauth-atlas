import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLibraryGuide } from "../library";
import { scoreGuide } from "../rubric";
import { generateGuide, type AgentEvent } from "./generate";

/** A stand-in for the Anthropic client that replays scripted assistant turns. */
function fakeClient(turns: ((params: Anthropic.MessageCreateParams) => Anthropic.ContentBlock[])[]) {
  const calls: Anthropic.MessageCreateParams[] = [];
  return {
    calls,
    client: {
      messages: {
        stream(params: Anthropic.MessageCreateParams) {
          calls.push(params);
          const content = turns.shift()!(params);
          const handlers: ((b: Anthropic.ContentBlock) => void)[] = [];
          return {
            on(_evt: string, cb: (b: Anthropic.ContentBlock) => void) {
              handlers.push(cb);
              return this;
            },
            async finalMessage() {
              content.forEach((b) => handlers.forEach((h) => h(b)));
              const stop = content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
              return { id: "m", type: "message", role: "assistant", model: "fake", content, stop_reason: stop } as unknown as Anthropic.Message;
            },
          };
        },
      },
    } as unknown as Anthropic,
  };
}

const draftFromLibrary = () => {
  const g = structuredClone(getLibraryGuide("github")!) as Partial<ReturnType<typeof getLibraryGuide> & object>;
  delete g.slug;
  delete g.probes;
  delete g.meta;
  return g as Omit<NonNullable<ReturnType<typeof getLibraryGuide>>, "slug" | "probes" | "meta">;
};

const search = { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "github oauth app" } } as unknown as Anthropic.ContentBlock;
const toolUse = (name: string, input: unknown, id = "t1") => ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;

afterEach(() => vi.restoreAllMocks());

describe("generateGuide pipeline", () => {
  it("researches, probes, applies checker downgrades and returns a valid scored guide", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    const draft = draftFromLibrary();
    // Pretend the drafter claimed "no app review" but the checker can't confirm it.
    const { client, calls } = fakeClient([
      () => [search, toolUse("submit_guide", draft)],
      () => [toolUse("submit_verdicts", { verdicts: [{ id: "factor.appReview", verdict: "unsupported", note: "page does not mention review" }, { id: "time", verdict: "supported" }] })],
    ]);
    const events: AgentEvent[] = [];
    const guide = await generateGuide("GitHub", (e) => events.push(e), { client });

    expect(guide).not.toBeNull();
    expect(guide!.meta.origin).toBe("agent");
    expect(guide!.factors.appReview.value).toBe("unknown");
    expect(guide!.factors.appReview.evidence).toBe("uncertain");
    expect(guide!.meta.checker).toMatchObject({ downgraded: 1, supported: 1 });
    expect(guide!.uncertainties.some((u) => u.includes("appReview"))).toBe(true);
    expect(scoreGuide(guide!).max).toBeGreaterThan(scoreGuide(getLibraryGuide("github")!).max);
    expect(guide!.probes.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "activity" && e.kind === "search")).toBe(true);
    expect(events.filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage)).toEqual(["research", "probe", "check", "score"]);
    expect(calls).toHaveLength(2);
  });

  it("asks the model to repair a guide that fails validation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const bad = { ...draftFromLibrary(), steps: [] };
    const { client, calls } = fakeClient([
      () => [toolUse("submit_guide", bad, "a")],
      (p) => {
        const last = p.messages[p.messages.length - 1];
        expect(JSON.stringify(last.content)).toContain("failed validation");
        return [toolUse("submit_guide", draftFromLibrary(), "b")];
      },
      () => [toolUse("submit_verdicts", { verdicts: [] })],
    ]);
    const guide = await generateGuide("GitHub", () => {}, { client });
    expect(guide?.steps.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(3);
  });

  it("reports apps without OAuth instead of inventing a guide", async () => {
    const { client } = fakeClient([() => [toolUse("report_not_oauth", { reason: "Only API keys are offered.", authMethods: ["API key"] })]]);
    const events: AgentEvent[] = [];
    expect(await generateGuide("SomeApp", (e) => events.push(e), { client })).toBeNull();
    expect(events.some((e) => e.type === "not_oauth")).toBe(true);
  });

  it("downgrades uncited claims to uncertain and strips 'tested' from model output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const d = draftFromLibrary();
    d.steps[0].evidence = "tested";
    d.nuances[0].sourceIds = ["does-not-exist"];
    const { client } = fakeClient([() => [toolUse("submit_guide", d)], () => [toolUse("submit_verdicts", { verdicts: [] })]]);
    const guide = (await generateGuide("GitHub", () => {}, { client }))!;
    expect(guide.steps[0].evidence).not.toBe("tested");
    expect(guide.nuances[0].evidence).toBe("uncertain");
    expect(guide.nuances[0].sourceIds).toEqual([]);
  });
});
