/**
 * Verifies live-chat.astro follows monitoring.astro/heatmaps.astro's exact
 * env-gated config+emit shape, <AstropressLiveChatEmbed> mirrors
 * AstropressEventsEmbed's host-wires-it component shape, the CSP
 * requirement is documented (not silently assumed), and the page never
 * implies Astropress manages chat conversations. Astro components in this
 * repo are verified by source assertions (no render harness set up for
 * unit tests) — same convention as aeo-metadata.test.ts /
 * events-admin-page.test.ts / social-syndication-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const componentsRoot = path.resolve(import.meta.dirname, "../../astropress/components");
const pagePath = path.join(pagesRoot, "live-chat.astro");
const pageSrc = readFileSync(pagePath, "utf8");
const embedComponentPath = path.join(componentsRoot, "AstropressLiveChatEmbed.astro");
const embedComponentSrc = readFileSync(embedComponentPath, "utf8");

describe("live-chat.astro — env-gated config+embed status page", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(pagePath)).toBe(true);
	});

	it("gates on services:manage — the same legitimate shared action monitoring/heatmaps/referrals use", () => {
		expect(pageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("branches on peekCmsConfig()?.liveChat, the same env-gated shape monitoring/heatmaps/events/reviews use", () => {
		expect(pageSrc).toContain("peekCmsConfig()?.liveChat");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(pageSrc).toContain("RequiresIntegration");
		expect(pageSrc).toContain('stubKey="liveChat"');
	});

	it("never implies Astropress manages or displays chat conversations", () => {
		expect(pageSrc.toLowerCase()).not.toContain("manage conversation");
		expect(pageSrc).toContain("liveChat.dashboardNote");
	});

	it("states the CSP requirement is currently the host's responsibility", () => {
		expect(pageSrc).toContain("liveChat.cspNote");
	});

	it("shows a copyable snippet naming the embed component, rather than importing and rendering it itself", () => {
		expect(pageSrc).toContain("AstropressLiveChatEmbed");
		expect(pageSrc).not.toMatch(/^import AstropressLiveChatEmbed/m);
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(pageSrc).toContain("getPageT(locale)");
	});
});

describe("AstropressLiveChatEmbed.astro — host-wires-it component, mirroring AstropressEventsEmbed", () => {
	it("exists", () => {
		expect(existsSync(embedComponentPath)).toBe(true);
	});

	it("is documented as a data-only, host-rendered component (not auto-emitted)", () => {
		// Doc comments wrap across lines with a leading "*" continuation —
		// strip both so matching doesn't depend on exact line-wrap width.
		const normalized = embedComponentSrc.replace(/^\s*\*\s?/gm, " ").replace(/\s+/g, " ");
		expect(normalized).toContain("host-wires-it shape");
		expect(normalized).toContain("only emits markup from the props you pass it");
	});

	it("does not use <script is:inline> (would weaken CSP per audit:security)", () => {
		expect(embedComponentSrc).not.toMatch(/<script\s+is:inline\b/i);
	});

	it("does not use define:vars as an is:inline workaround", () => {
		expect(embedComponentSrc).not.toContain("define:vars");
	});

	it("documents each provider's CSP requirement explicitly, including Intercom's heavier footprint for awareness", () => {
		expect(embedComponentSrc).toContain("client.crisp.chat");
		expect(embedComponentSrc).toContain("embed.tawk.to");
		expect(embedComponentSrc).toContain("wss://*.intercom.io");
		expect(embedComponentSrc).toContain("frame-src");
	});

	it("passes the crisp website ID through a data attribute, not interpolated script content", () => {
		expect(embedComponentSrc).toContain("data-crisp-website-id={validWebsiteId}");
		expect(embedComponentSrc).toContain("dataset.crispWebsiteId");
	});

	it("passes tawk.to's IDs as plain script-tag attributes — no script body needed at all", () => {
		expect(embedComponentSrc).toContain(
			"src={`https://embed.tawk.to/${validPropertyId}/${validWidgetId}`}",
		);
	});

	it("passes chatwoot's websiteToken/baseUrl through data attributes, not interpolated script content", () => {
		expect(embedComponentSrc).toContain("data-website-token={validWebsiteToken}");
		expect(embedComponentSrc).toContain("data-base-url={validBaseUrl}");
	});

	it("validates the chatwoot baseUrl is a real https URL before rendering it", () => {
		expect(embedComponentSrc).toContain("new URL(baseUrl)");
		expect(embedComponentSrc).toContain('parsed.protocol === "https:"');
	});

	it("validates the crisp/tawkto tokens before rendering them", () => {
		expect(embedComponentSrc).toContain("looksLikeSafeToken");
	});

	it("the only set:html usage (the documented 'custom' escape hatch) is annotated audit-ok: on the line directly before it", () => {
		const lines = embedComponentSrc.split(/\r?\n/);
		const setHtmlIndex = lines.findIndex((l) => l.includes("set:html={snippetSrc}"));
		expect(setHtmlIndex).toBeGreaterThan(0);
		expect(lines[setHtmlIndex - 1]).toMatch(/audit-ok:/);
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

	it("admin-routes-definitions.ts points /ap-admin/live-chat at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/live-chat",\s*entrypoint: "live-chat\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\t"live-chat": \{/m);
	});

	it("integration-manifest-data.ts flips the EXISTING liveChat entry to env-gated with configField, keeping services:manage", () => {
		const entry = manifestSrc.match(/\{\s*href: "\/ap-admin\/live-chat",[\s\S]*?\n\t\},/)?.[0];
		expect(entry).toBeDefined();
		expect(entry).toContain('status: "env-gated"');
		expect(entry).toContain('configField: "liveChat"');
		expect(entry).toContain('requiredAction: "services:manage"');
		expect(entry).not.toContain("coming-soon");

		// Only one liveChat entry should exist — flipped in place, not duplicated.
		const allMatches = manifestSrc.match(/href: "\/ap-admin\/live-chat"/g) ?? [];
		expect(allMatches).toHaveLength(1);
	});

	it("adminStubs.liveChat's configHint uses the real declarative shape, not the old process.env-based hint", () => {
		expect(stubCatalogSrc).toContain('liveChat: { provider: "crisp", websiteId:');
		expect(stubCatalogSrc).not.toContain("process.env.CRISP_WEBSITE_ID");
	});

	it("adds Tawk.to as a confirmed provider, caveats Intercom's heavier CSP, and demotes HelpScout as unconfirmed", () => {
		expect(stubCatalogSrc).toContain(
			'{ name: "Tawk.to", href: "https://tawk.to", tag: "Recommended" }',
		);
		expect(stubCatalogSrc).toContain("Intercom (not available — much heavier CSP footprint");
		expect(stubCatalogSrc).toContain("HelpScout (embed shape not yet confirmed)");
	});

	it("keeps the accurate 'embedded on the site' framing while adding the dashboard-responses caveat", () => {
		expect(stubCatalogSrc).toContain("Embed a live-chat widget on the site");
		expect(stubCatalogSrc).toContain("provider's own dashboard");
	});
});
