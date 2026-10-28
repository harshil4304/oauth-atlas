# OAuth Atlas

Look up an app and find out what it takes to register an OAuth app with that provider and get it approved, so your AI agent's users can connect it. Each guide covers:
- The difficulty.
- Your hands-on time and the approval wait.
- What can block you.
- Which steps an agent can do for you.
- How sure we are about every claim.

For apps outside the library, a research agent reads the provider's docs and writes a guide live.

## The problem, as I understood it

An agent platform like Composio connects users to apps through OAuth. Three layers matter:

1. **Provider OAuth app.** Registered once by the developer, or by Composio when the toolkit is "managed". It holds the client ID, secret, redirect URI and scopes. The provider may review it.
2. **Auth config / integration.** The developer's configuration that points at that OAuth app.
3. **User connections.** Each end user authorizes the app and gets their own tokens.

Layer 1 is where developers get stuck. Registering takes minutes, but going live for users outside your own company can mean:
- Brand and scope verification plus a paid security assessment (Google restricted scopes).
- A partner program and a verified business (Microsoft, LinkedIn).
- Install caps until you're listed (HubSpot, Dropbox).
- Throttling until you're listed (Slack).
- An admin in every customer org installing your app (Salesforce).
- Paying per request (X).

None of this is visible until you're deep in the provider's console. The questions developers need answered early are "an hour or a quarter?", "what will block me?" and "what do I do first?".

## Product decisions

- **One guide format for the library and the agent.** Both produce the same schema (`src/lib/schema.ts`). Live-generated guides are as usable and comparable as hand-written ones, and the evaluation can compare them field by field.
- **Difficulty comes from facts, not vibes.** Each guide answers seven yes/no/sometimes/unknown questions: policy and domain checks, user cap, business verification, admin approval, app review, paid or partner access, and security assessment. Fixed weights turn those into Easy, Medium or Hard (`src/lib/rubric.ts`). Unknowns widen the range ("Medium to Hard") instead of being hidden.
- **Scored for one stated scenario.** Every guide says which use case it rates, for example "reads email for users outside your company". The answer for Gmail send-only is very different from Gmail read, and a single label without a scenario would mislead.
- **Time is split into your work and the wait.** These are what developers plan around. The log-scale timeline bar is the main visual, so "30 minutes" and "6 weeks" sit on one line and the library reads as a comparison.
- **Evidence on every claim.** Labels are Tested, Official docs, Community and Unconfirmed, each linked to sources. Uncited claims are forced to Unconfirmed in code, and the agent can never label its own claims as Tested.
- **The agent checks itself.** After the research pass:
  1. Live probes hit the provider's endpoints.
  2. A separate fact-check pass re-opens every cited page.
  3. Any factor it can't confirm becomes Unknown, which visibly widens the difficulty range.
- **Agent vs. you.** Every step is tagged as "Agent can do", "Agent drafts, you submit" or "You do". The guide's opening box says how many of each there are.
- **Shareable without infrastructure.** Every guide has:
  - A normal link (`/apps/<slug>`).
  - A self-contained link with the whole guide compressed into the URL fragment, so it works even on a deployment with no database.
  - Markdown copy and download, and print to PDF.

**Scope I chose:** 12 library apps that span every difficulty pattern I found, not the most popular 12:
- GitHub, Notion and Atlassian are self-serve.
- Dropbox and HubSpot have caps.
- Slack has rate limits.
- Salesforce needs admin installs.
- X is paid.
- Microsoft needs a partner account.
- Google needs a security assessment.
- LinkedIn and Zoom need partner or beta approval.

Plus live generation for anything else, a compare view, and a "How we rate" page.

## What I tested, what sources support, what's uncertain

See [`docs/verification.md`](docs/verification.md). Highlights:

- **Claims checked:** about 20 key claims checked against provider pages, plus what research corrected. HubSpot's 25-install cap, Salesforce's Sept 2025 install requirement, X's move to pay-per-use and Zoom's private-app limit all contradicted my starting assumptions.
- **Live checks:** the build sandbox intercepts github.com, so no probe results from it were trusted. Probes run from the deployed app instead, and a too-lenient token check was found and fixed.
- **Not verified:**
  - Composio-managed status: needs an API key; `npm run sync:composio` fills it in.
  - Some scope names and some review timings: marked Unconfirmed in the guides.
  - No real approvals were submitted.

Agent quality is measured with `npm run eval`. It generates guides for hand-verified apps and scores agreement on difficulty, each factor, wait time, citation coverage and checker results, then generates three apps outside the library for spot checks. Results go to `docs/evaluation-results.md`. That run needs an API key, so it isn't included unless you run it.

## Run it locally

Requires Node 20.6+ (Node 22 LTS recommended).

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live generation
npm run dev                  # http://localhost:3000
npm test                     # schema, rubric, probes, agent pipeline (simulated model), evaluation logic
```

The library, compare, method and share pages work without any key. Only live generation needs `ANTHROPIC_API_KEY`.

### Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Live generation | Server-side only; never sent to the browser |
| `OAUTH_ATLAS_MODEL` | Optional | Defaults to `claude-sonnet-5-5` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | Durable share links for generated guides on Vercel | Without them, guides are saved to `.data/` locally or temporary storage on Vercel; the self-contained link always works |
| `COMPOSIO_API_KEY` | Optional | Fills in Composio-managed status for generated guides and for `npm run sync:composio` |
| `GENERATE_PASSCODE` | Optional | Requires a passcode before spending API credits on new guides |

### Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it in Vercel. No build settings to change.
3. Add `ANTHROPIC_API_KEY`, and preferably an Upstash Redis integration from the Vercel Marketplace, which sets the two Upstash variables.
4. Generation runs in a streaming route with `maxDuration = 300`; a typical guide takes one to three minutes.

## How it's built

- **Next.js 16 App Router, TypeScript, Tailwind v4, Zod.**
- **Library guides:** `data/guides/*.json`, validated at build time.
- **Live agent:** `src/lib/agent/generate.ts`.
  - Research pass: Claude with server-side `web_search` and `web_fetch`, ending in a `submit_guide` tool call whose input schema is generated from the Zod schema. Invalid output gets up to two repair rounds.
  - Credential-free live probes (`src/lib/probes.ts`).
  - Fact-check pass: re-fetches cited pages and returns per-claim verdicts.
  - Deterministic scoring.
- **Streaming:** `POST /api/generate` streams NDJSON progress events (searches, pages read, probe results) to the generate page.
- **Storage:** `src/lib/store.ts` (Upstash REST or local files).

## Limitations

- **Guides go stale.** Four of twelve providers changed meaningfully in the last 18 months. Each guide shows its check date, and the live checks only prove endpoints and pages still exist, not that policies are unchanged.
- **Wait times are partly anecdotal.** Where providers don't publish numbers, ranges come from developer reports or are labelled unconfirmed estimates.
- **Generated guides depend on public docs.** Providers that hide their review process behind a partner login will produce guides with many Unknowns. That is shown as a wide difficulty range rather than a confident guess.
- **No real approvals were submitted**, and no provider consoles were driven while building this.
- **No user accounts.** Checklist progress is stored per browser.
