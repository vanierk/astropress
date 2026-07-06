/**
 * Sitemap entry computation — verifies excludedPaths/extraUrls are honored
 * (the fix for the write-only-settings bug: sitemap.xml.ts never read the
 * settings saved via system.astro's sitemap section) and that the shared
 * function is what both the public /sitemap.xml route and the admin
 * sitemaps.astro page consume, so they can't drift apart.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime-page-store.js", () => ({
	listRuntimeContentStates: vi.fn().mockResolvedValue([
		{ slug: "post-1", kind: "post", status: "published", title: "Post 1", updatedAt: "2026-01-01" },
		{
			slug: "draft-post",
			kind: "post",
			status: "draft",
			title: "Draft",
			updatedAt: "2026-01-01",
		},
		{ slug: "page-1", kind: "page", status: "published", title: "Page 1", updatedAt: "2026-01-02" },
	]),
}));

vi.mock("../src/runtime-route-registry-system.js", () => ({
	getRuntimeSystemRoute: vi.fn().mockResolvedValue(null),
}));

import { getRuntimeSystemRoute } from "../src/runtime-route-registry-system.js";
import { computeSitemapEntries } from "../src/sitemap-entries.js";

const mockGetRuntimeSystemRoute = getRuntimeSystemRoute as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
	vi.clearAllMocks();
	mockGetRuntimeSystemRoute.mockResolvedValue(null);
});

describe("computeSitemapEntries — no settings saved (default behavior)", () => {
	it("includes the homepage, published post, and published page", async () => {
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.map((e) => e.loc)).toEqual([
			"https://example.com/",
			"https://example.com/blog/post-1/",
			"https://example.com/page-1/",
		]);
	});

	it("never includes draft/unpublished content", async () => {
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.some((e) => e.loc.includes("draft-post"))).toBe(false);
	});
});

describe("computeSitemapEntries — excludedPaths (the write-only-settings fix)", () => {
	it("skips a post whose path is in excludedPaths", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({
			settings: { excludedPaths: ["/blog/post-1/"], extraUrls: [] },
		});
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.map((e) => e.loc)).not.toContain("https://example.com/blog/post-1/");
	});

	it("skips a page whose path is in excludedPaths", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { excludedPaths: ["/page-1/"] } });
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.map((e) => e.loc)).not.toContain("https://example.com/page-1/");
	});

	it("can exclude the homepage itself", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { excludedPaths: ["/"] } });
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.map((e) => e.loc)).not.toContain("https://example.com/");
	});

	it("leaves unrelated entries untouched when excludedPaths doesn't match them", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { excludedPaths: ["/nonexistent/"] } });
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries).toHaveLength(3);
	});
});

describe("computeSitemapEntries — extraUrls (the write-only-settings fix)", () => {
	it("appends each extraUrls entry as its own <url>", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({
			settings: {
				extraUrls: ["https://example.com/custom-a/", "https://example.com/custom-b/"],
			},
		});
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.map((e) => e.loc)).toEqual(
			expect.arrayContaining(["https://example.com/custom-a/", "https://example.com/custom-b/"]),
		);
		expect(entries).toHaveLength(5);
	});

	it("appends extraUrls verbatim, not prefixed with origin (already-fully-qualified)", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({
			settings: { extraUrls: ["https://cdn.example.com/asset-page/"] },
		});
		const entries = await computeSitemapEntries("https://example.com", {});
		expect(entries.some((e) => e.loc === "https://cdn.example.com/asset-page/")).toBe(true);
	});
});

describe("computeSitemapEntries — malformed/missing settings (guards)", () => {
	it("treats a null settings object as no exclusions/extras", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: null });
		await expect(computeSitemapEntries("https://example.com", {})).resolves.toHaveLength(3);
	});

	it("treats a non-array excludedPaths as empty (does not throw)", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { excludedPaths: "not-an-array" } });
		await expect(computeSitemapEntries("https://example.com", {})).resolves.toHaveLength(3);
	});

	it("treats a non-array extraUrls as empty (does not throw)", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { extraUrls: "not-an-array" } });
		await expect(computeSitemapEntries("https://example.com", {})).resolves.toHaveLength(3);
	});

	it("passes locals through to getRuntimeSystemRoute", async () => {
		const locals = { runtime: { env: { DB: {} } } };
		await computeSitemapEntries("https://example.com", locals);
		expect(mockGetRuntimeSystemRoute).toHaveBeenCalledWith("/sitemap.xml", locals);
	});
});
