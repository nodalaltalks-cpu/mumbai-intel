import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMahaReraRecords } from "./fetchMahaRera";

describe("fetchMahaReraRecords (Phase 52 Part I -- access safety, never bypasses a restriction)", () => {
  it("a connection-level failure (the REAL result observed against MahaRERA's own domains during this phase) returns null, never an empty-but-successful result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    await expect(fetchMahaReraRecords("Sunteck Altavia")).resolves.toBeNull();
  });

  it("a non-OK HTTP response returns null rather than being treated as zero results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(fetchMahaReraRecords("Sunteck Altavia")).resolves.toBeNull();
  });

  it("a CAPTCHA marker in the response body returns null -- never attempts to solve it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>Please complete the CAPTCHA to continue</html>" }));
    await expect(fetchMahaReraRecords("Sunteck Altavia")).resolves.toBeNull();
  });

  it("a login-wall marker in the response body returns null -- never authenticates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>Sign in to continue</html>" }));
    await expect(fetchMahaReraRecords("Sunteck Altavia")).resolves.toBeNull();
  });

  it("a reachable, unrestricted page with no parsed search integration still returns null honestly (no fabricated empty success)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>MahaRERA home page</html>" }));
    await expect(fetchMahaReraRecords("Sunteck Altavia")).resolves.toBeNull();
  });

  afterEach(() => vi.unstubAllGlobals());
});
