/**
 * Verifies plugins.astro is wired to the real, already-live plugin system
 * (CmsConfig.plugins / peekCmsConfig, getPluginDispatchStats) rather than a
 * new subsystem, gates on plugins:view, and honestly handles the
 * zero-plugins case. Astro components in this repo are verified by source
 * assertions (no render harness set up for unit tests) — same convention
 * as aeo-metadata.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const pluginsPagePath = path.join(pagesRoot, "plugins.astro");
const pluginsPageSrc = readFileSync(pluginsPagePath, "utf8");

describe("plugins.astro — wired to the real plugin system", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(pluginsPagePath)).toBe(true);
	});

	it("gates on plugins:view", () => {
		expect(pluginsPageSrc).toContain('requiresAccess(Astro, "plugins:view")');
	});

	it("reads the live registered plugins via peekCmsConfig, not a new store", () => {
		expect(pluginsPageSrc).toContain("peekCmsConfig()?.plugins");
	});

	it("reads the live dispatch stats via getPluginDispatchStats", () => {
		expect(pluginsPageSrc).toContain("getPluginDispatchStats()");
	});

	it("lists all four lifecycle hooks", () => {
		expect(pluginsPageSrc).toContain("onContentSave");
		expect(pluginsPageSrc).toContain("onContentPublish");
		expect(pluginsPageSrc).toContain("onMediaUpload");
		expect(pluginsPageSrc).toContain("onError");
	});

	it("surfaces navItems and adminRoutes contributed by each plugin", () => {
		expect(pluginsPageSrc).toContain("plugin.navItems");
		expect(pluginsPageSrc).toContain("plugin.adminRoutes");
	});

	it("handles the zero-plugins case with an honest empty state, not a silent blank page", () => {
		expect(pluginsPageSrc).toContain("plugins.length === 0");
		expect(pluginsPageSrc).toContain("plugins.emptyState");
	});

	it("discloses that dispatch stats are process-local, not a historical log", () => {
		expect(pluginsPageSrc).toContain("plugins.statsNote");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(pluginsPageSrc).toContain("getPageT(adminLocale)");
	});
});

describe("promotion out of the stub", () => {
	const routesDefinitionsSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/admin-routes-definitions.ts"),
		"utf8",
	);
	const stubCatalogSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/admin-stub-catalog.ts"),
		"utf8",
	);
	const manifestSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/integration-manifest-data.ts"),
		"utf8",
	);

	it("admin-routes-definitions.ts points /ap-admin/plugins at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/plugins", entrypoint: "plugins\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\tplugins: \{/m);
	});

	it("integration-manifest-data.ts marks the plugins entry status: real (not coming-soon)", () => {
		const pluginsEntry = manifestSrc.match(/\{\s*href: "\/ap-admin\/plugins",[\s\S]*?\n\t\},/)?.[0];
		expect(pluginsEntry).toBeDefined();
		expect(pluginsEntry).toContain('status: "real"');
		expect(pluginsEntry).not.toContain("coming-soon");
		expect(pluginsEntry).not.toContain("roadmapHref");
	});
});
