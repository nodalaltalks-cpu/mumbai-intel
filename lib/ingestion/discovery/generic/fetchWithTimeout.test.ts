import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  it("resolves normally when the underlying fetch resolves quickly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const res = await fetchWithTimeout(fetchImpl, "https://example.com", {}, 1000);
    expect(res.ok).toBe(true);
  });

  it("aborts and rejects with a clear timeout error when the underlying fetch never resolves", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );
    await expect(fetchWithTimeout(fetchImpl, "https://slow.example.com", {}, 20)).rejects.toThrow(/timed out/i);
  });

  it("propagates a genuine (non-timeout) fetch error unchanged", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("DNS lookup failed"));
    await expect(fetchWithTimeout(fetchImpl, "https://bad.example.com", {}, 1000)).rejects.toThrow("DNS lookup failed");
  });

  it("passes the abort signal through to the underlying fetch call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    await fetchWithTimeout(fetchImpl, "https://example.com", { headers: { "User-Agent": "test" } }, 1000);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ "User-Agent": "test" });
  });
});
