/**
 * Verifies events.astro follows monitoring.astro/heatmaps.astro's exact
 * env-gated config+emit shape (branches on peekCmsConfig()?.events),
 * <AstropressEventsEmbed> mirrors AstropressLocalBusinessJsonLd's
 * host-wires-it component shape, and the page never implies Astropress
 * manages RSVPs/attendees. Also verifies the nav re-wiring: events moved
 * from a static nav-action-map leaf to an env-gated INTEGRATIONS entry
 * (avoiding a duplicate sidebar entry), the same shape monitoring/heatmaps
 * already use. Astro components in this repo are verified by source
 * assertions (no render harness set up for unit tests) — same convention
 * as aeo-metadata.test.ts / plugins-admin-page.test.ts / heatmaps-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const componentsRoot = path.resolve(import.meta.dirname, "../../astropress/components");
const eventsPagePath = path.join(pagesRoot, "events.astro");
const eventsPageSrc = readFileSync(eventsPagePath, "utf8");
const embedComponentPath = path.join(componentsRoot, "AstropressEventsEmbed.astro");
const embedComponentSrc = readFileSync(embedComponentPath, "utf8");
const localBusinessSrc = readFileSync(
	path.join(componentsRoot, "AstropressLocalBusinessJsonLd.astro"),
	"utf8",
);

describe("events.astro — env-gated config+embed status page", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(eventsPagePath)).toBe(true);
	});

	it("gates on events:manage", () => {
		expect(eventsPageSrc).toContain('requiresAccess(Astro, "events:manage")');
	});

	it("branches on peekCmsConfig()?.events, the same env-gated shape monitoring/heatmaps use", () => {
		expect(eventsPageSrc).toContain("peekCmsConfig()?.events");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(eventsPageSrc).toContain("RequiresIntegration");
		expect(eventsPageSrc).toContain('stubKey="events"');
	});

	it("never implies Astropress manages RSVPs or attendees", () => {
		expect(eventsPageSrc.toLowerCase()).not.toContain("manage rsvp");
		expect(eventsPageSrc).toContain("events.attendeeDataNote");
	});

	it("shows the host a copyable snippet naming the embed component, rather than importing and rendering it itself", () => {
		expect(eventsPageSrc).toContain("AstropressEventsEmbed");
		expect(eventsPageSrc).not.toMatch(/^import AstropressEventsEmbed/m);
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(eventsPageSrc).toContain("getPageT(locale)");
	});
});

describe("AstropressEventsEmbed.astro — host-wires-it component, mirroring AstropressLocalBusinessJsonLd", () => {
	it("exists", () => {
		expect(existsSync(embedComponentPath)).toBe(true);
	});

	it("is documented as a data-only, host-rendered component (not auto-emitted)", () => {
		expect(embedComponentSrc).toContain("Astropress does not render this on its own");
		expect(localBusinessSrc).toContain("Astropress does not render this on its own");
	});

	it("does not use <script is:inline> (would weaken CSP per audit:security)", () => {
		expect(embedComponentSrc).not.toMatch(/<script\s+is:inline\b/i);
	});

	it("does not use define:vars as an is:inline workaround", () => {
		expect(embedComponentSrc).not.toContain("define:vars");
	});

	it('renders the cal.com embed.js loader and Cal("inline") init, reading calLink from a data attribute rather than interpolating it into script content', () => {
		expect(embedComponentSrc).toContain("https://app.cal.com/embed/embed.js");
		expect(embedComponentSrc).toContain('Cal("inline"');
		expect(embedComponentSrc).toContain("data-cal-link={validCalLink}");
		expect(embedComponentSrc).toContain("el.dataset.calLink");
	});

	it("renders the calendly inline-widget div + external widget.js, both driven by data-url, not interpolated script content", () => {
		expect(embedComponentSrc).toContain("calendly-inline-widget");
		expect(embedComponentSrc).toContain("https://assets.calendly.com/assets/external/widget.js");
		expect(embedComponentSrc).toContain("data-url={validCalendlyUrl}");
	});

	it("validates the calendly url is a real https URL before rendering it", () => {
		expect(embedComponentSrc).toContain("new URL(url)");
		expect(embedComponentSrc).toContain('parsed.protocol === "https:"');
	});

	it("validates the cal.com calLink token before rendering it", () => {
		expect(embedComponentSrc).toContain("looksLikeSafeToken");
	});

	it("the only set:html usage (the documented 'custom' escape hatch) is annotated audit-ok: on the line directly before it", () => {
		const lines = embedComponentSrc.split(/\r?\n/);
		const setHtmlIndex = lines.findIndex((l) => l.includes("set:html={embedSrc}"));
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
	const navActionMapSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/access/nav-action-map-data.ts"),
		"utf8",
	);
	const adminLayoutSrc = readFileSync(
		path.resolve(import.meta.dirname, "../components/AdminLayout.astro"),
		"utf8",
	);

	it("admin-routes-definitions.ts points /ap-admin/events at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/events", entrypoint: "events\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\tevents: \{/m);
	});

	it("integration-manifest-data.ts marks events status: env-gated with configField: events, matching monitoring/heatmaps", () => {
		const eventsEntry = manifestSrc.match(/\{\s*href: "\/ap-admin\/events",[\s\S]*?\n\t\},/)?.[0];
		expect(eventsEntry).toBeDefined();
		expect(eventsEntry).toContain('status: "env-gated"');
		expect(eventsEntry).toContain('configField: "events"');
		expect(eventsEntry).not.toContain("coming-soon");
	});

	it("has no static nav-action-map entry anymore — avoids a duplicate sidebar entry alongside the new INTEGRATIONS entry", () => {
		expect(navActionMapSrc).not.toMatch(/\{\s*href: "\/ap-admin\/events"/);
	});

	it("has no static mappedLeaf in AdminLayout.astro anymore", () => {
		expect(adminLayoutSrc).not.toMatch(/mappedLeaf\("\/ap-admin\/events"/);
	});

	it("adminStubs.events's configHint uses the real CmsConfig.events shape (calLink), not the old nonexistent url-only shape", () => {
		expect(stubCatalogSrc).toContain('events: { provider: "cal", calLink:');
	});

	it("no longer claims Astropress manages RSVPs", () => {
		const eventsStubBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("\tevents: {"),
			stubCatalogSrc.indexOf("\tevents: {") + 600,
		);
		expect(eventsStubBlock.toLowerCase()).not.toContain("manage rsvps");
	});

	it("demotes Eventbrite/Luma as not-yet-confirmed rather than implying they embed identically to Cal.com/Calendly", () => {
		expect(stubCatalogSrc).toContain("Eventbrite (embed shape not yet confirmed)");
		expect(stubCatalogSrc).toContain("Luma (embed shape not yet confirmed)");
	});
});
