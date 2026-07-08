/**
 * Verifies referrals.astro follows monitoring.astro/heatmaps.astro/
 * events.astro/reviews.astro's exact env-gated config+emit shape,
 * <AstropressReferralsEmbed> mirrors AstropressEventsEmbed/
 * AstropressReviewsEmbed's host-wires-it component shape, and — critically
 * — the arrival-vs-payout boundary is structural (a visually distinct,
 * always-rendered callout), not a footnote. Also verifies services:manage
 * was kept unchanged (no new ABAC action was needed here, unlike reviews).
 * Astro components in this repo are verified by source assertions (no
 * render harness set up for unit tests) — same convention as
 * aeo-metadata.test.ts / events-admin-page.test.ts / reviews-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const componentsRoot = path.resolve(import.meta.dirname, "../../astropress/components");
const referralsPagePath = path.join(pagesRoot, "referrals.astro");
const referralsPageSrc = readFileSync(referralsPagePath, "utf8");
const embedComponentPath = path.join(componentsRoot, "AstropressReferralsEmbed.astro");
const embedComponentSrc = readFileSync(embedComponentPath, "utf8");

describe("referrals.astro — env-gated config+embed status page with a structural payout boundary", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(referralsPagePath)).toBe(true);
	});

	it("keeps the existing services:manage gate — no new ABAC action was needed, unlike reviews", () => {
		expect(referralsPageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("branches on peekCmsConfig()?.referrals, the same env-gated shape monitoring/heatmaps/events/reviews use", () => {
		expect(referralsPageSrc).toContain("peekCmsConfig()?.referrals");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(referralsPageSrc).toContain("RequiresIntegration");
		expect(referralsPageSrc).toContain('stubKey="referrals"');
	});

	it("renders the payout boundary as its own always-visible, visually distinct callout section — not a muted field-note, and not conditional on config being set", () => {
		// The callout must render unconditionally (outside the {config ? ... : ...} branch)
		const calloutIndex = referralsPageSrc.indexOf("boundary-callout");
		const branchIndex = referralsPageSrc.indexOf("{config ? (");
		expect(calloutIndex).toBeGreaterThan(-1);
		expect(branchIndex).toBeGreaterThan(-1);
		expect(calloutIndex).toBeLessThan(branchIndex);
		expect(referralsPageSrc).toContain("referrals.boundaryHeading");
		expect(referralsPageSrc).toContain("referrals.boundaryBody");
	});

	it("the boundary copy explicitly names both what this does (arrival) and what it does not do (payout/conversion)", () => {
		const labelsSrc = readFileSync(
			path.resolve(import.meta.dirname, "../src/admin-page-labels.ts"),
			"utf8",
		);
		const boundaryBody = labelsSrc.match(/"referrals\.boundaryBody":\s*\{\s*en:\s*"([^"]+)"/)?.[1];
		expect(boundaryBody).toBeDefined();
		expect(boundaryBody?.toLowerCase()).toContain("arrived via a referral link");
		expect(boundaryBody?.toLowerCase()).toContain("does not do this");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(referralsPageSrc).toContain("getPageT(locale)");
	});
});

describe("AstropressReferralsEmbed.astro — host-wires-it component, mirroring AstropressEventsEmbed/AstropressReviewsEmbed", () => {
	it("exists", () => {
		expect(existsSync(embedComponentPath)).toBe(true);
	});

	it("is documented as arrival-only, explicitly stating it does not report conversions/payouts", () => {
		expect(embedComponentSrc).toContain("does NOT report");
		expect(embedComponentSrc.toLowerCase()).toContain("does not do this");
	});

	it("does not use <script is:inline> (would weaken CSP per audit:security)", () => {
		expect(embedComponentSrc).not.toMatch(/<script\s+is:inline\b/i);
	});

	it("does not use define:vars as an is:inline workaround", () => {
		expect(embedComponentSrc).not.toContain("define:vars");
	});

	it("passes the rewardful public key as an attribute on the external script tag — no dynamic script body needed at all", () => {
		expect(embedComponentSrc).toContain("https://r.wdfl.co/rw.js");
		expect(embedComponentSrc).toContain("data-rewardful={validRewardfulKey}");
	});

	it("passes the firstpromoter public id through a data attribute read by a fully static bootstrap script, not interpolated script content", () => {
		expect(embedComponentSrc).toContain("cdn.firstpromoter.com/fpr.js");
		expect(embedComponentSrc).toContain("data-fpr-cid={validFirstPromoterId}");
		expect(embedComponentSrc).toContain("el.dataset.fprCid");
	});

	it("validates both provider tokens before rendering them", () => {
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
	const navActionMapSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/access/nav-action-map-data.ts"),
		"utf8",
	);
	const adminLayoutSrc = readFileSync(
		path.resolve(import.meta.dirname, "../components/AdminLayout.astro"),
		"utf8",
	);
	const actionRegistrySrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/access/action-registry-data.ts"),
		"utf8",
	);

	it("admin-routes-definitions.ts points /ap-admin/referrals at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/referrals",\s*entrypoint: "referrals\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\treferrals: \{/m);
	});

	it("integration-manifest-data.ts marks referrals status: env-gated with configField: referrals, keeping services:manage", () => {
		const referralsEntry = manifestSrc.match(
			/\{\s*href: "\/ap-admin\/referrals",[\s\S]*?\n\t\},/,
		)?.[0];
		expect(referralsEntry).toBeDefined();
		expect(referralsEntry).toContain('status: "env-gated"');
		expect(referralsEntry).toContain('configField: "referrals"');
		expect(referralsEntry).toContain('requiredAction: "services:manage"');
		expect(referralsEntry).not.toContain("coming-soon");
	});

	it("no dedicated referrals:manage action was added — services:manage was already the correct, legitimate shared action", () => {
		expect(actionRegistrySrc).not.toContain('"referrals:manage"');
	});

	it("has no static nav-action-map entry anymore (avoids a duplicate sidebar entry alongside the new INTEGRATIONS entry)", () => {
		expect(navActionMapSrc).not.toMatch(/\{\s*href: "\/ap-admin\/referrals"/);
	});

	it("has no static mappedLeaf in AdminLayout.astro anymore", () => {
		expect(adminLayoutSrc).not.toMatch(/mappedLeaf\("\/ap-admin\/referrals"/);
	});

	it("adminStubs.referrals's configHint uses the real ReferralsConfig shape (rewardfulPublicKey), not the old apiKey-implying-a-secret shape", () => {
		expect(stubCatalogSrc).toContain("rewardfulPublicKey:");
		expect(stubCatalogSrc).not.toContain("apiKey: process.env.REWARDFUL_API_KEY");
	});

	it("no longer claims Astropress tracks payouts", () => {
		const referralsStubBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("\treferrals: {"),
			stubCatalogSrc.indexOf("\treferrals: {") + 700,
		);
		expect(referralsStubBlock.toLowerCase()).not.toContain("track referrers, payouts");
	});

	it("caveats ReferralCandy's secret-signature requirement and demotes GrowSurf as unconfirmed", () => {
		expect(stubCatalogSrc).toContain("ReferralCandy (tracking needs a computed secret signature");
		expect(stubCatalogSrc).toContain("GrowSurf (embed shape not yet confirmed)");
	});
});
