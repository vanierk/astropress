/**
 * Verifies community.astro is a real, standalone page (not a redirect,
 * unlike shop) that reuses services-config.ts's registry + the exact
 * services/[provider].astro iframe-proxy convention (getAstropressService,
 * service.adminPath + "/") rather than reinventing embedding, keeps its
 * own nav leaf, and handles the not-connected case with an honest
 * empty-state. Astro components in this repo are verified by source
 * assertions (no render harness set up for unit tests) — same convention
 * as aeo-metadata.test.ts / plugins-admin-page.test.ts / email-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const communityPagePath = path.join(pagesRoot, "community.astro");
const communityPageSrc = readFileSync(communityPagePath, "utf8");
const providerHostSrc = readFileSync(path.join(pagesRoot, "services/[provider].astro"), "utf8");

describe("community.astro — real standalone page reusing the services iframe-proxy mechanism", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(communityPagePath)).toBe(true);
	});

	it("gates on services:manage, the same action services.astro uses", () => {
		expect(communityPageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("is NOT a redirect — it renders its own AdminLayout, unlike shop.astro", () => {
		expect(communityPageSrc).not.toContain('Astro.redirect("/ap-admin/services"');
		expect(communityPageSrc).toContain("AdminLayout");
	});

	it("reads the registered service via getAstropressService, the real registry", () => {
		expect(communityPageSrc).toContain('getAstropressService("community")');
	});

	it('embeds service.adminPath + "/" as the iframe src — the same convention services/[provider].astro uses', () => {
		expect(communityPageSrc).toContain("${service.adminPath}/");
		expect(providerHostSrc).toContain('service.adminPath + "/"');
	});

	it("handles the not-connected case with an honest empty-state, not a silent blank page", () => {
		expect(communityPageSrc).toContain("!service");
		expect(communityPageSrc).toContain("community.emptyStateHeading");
		expect(communityPageSrc).toContain("registerAstropressService");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(communityPageSrc).toContain("getPageT(adminLocale)");
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
	const navActionMapSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/access/nav-action-map-data.ts"),
		"utf8",
	);
	const adminLayoutSrc = readFileSync(
		path.resolve(import.meta.dirname, "../components/AdminLayout.astro"),
		"utf8",
	);

	it("admin-routes-definitions.ts points /ap-admin/community at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/community",\s*entrypoint: "community\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\tcommunity: \{/m);
	});

	it("KEEPS its static nav-action-map entry — unlike shop, this is a standalone destination", () => {
		expect(navActionMapSrc).toMatch(/href: "\/ap-admin\/community"/);
	});

	it("KEEPS its static nav leaf in AdminLayout.astro — unlike shop", () => {
		expect(adminLayoutSrc).toMatch(/mappedLeaf\("\/ap-admin\/community"/);
	});

	it("adminStubs.community's configHint uses the real adminPath convention (/ap-admin/services/community), not the stale self-referencing path", () => {
		expect(stubCatalogSrc).toContain('adminPath: "/ap-admin/services/community"');
		expect(stubCatalogSrc).not.toContain('adminPath: "/ap-admin/community"');
	});
});
