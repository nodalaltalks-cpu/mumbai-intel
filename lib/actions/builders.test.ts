import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the module under test, matching the existing
// lib/actions/enrichment.test.ts convention. role: "ADMIN" short-circuits
// hasPermission's own real implementation (isAdmin(role) === true) before it
// ever touches prisma.user, so that table doesn't need mocking here.
vi.mock("@/lib/auth/guard", () => ({
  requireMutateSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "ADMIN" }),
  isAdmin: (role: string) => role === "ADMIN",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    builder: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/events", () => ({ emit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { saveDeveloperWebsiteAction } from "./builders";

const builderFindUniqueMock = vi.mocked(prisma.builder.findUnique);
const builderUpdateMock = vi.mocked(prisma.builder.update);
const emitMock = vi.mocked(emit);

describe("saveDeveloperWebsiteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a website for a developer that has none yet", async () => {
    builderFindUniqueMock.mockResolvedValue({ slug: "lodha", websiteUrl: null } as never);
    builderUpdateMock.mockResolvedValue({} as never);

    const result = await saveDeveloperWebsiteAction("builder-lodha", "https://www.lodhagroup.com/");

    expect(result).toEqual({ ok: true, websiteUrl: "https://www.lodhagroup.com" });
    expect(builderUpdateMock).toHaveBeenCalledWith({ where: { id: "builder-lodha" }, data: { websiteUrl: "https://www.lodhagroup.com" } });
    expect(emitMock).toHaveBeenCalledWith(
      "BuilderUpdated",
      expect.objectContaining({
        builderId: "builder-lodha",
        before: { websiteUrl: null },
        after: { websiteUrl: "https://www.lodhagroup.com" },
      })
    );
  });

  it("explicitly updates an already-saved developer website to a new value", async () => {
    builderFindUniqueMock.mockResolvedValue({ slug: "godrej-properties", websiteUrl: "https://www.godrejproperties.com" } as never);
    builderUpdateMock.mockResolvedValue({} as never);

    const result = await saveDeveloperWebsiteAction("builder-godrej", "https://www.godrejproperties.com/new-site");

    expect(result).toEqual({ ok: true, websiteUrl: "https://www.godrejproperties.com/new-site" });
    expect(builderUpdateMock).toHaveBeenCalledWith({
      where: { id: "builder-godrej" },
      data: { websiteUrl: "https://www.godrejproperties.com/new-site" },
    });
    expect(emitMock).toHaveBeenCalledWith(
      "BuilderUpdated",
      expect.objectContaining({
        before: { websiteUrl: "https://www.godrejproperties.com" },
        after: { websiteUrl: "https://www.godrejproperties.com/new-site" },
      })
    );
  });

  it("rejects an invalid URL without ever touching the database", async () => {
    const result = await saveDeveloperWebsiteAction("builder-lodha", "not a url");

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(builderFindUniqueMock).not.toHaveBeenCalled();
    expect(builderUpdateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) URL scheme", async () => {
    const result = await saveDeveloperWebsiteAction("builder-lodha", "javascript:alert(1)");
    expect(result.ok).toBe(false);
    expect(builderUpdateMock).not.toHaveBeenCalled();
  });

  it("errors cleanly when the builder no longer exists", async () => {
    builderFindUniqueMock.mockResolvedValue(null);

    const result = await saveDeveloperWebsiteAction("builder-missing", "https://example.com");

    expect(result).toEqual({ ok: false, error: "Builder not found." });
    expect(builderUpdateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });
});
