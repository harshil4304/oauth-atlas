import type { Guide, ProbeResult } from "./schema";

/**
 * Live checks we can run without any credentials. They turn "the docs say" into
 * "we tested it today" for the parts that are publicly observable:
 *  - the OpenID discovery document parses and names the expected endpoints
 *  - the authorize endpoint answers a request with a fake client
 *  - the token endpoint rejects a fake code the way an OAuth server should
 *  - the developer portal and cited official docs are still reachable
 * None of these create anything at the provider.
 */

const TIMEOUT_MS = 8000;
const UA = "OAuthAtlas-probe/1.0 (+https://github.com; read-only checks)";

async function timed(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

const now = () => new Date().toISOString();
const errText = (e: unknown) => (e instanceof Error ? (e.name === "AbortError" ? "timed out" : e.message) : String(e));

export async function probeDiscovery(url: string): Promise<ProbeResult> {
  const base = { name: "OpenID discovery document", target: url, ranAt: now() };
  try {
    const r = await timed(url);
    if (!r.ok) return { ...base, result: "fail", detail: `HTTP ${r.status}` };
    const j = (await r.json()) as Record<string, unknown>;
    const ok = typeof j.authorization_endpoint === "string" && typeof j.token_endpoint === "string";
    return {
      ...base,
      result: ok ? "pass" : "fail",
      detail: ok
        ? `Valid. Authorize: ${j.authorization_endpoint}. Scopes advertised: ${Array.isArray(j.scopes_supported) ? j.scopes_supported.length : "not listed"}.`
        : "Document parsed but is missing authorization_endpoint or token_endpoint.",
    };
  } catch (e) {
    return { ...base, result: "fail", detail: errText(e) };
  }
}

export async function probeAuthorize(url: string): Promise<ProbeResult> {
  const u = new URL(url);
  u.searchParams.set("client_id", "oauth-atlas-probe-invalid-client");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", "https://example.com/callback");
  u.searchParams.set("state", "probe");
  const base = { name: "Authorize endpoint responds", target: url, ranAt: now() };
  try {
    const r = await timed(u.toString(), { redirect: "manual" });
    // Any answer except "not found" means a live OAuth endpoint; 4xx is expected for a fake client.
    const live = r.status !== 404 && r.status < 500;
    return {
      ...base,
      result: live ? "pass" : "fail",
      detail: `HTTP ${r.status}${r.status >= 300 && r.status < 400 ? " (redirect, usually to sign-in or an error page)" : ""} for a fake client ID.`,
    };
  } catch (e) {
    return { ...base, result: "fail", detail: errText(e) };
  }
}

export async function probeToken(url: string): Promise<ProbeResult> {
  const base = { name: "Token endpoint rejects a fake code", target: url, ranAt: now() };
  try {
    const r = await timed(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "oauth-atlas-probe",
        client_id: "oauth-atlas-probe-invalid-client",
        redirect_uri: "https://example.com/callback",
      }),
    });
    const text = (await r.text()).slice(0, 300);
    // Some providers (e.g. GitHub) answer 200 with an error in the body, so look for an OAuth error code
    // rather than trusting the status alone. A bare 404/415 is not evidence of a working token endpoint.
    const oauthError = /"?error"?\s*[:=]\s*"?(invalid_\w+|unauthorized_client|unsupported_grant_type|incorrect_client_credentials|bad_verification_code)/i.test(
      text,
    );
    const live = oauthError || r.status === 400 || r.status === 401;
    return {
      ...base,
      result: live ? "pass" : "fail",
      detail: `HTTP ${r.status}${oauthError ? ", standard OAuth error returned" : live ? "" : ", response did not look like an OAuth error"}.`,
    };
  } catch (e) {
    return { ...base, result: "fail", detail: errText(e) };
  }
}

export async function probeReachable(name: string, url: string): Promise<ProbeResult> {
  const base = { name, target: url, ranAt: now() };
  try {
    const r = await timed(url, { redirect: "follow" });
    // Login walls (401/403) still prove the page exists.
    const ok = r.status < 400 || r.status === 401 || r.status === 403;
    return { ...base, result: ok ? "pass" : "fail", detail: `HTTP ${r.status}` };
  } catch (e) {
    return { ...base, result: "fail", detail: errText(e) };
  }
}

export async function runProbes(g: Pick<Guide, "endpoints" | "portal" | "sources">, maxSources = 6): Promise<ProbeResult[]> {
  const jobs: Promise<ProbeResult>[] = [];
  if (g.endpoints.discovery) jobs.push(probeDiscovery(g.endpoints.discovery));
  if (g.endpoints.authorize) jobs.push(probeAuthorize(g.endpoints.authorize));
  if (g.endpoints.token) jobs.push(probeToken(g.endpoints.token));
  jobs.push(probeReachable("Developer portal reachable", g.portal.url));
  for (const s of g.sources.filter((s) => s.kind === "official").slice(0, maxSources)) {
    jobs.push(probeReachable(`Source still online: ${s.title}`, s.url));
  }
  return Promise.all(jobs);
}
