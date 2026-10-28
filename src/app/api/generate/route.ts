import { generateGuide, type AgentEvent } from "@/lib/agent/generate";
import { findInLibrary } from "@/lib/library";
import { loadGuide, saveGuide, slugify, storageMode } from "@/lib/store";

export const maxDuration = 300;

type StreamEvent = AgentEvent | { type: "library"; slug: string; name: string } | { type: "cached"; slug: string; name: string } | { type: "saved"; slug: string; storage: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { query?: string; passcode?: string; force?: boolean };
  const query = (body.query ?? "").trim().slice(0, 200);
  if (!query) return Response.json({ error: "Enter an app name or website." }, { status: 400 });

  const required = process.env.GENERATE_PASSCODE;
  if (required && body.passcode !== required) {
    return Response.json({ error: "This deployment requires a passcode to generate new guides.", needsPasscode: true }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Live generation is not configured: set ANTHROPIC_API_KEY on the server." }, { status: 503 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        if (!body.force) {
          const lib = findInLibrary(query);
          if (lib) {
            send({ type: "library", slug: lib.slug, name: lib.name });
            return;
          }
          const cached = await loadGuide(slugify(query));
          if (cached) {
            send({ type: "cached", slug: cached.slug, name: cached.name });
            return;
          }
        }
        const guide = await generateGuide(query, send);
        if (guide) {
          send({ type: "stage", stage: "save", message: "Saving the guide and creating a share link" });
          let storage: string = storageMode();
          try {
            await saveGuide(guide);
          } catch {
            storage = "unsaved";
          }
          send({ type: "done", guide });
          send({ type: "saved", slug: guide.slug, storage });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send({ type: "error", message: message.length > 400 ? message.slice(0, 400) + "…" : message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
