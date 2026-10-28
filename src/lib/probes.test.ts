import { afterEach, describe, expect, it, vi } from "vitest";
import { probeAuthorize, probeDiscovery, probeToken } from "./probes";

const mockFetch = (status: number, body: string, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers }));

afterEach(() => vi.restoreAllMocks());

describe("probeToken", () => {
  it("passes on a 200 with an OAuth error body (GitHub style)", async () => {
    mockFetch(200, "error=incorrect_client_credentials&error_description=x");
    expect((await probeToken("https://p.example/token")).result).toBe("pass");
  });
  it("passes on a 400 invalid_grant", async () => {
    mockFetch(400, '{"error":"invalid_grant"}');
    expect((await probeToken("https://p.example/token")).result).toBe("pass");
  });
  it("fails on a 404 or a proxy answer", async () => {
    mockFetch(404, "not found");
    expect((await probeToken("https://p.example/token")).result).toBe("fail");
    vi.restoreAllMocks();
    mockFetch(415, '{"message":"Request bodies must declare Content-Type"}');
    expect((await probeToken("https://p.example/token")).result).toBe("fail");
  });
});

describe("probeAuthorize", () => {
  it("treats a redirect or 400 as a live endpoint and 404 as dead", async () => {
    mockFetch(302, "", { location: "https://p.example/login" });
    expect((await probeAuthorize("https://p.example/authorize")).result).toBe("pass");
    vi.restoreAllMocks();
    mockFetch(404, "");
    expect((await probeAuthorize("https://p.example/authorize")).result).toBe("fail");
  });
});

describe("probeDiscovery", () => {
  it("requires authorize and token endpoints", async () => {
    mockFetch(200, JSON.stringify({ authorization_endpoint: "a", token_endpoint: "b", scopes_supported: ["openid"] }));
    expect((await probeDiscovery("https://p.example/.well-known/openid-configuration")).result).toBe("pass");
    vi.restoreAllMocks();
    mockFetch(200, JSON.stringify({ issuer: "x" }));
    expect((await probeDiscovery("https://p.example/.well-known/openid-configuration")).result).toBe("fail");
  });
});
