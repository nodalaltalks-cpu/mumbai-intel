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
    builder: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/cache", () => ({ revalidateBuilder: vi.fn() }));
// createBuilderRecord's own slug handling -- irrelevant to these tests, stubbed to a
// deterministic value so the "create a new Builder" path doesn't need a real uniqueness check.
vi.mock("@/lib/slug", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
  ensureUniqueSlug: vi.fn(async (base: string) => base.toLowerCase().replace(/\s+/g, "-")),
}));

import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { logAudit } from "@/lib/audit";
import { saveDeveloperWebsiteAction } from "./builders";

const builderFindManyMock = vi.mocked(prisma.builder.findMany);
const builderUpdateMock = vi.mocked(prisma.builder.update);
const builderCreateMock = vi.mocked(prisma.builder.create);
const emitMock = vi.mocked(emit);
const logAuditMock = vi.mocked(logAudit);

/**
 * Phase 71 -- saveDeveloperWebsiteAction now resolves (or creates) the
 * Builder by developer NAME, not a pre-existing builderId (Phase 69's
 * version required one, which made "Save to Developer" unreachable for the
 * common case of a developer with no Builder row yet -- see the action's own
 * doc comment and the Phase 71 diagnosis).
 */
describe("saveDeveloperWebsiteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Developer A can have a canonical saved website: creates a new Builder + website when none exists for this developer name yet", async () => {
    builderFindManyMock.mockResolvedValue([] as never);
    builderCreateMock.mockResolvedValue({ id: "builder-godrej-id" } as never);

    const result = await saveDeveloperWebsiteAction("Godrej Properties", "https://www.godrejproperties.com/");

    expect(result.ok).toBe(true);
    expect(result.websiteUrl).toBe("https://www.godrejproperties.com");
    expect(result.builderId).toBe("builder-godrej-id");
    expect(result.builderName).toBe("Godrej Properties");
    expect(builderCreateMock).toHaveBeenCalledTimes(1);
    const createData = builderCreateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(createData.name).toBe("Godrej Properties");
    expect(createData.websiteUrl).toBe("https://www.godrejproperties.com");
    // The new-Builder path is audited by createBuilderRecord itself, not a second BuilderUpdated emit.
    expect(logAuditMock).toHaveBeenCalledWith("user-1", "builder.create", "Builder", "builder-godrej-id");
    expect(emitMock).not.toHaveBeenCalled();
    expect(builderUpdateMock).not.toHaveBeenCalled();
  });

  it("Project 2 of Developer A retrieves the SAME saved website -- an exact-name match updates the existing Builder instead of creating a second one", async () => {
    builderFindManyMock.mockResolvedValue([
      { id: "builder-godrej-id", name: "Godrej Properties", legalNames: [], reraNumber: null, slug: "godrej-properties", websiteUrl: "https://www.godrejproperties.com" },
    ] as never);
    builderUpdateMock.mockResolvedValue({} as never);

    const result = await saveDeveloperWebsiteAction("Godrej Properties", "https://www.godrejproperties.com");

    expect(result.ok).toBe(true);
    expect(result.builderId).toBe("builder-godrej-id");
    expect(builderCreateMock).not.toHaveBeenCalled();
    expect(builderUpdateMock).toHaveBeenCalledWith({ where: { id: "builder-godrej-id" }, data: { websiteUrl: "https://www.godrejproperties.com" } });
  });

  it("a legalName alias also resolves to the SAME existing Builder (same developer, different staged spelling)", async () => {
    builderFindManyMock.mockResolvedValue([
      { id: "builder-godrej-id", name: "Godrej Properties", legalNames: ["Godrej Properties Ltd."], reraNumber: null, slug: "godrej-properties", websiteUrl: null },
    ] as never);
    builderUpdateMock.mockResolvedValue({} as never);

    const result = await saveDeveloperWebsiteAction("Godrej Properties Ltd.", "https://www.godrejproperties.com/");

    expect(result.ok).toBe(true);
    expect(result.builderId).toBe("builder-godrej-id");
    expect(builderCreateMock).not.toHaveBeenCalled();
  });

  it("different developers cannot see or overwrite each other's saved website -- a merely similar name creates its OWN new Builder rather than reusing Godrej's", async () => {
    builderFindManyMock.mockResolvedValue([
      { id: "builder-godrej-id", name: "Godrej Properties", legalNames: [], reraNumber: null, slug: "godrej-properties", websiteUrl: "https://www.godrejproperties.com" },
    ] as never);
    builderCreateMock.mockResolvedValue({ id: "builder-lodha-id" } as never);

    const result = await saveDeveloperWebsiteAction("Lodha", "https://www.lodhagroup.com/");

    expect(result.ok).toBe(true);
    expect(result.builderId).toBe("builder-lodha-id");
    expect(builderCreateMock).toHaveBeenCalledTimes(1);
    // Godrej's own row is never touched by a Lodha save.
    expect(builderUpdateMock).not.toHaveBeenCalled();
  });

  it("explicit update changes the canonical developer website to a new value", async () => {
    builderFindManyMock.mockResolvedValue([
      { id: "builder-godrej-id", name: "Godrej Properties", legalNames: [], reraNumber: null, slug: "godrej-properties", websiteUrl: "https://www.godrejproperties.com" },
    ] as never);
    builderUpdateMock.mockResolvedValue({} as never);

    const result = await saveDeveloperWebsiteAction("Godrej Properties", "https://www.godrejproperties.com/new-official-site");

    expect(result.ok).toBe(true);
    expect(result.websiteUrl).toBe("https://www.godrejproperties.com/new-official-site");
    expect(builderUpdateMock).toHaveBeenCalledWith({
      where: { id: "builder-godrej-id" },
      data: { websiteUrl: "https://www.godrejproperties.com/new-official-site" },
    });
    expect(emitMock).toHaveBeenCalledWith(
      "BuilderUpdated",
      expect.objectContaining({
        builderId: "builder-godrej-id",
        before: { websiteUrl: "https://www.godrejproperties.com" },
        after: { websiteUrl: "https://www.godrejproperties.com/new-official-site" },
      })
    );
  });

  it("rejects an invalid URL without ever touching the database", async () => {
    const result = await saveDeveloperWebsiteAction("Lodha", "not a url");

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(builderFindManyMock).not.toHaveBeenCalled();
    expect(builderCreateMock).not.toHaveBeenCalled();
    expect(builderUpdateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) URL scheme", async () => {
    const result = await saveDeveloperWebsiteAction("Lodha", "javascript:alert(1)");
    expect(result.ok).toBe(false);
    expect(builderUpdateMock).not.toHaveBeenCalled();
    expect(builderCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty developer name", async () => {
    const result = await saveDeveloperWebsiteAction("   ", "https://example.com");
    expect(result.ok).toBe(false);
    expect(builderFindManyMock).not.toHaveBeenCalled();
  });
});
