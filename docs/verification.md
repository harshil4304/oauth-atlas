# Verification log

What was checked for the library guides, what the research changed, and what is still unconfirmed. All sources were read on 2026-10-28.

## How the library was built

1. For each app, I read the provider's own pages on OAuth app registration, scopes, review/verification, distribution limits and API pricing (links are in each guide's Sources).
2. Every claim got an evidence label: **official** (on a provider page I read), **community** (forum or integration-vendor guide), or **unconfirmed** (anything else). A test (`src/lib/library.test.ts`) fails the build if any claim without a source is labelled anything other than unconfirmed, or cites a source the guide doesn't list.
3. Each app is scored for one stated scenario with the shared rubric (`src/lib/rubric.ts`), the same code that scores agent-generated guides.

## Claims checked against sources (sample)

| App | Claim | Source | Result |
|---|---|---|---|
| Google | Testing mode is capped at 100 test users; unverified published apps with sensitive/restricted scopes are capped at 100 users | Google production readiness overview | Confirmed |
| Google | Refresh tokens expire after 7 days in Testing | Same | Confirmed |
| Google | Restricted scopes need a third-party security assessment, renewed at least every 12 months | Google restricted scope verification | Confirmed |
| Google | Restricted verification takes "several weeks" | Same | Confirmed, but this is the only official timing; the 5–20 day figure is from Nango and labelled community |
| Slack | New unlisted commercial apps get 1 request/min and 15 objects on `conversations.history`/`replies` since 2025-05-29 | Slack changelog | Confirmed |
| Slack | Marketplace needs 10+ active workspaces; functional review up to 10 weeks | Slack Marketplace review guide | Confirmed |
| Microsoft | Publisher verification needs a verified Cloud Partner Program account, is free, and takes minutes once prerequisites are met | Microsoft publisher verification | Confirmed |
| Microsoft | Default consent lets users consent to any app; Microsoft recommends allowing only verified publishers | Configure user consent | Confirmed |
| GitHub | No review step; up to 10 callback URLs; up to 100 OAuth apps per owner | Creating an OAuth app | Confirmed |
| GitHub | New organizations restrict OAuth apps by default | About OAuth app access restrictions | Confirmed |
| HubSpot | 25-install cap for marketplace-distribution apps until listed (since 2025-09-22) | HubSpot changelog | Confirmed |
| HubSpot | Listing needs 3 active unaffiliated installs; initial review within 10 business days | Listing requirements | Confirmed |
| Zoom | Private apps only work for users on the developer's account; external sharing needs beta approval or publishing | Zoom key concepts | Confirmed |
| Dropbox | Two weeks to get production approval after 50 linked users | Dropbox developer support page | Confirmed |
| Dropbox | Development apps can link up to 500 accounts | Dropbox forum staff answer | Community only |
| X | Pay-per-use credits, e.g. $0.005 per Post read, $0.015 per Post create | X pricing docs | Confirmed |
| X | Access tokens last 2 hours unless `offline.access` is requested | X OAuth 2.0 docs | Confirmed |
| LinkedIn | Sign in with LinkedIn (OpenID) and Share on LinkedIn are self-serve; marketing, sales and talent APIs need approval | LinkedIn getting access | Confirmed |
| LinkedIn | Community Management API requires a legal entity, verified business email and LinkedIn Page super-admin verification | LinkedIn CM app review | Confirmed |
| Salesforce | Since Sept 2025 new users can't authorize uninstalled connected apps | Paragon and MoveData write-ups | Community only (Salesforce's own article not read) |
| Notion | Authorization URL appears after the public connection is submitted for review | Notion authorization docs | Confirmed, but criteria and timing are undocumented |

## What the research corrected

These were my starting assumptions before reading the sources. Each correction is also shown on the guide page under "What research changed".

- **HubSpot:** I expected "no review unless you want a listing". A September 2025 change caps unlisted marketplace apps at 25 installs.
- **Salesforce:** I expected "create a connected app and go". Since September 2025, each customer admin must install the app first. This led to a new rubric factor, *customer admins must install or approve*, which also affects Microsoft, Slack, GitHub orgs, Zoom and Google Workspace.
- **X:** I expected the $200/month Basic tier. X moved to pay-per-use credits in 2026.
- **Zoom:** I expected unpublished OAuth apps to work for anyone with the link. Private apps are limited to your own account.
- **Slack:** I expected easy setup with an optional review. For agents that read history, the May 2025 rate limits make Marketplace listing close to mandatory.
- **Notion:** I expected no review. The auth docs mention submitting the connection for review, so app review is marked unknown.
- **Microsoft:** I expected publisher verification to be required. It isn't by default, but Microsoft's recommended tenant setting blocks unverified apps, so it's scored as business verification required.
- **Rubric:** The first version scored Salesforce as "Easy to Hard". That was driven by an optional AppExchange path and ignored days of packaging work. I made two fixes:
  - Score every factor for the guide's stated scenario only.
  - Add one point when setup itself takes a working day or more.

## Not confirmed

- **Composio-managed status for all 12 apps.** The directory loads dynamically, and Composio's API needs a key and was unreachable from the research environment. Run `COMPOSIO_API_KEY=... npm run sync:composio` to fill it in from the API (`GET /api/v3/toolkits/{slug}`, field `composio_managed_auth_schemes`).
- **Some scope names** for Microsoft Graph, HubSpot, Atlassian, Dropbox and Salesforce were not re-read in this pass. They are marked unconfirmed in the guides.
- **Review timings** for Zoom, LinkedIn and Notion. No official numbers were found; the ranges shown are labelled unconfirmed.
- **Dropbox's production approval criteria.** The developer guide page redirects to a host the research tools couldn't reach.
- **Salesforce's primary source** (help article 005132365) was not read directly.

## Live checks

`src/lib/probes.ts` runs credential-free checks:
- The OpenID discovery document parses.
- The authorize endpoint answers a fake client.
- The token endpoint rejects a fake code with a standard OAuth error.
- The portal and cited pages are reachable.

Running them from the build sandbox exposed two problems:

1. **The sandbox fakes GitHub.** It routes github.com through a proxy that answers on GitHub's behalf (HTTP 415 with a non-GitHub message). The checks were "passing" against something that wasn't GitHub. I recorded none of those results. Library guides ship with no stored probe results; the **Run live checks** button runs them from the deployed server.
2. **The token check was too lenient.** It treated any 4xx, including 404, as a live endpoint. It now requires a standard OAuth error code (or a 400/401), and unit tests cover the GitHub-style "200 with error in body" case and the proxy case.

## Setup attempts

No provider OAuth apps were actually registered or submitted for review while building this. Doing so needs signed-in developer accounts (Google Cloud, Slack, Microsoft Entra, etc.), and a paid security assessment for Google restricted scopes. The steps are written so a developer can follow them. Steps that require a logged-in console are marked "You do", and the agent-vs-human split reflects that.
