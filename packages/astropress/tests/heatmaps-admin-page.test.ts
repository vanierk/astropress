/**
 * Verifies heatmaps.astro follows monitoring.astro's exact env-gated
 * config+emit shape: branches on peekCmsConfig()?.heatmaps, shows
 * RequiresIntegration when absent, and — when present — shows config
 * status only (never an embedded heatmap view, since none of these
 * providers offer one worth inlining). Astro components in this repo are
 * verified by source assertions (no render harness set up for unit tests)
 * — same convention as aeo-metadata.test.ts / plugins-admin-page.test.ts /
 * email-admin-page.test.ts / community-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const heatmapsPagePath = path.join(pagesRoot, "heatmaps.astro");
const heatmapsPageSrc = readFileSync(heatmapsPagePath, "utf8");
const monitoringPageSrc = readFileSync(path.join(pagesRoot, "monitoring.astro"), "utf8");

describe("heatmaps.astro — env-gated config+emit status page, mirroring monitoring.astro", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(heatmapsPagePath)).toBe(true);
	});

	it("gates on services:manage, the same action monitoring.astro uses", () => {
		expect(heatmapsPageSrc).toContain('requiresAccess(Astro, "services:manage")');
		expect(monitoringPageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("branches on peekCmsConfig()?.heatmaps, the same env-gated shape monitoring.astro uses", () => {
		expect(heatmapsPageSrc).toContain("peekCmsConfig()?.heatmaps");
		expect(monitoringPageSrc).toContain("peekCmsConfig()?.monitoring");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(heatmapsPageSrc).toContain("RequiresIntegration");
		expect(heatmapsPageSrc).toContain('stubKey="heatmaps"');
	});

	it("never embeds an iframe or heatmap view — status only, with an external dashboard link", () => {
		expect(heatmapsPageSrc).not.toContain("<iframe");
		expect(heatmapsPageSrc).toContain("heatmaps.viewDashboardLink");
	});

	it("links to the provider's own dashboard for clarity and hotjar", () => {
		expect(heatmapsPageSrc).toContain("clarity.microsoft.com");
		expect(heatmapsPageSrc).toContain("insights.hotjar.com");
	});

	it("surfaces the honest PostHog-already-covered note", () => {
		expect(heatmapsPageSrc).toContain("heatmaps.postHogNote");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(heatmapsPageSrc).toContain("getPageT(locale)");
	});
});

describe("heatmaps.ts — the config+emit resolver, mirroring analytics.ts", () => {
	const heatmapsLibSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/heatmaps.ts"),
		"utf8",
	);
	const analyticsLibSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/analytics.ts"),
		"utf8",
	);

	it("exists", () => {
		expect(existsSync(path.resolve(import.meta.dirname, "../src/heatmaps.ts"))).toBe(true);
	});

	it("exports resolveHeatmapsSnippet and a consent-aware wrapper, matching analytics.ts's convention", () => {
		expect(heatmapsLibSrc).toContain("export function resolveHeatmapsSnippet");
		expect(heatmapsLibSrc).toContain("export function resolveHeatmapsSnippetConsentAware");
		expect(analyticsLibSrc).toContain("export function resolveAnalyticsSnippet");
		expect(analyticsLibSrc).toContain("export function resolveAnalyticsSnippetConsentAware");
	});

	it("reuses analytics.ts's requestOptedOutOfTracking and escJs rather than duplicating them", () => {
		expect(heatmapsLibSrc).toContain('from "./analytics.js"');
		expect(heatmapsLibSrc).toContain("requestOptedOutOfTracking");
		expect(heatmapsLibSrc).toContain("escJs");
	});

	it("has its own package.json subpath export, matching ./analytics", () => {
		const pkgJson = readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8");
		expect(pkgJson).toContain('"./heatmaps"');
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

	it("admin-routes-definitions.ts points /ap-admin/heatmaps at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/heatmaps",\s*entrypoint: "heatmaps\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\theatmaps: \{/m);
	});

	it("integration-manifest-data.ts marks heatmaps status: env-gated with configField: heatmaps, matching monitoring's shape", () => {
		const heatmapsEntry = manifestSrc.match(
			/\{\s*href: "\/ap-admin\/heatmaps",[\s\S]*?\n\t\},/,
		)?.[0];
		expect(heatmapsEntry).toBeDefined();
		expect(heatmapsEntry).toContain('status: "env-gated"');
		expect(heatmapsEntry).toContain('configField: "heatmaps"');
		expect(heatmapsEntry).not.toContain("coming-soon");
		expect(heatmapsEntry).not.toContain("roadmapHref");
	});

	it("adminStubs.heatmaps's configHint now references the real CmsConfig.heatmaps shape, not the nonexistent 'provider'/'url' fields", () => {
		expect(stubCatalogSrc).toContain('heatmaps: { type: "clarity", projectId:');
		expect(stubCatalogSrc).not.toContain('provider: "openreplay"');
	});

	it("caveats OpenReplay honestly rather than leading with it as snippet-simple", () => {
		expect(stubCatalogSrc).toContain("OpenReplay (self-hosted, needs npm + a JS bundler");
	});
});
