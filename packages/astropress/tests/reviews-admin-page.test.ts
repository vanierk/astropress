/**
 * Verifies reviews.astro follows monitoring.astro/heatmaps.astro/events.astro's
 * exact env-gated config+emit shape, <AstropressReviewsEmbed> mirrors
 * AstropressEventsEmbed's host-wires-it component shape, the real ABAC
 * mis-sharing bug (reviews gated on testimonials:manage) is fixed with its
 * own reviews:manage action, and the page never implies Astropress manages
 * or responds to reviews. Astro components in this repo are verified by
 * source assertions (no render harness set up for unit tests) — same
 * convention as aeo-metadata.test.ts / events-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const componentsRoot = path.resolve(import.meta.dirname, "../../astropress/components");
const reviewsPagePath = path.join(pagesRoot, "reviews.astro");
const reviewsPageSrc = readFileSync(reviewsPagePath, "utf8");
const embedComponentPath = path.join(componentsRoot, "AstropressReviewsEmbed.astro");
const embedComponentSrc = readFileSync(embedComponentPath, "utf8");
const eventsEmbedSrc = readFileSync(
	path.join(componentsRoot, "AstropressEventsEmbed.astro"),
	"utf8",
);

describe("reviews.astro — env-gated config+embed status page", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(reviewsPagePath)).toBe(true);
	});

	it("gates on the new reviews:manage action, not testimonials:manage", () => {
		expect(reviewsPageSrc).toContain('requiresAccess(Astro, "reviews:manage")');
		// The historical-bug explanation in the page's own doc comment
		// legitimately mentions "testimonials:manage" by name — only the
		// active guard call matters here.
		expect(reviewsPageSrc).not.toContain('requiresAccess(Astro, "testimonials:manage")');
	});

	it("branches on peekCmsConfig()?.reviews, the same env-gated shape monitoring/heatmaps/events use", () => {
		expect(reviewsPageSrc).toContain("peekCmsConfig()?.reviews");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(reviewsPageSrc).toContain("RequiresIntegration");
		expect(reviewsPageSrc).toContain('stubKey="reviews"');
	});

	it("never implies Astropress manages or responds to reviews", () => {
		expect(reviewsPageSrc.toLowerCase()).not.toContain("manage review");
		expect(reviewsPageSrc).toContain("reviews.responsesNote");
	});

	it("shows a copyable snippet naming the embed component, rather than importing and rendering it itself", () => {
		expect(reviewsPageSrc).toContain("AstropressReviewsEmbed");
		expect(reviewsPageSrc).not.toMatch(/^import AstropressReviewsEmbed/m);
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(reviewsPageSrc).toContain("getPageT(locale)");
	});
});

describe("AstropressReviewsEmbed.astro — host-wires-it component, mirroring AstropressEventsEmbed", () => {
	it("exists", () => {
		expect(existsSync(embedComponentPath)).toBe(true);
	});

	it("is documented as a data-only, host-rendered component (not auto-emitted)", () => {
		expect(embedComponentSrc).toContain("Astropress does not render this on its own");
		expect(eventsEmbedSrc).toContain("Astropress does not render this on its own");
	});

	it("does not use <script is:inline> (would weaken CSP per audit:security)", () => {
		expect(embedComponentSrc).not.toMatch(/<script\s+is:inline\b/i);
	});

	it("does not use define:vars as an is:inline workaround", () => {
		expect(embedComponentSrc).not.toContain("define:vars");
	});

	it("renders the trustpilot bootstrap script and widget div, both fully static — no dynamic script content at all, simpler than the cal.com case", () => {
		expect(embedComponentSrc).toContain("widget.trustpilot.com/bootstrap");
		expect(embedComponentSrc).toContain("trustpilot-widget");
		expect(embedComponentSrc).not.toContain("<script>");
	});

	it("passes businessUnitId/templateId through native data attributes, not interpolated script content", () => {
		expect(embedComponentSrc).toContain("data-businessunit-id={validBusinessUnitId}");
		expect(embedComponentSrc).toContain("data-template-id={validTemplateId}");
	});

	it("validates the businessUnitId/templateId tokens before rendering them", () => {
		expect(embedComponentSrc).toContain("looksLikeSafeToken");
	});

	it("the only set:html usage (the documented 'custom' escape hatch) is annotated audit-ok: on the line directly before it", () => {
		const lines = embedComponentSrc.split(/\r?\n/);
		const setHtmlIndex = lines.findIndex((l) => l.includes("set:html={embedSrc}"));
		expect(setHtmlIndex).toBeGreaterThan(0);
		expect(lines[setHtmlIndex - 1]).toMatch(/audit-ok:/);
	});
});

describe("ABAC bug fix: reviews:manage replaces the testimonials:manage mis-share", () => {
	const actionRegistrySrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/access/action-registry-data.ts"),
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
	const stubCatalogSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/admin-stub-catalog.ts"),
		"utf8",
	);

	it("registers reviews:manage with resourceKind: review, mirroring events:manage's exact shape", () => {
		expect(actionRegistrySrc).toMatch(
			/id: "reviews:manage",\s*\n\s*description: "Manage third-party review display",\s*\n\s*resourceKind: "review",/,
		);
	});

	it("has no static nav-action-map entry for reviews anymore (avoids a duplicate sidebar entry alongside the new INTEGRATIONS entry)", () => {
		expect(navActionMapSrc).not.toMatch(/\{\s*href: "\/ap-admin\/reviews"/);
	});

	it("has no static mappedLeaf for reviews in AdminLayout.astro anymore", () => {
		expect(adminLayoutSrc).not.toMatch(/mappedLeaf\("\/ap-admin\/reviews"/);
	});

	it("ADMIN_STUB_PAGES no longer has a reviews entry pointing at testimonials:manage", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\treviews: \{/m);
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

	it("admin-routes-definitions.ts points /ap-admin/reviews at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/reviews", entrypoint: "reviews\.astro"/,
		);
	});

	it("integration-manifest-data.ts marks reviews status: env-gated with configField: reviews, matching monitoring/heatmaps/events", () => {
		const reviewsEntry = manifestSrc.match(/\{\s*href: "\/ap-admin\/reviews",[\s\S]*?\n\t\},/)?.[0];
		expect(reviewsEntry).toBeDefined();
		expect(reviewsEntry).toContain('status: "env-gated"');
		expect(reviewsEntry).toContain('configField: "reviews"');
		expect(reviewsEntry).toContain('requiredAction: "reviews:manage"');
		expect(reviewsEntry).not.toContain("coming-soon");
	});

	it("adminStubs.reviews's configHint uses the real ReviewsConfig shape (trustpilot/businessUnitId/templateId)", () => {
		expect(stubCatalogSrc).toContain('provider: "trustpilot"');
		expect(stubCatalogSrc).toContain("businessUnitId:");
		expect(stubCatalogSrc).not.toContain('provider: "google", placeId');
	});

	it("no longer claims to uniformly aggregate reviews from third-party platforms", () => {
		expect(stubCatalogSrc).not.toContain(
			"Aggregate reviews from third-party platforms and surface them on the site",
		);
	});

	it("demotes Google/Yelp as needing a separate API integration with real limits, not equivalent providers", () => {
		expect(stubCatalogSrc).toContain("Google Business Profile (needs a separate API integration");
		expect(stubCatalogSrc).toContain("Yelp Fusion (needs a separate API integration");
	});
});
