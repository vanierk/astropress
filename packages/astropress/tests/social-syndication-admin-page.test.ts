/**
 * Verifies social-syndication.astro follows monitoring.astro/heatmaps.astro's
 * exact env-gated shape, never shows secret values (presence only — like
 * the email page), and correctly documents that no new publish pipeline
 * was built (the existing onContentPublish dispatch is reused). Astro
 * components in this repo are verified by source assertions (no render
 * harness set up for unit tests) — same convention as
 * aeo-metadata.test.ts / heatmaps-admin-page.test.ts / referrals-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const pagePath = path.join(pagesRoot, "social-syndication.astro");
const pageSrc = readFileSync(pagePath, "utf8");
const actionPath = path.join(pagesRoot, "actions/social-syndication-connect.ts");
const actionSrc = readFileSync(actionPath, "utf8");
const libSrc = readFileSync(
	path.resolve(import.meta.dirname, "../src/social-syndication.ts"),
	"utf8",
);

describe("social-syndication.astro — env-gated status + connect page", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(pagePath)).toBe(true);
	});

	it("gates on services:manage — the same legitimate shared action monitoring/heatmaps use", () => {
		expect(pageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("branches on peekCmsConfig()?.socialSyndication, the same env-gated shape monitoring/heatmaps/events/reviews/referrals use", () => {
		expect(pageSrc).toContain("peekCmsConfig()?.socialSyndication");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(pageSrc).toContain("RequiresIntegration");
		expect(pageSrc).toContain('stubKey="socialSyndication"');
	});

	it("never renders a secret value — only presence (connected/not-connected), like the email page", () => {
		expect(pageSrc).not.toMatch(/\{.*appPassword\}/);
		expect(pageSrc).not.toMatch(/\{.*accessToken\}/);
		expect(pageSrc).toContain("connectedProviders.has(");
	});

	it("does not import sqlite-runtime directly (pages-no-direct-sqlite) — status lookup lives in src/social-syndication.ts", () => {
		expect(pageSrc).not.toContain("sqlite-runtime");
		expect(pageSrc).toContain("listConnectedSocialSyndicationProviders");
	});

	it("does not use an object-interpolation call on t() — getPageT only supports a string fallback, not param substitution", () => {
		expect(pageSrc).not.toMatch(/t\([^)]*,\s*\{\s*\w+:/);
	});

	it("submits both connect forms with CSRF protection to the dedicated action", () => {
		const csrfCount = (pageSrc.match(/CsrfInput/g) ?? []).length;
		expect(csrfCount).toBeGreaterThanOrEqual(2);
		expect(pageSrc).toContain('action="/ap-admin/actions/social-syndication-connect"');
	});

	it("states the best-effort/no-retry/no-delivery-guarantee note", () => {
		expect(pageSrc).toContain("socialSyndication.bestEffortNote");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(pageSrc).toContain("getPageT(locale)");
	});
});

describe("actions/social-syndication-connect.ts — dedicated connect action, store logic kept out of pages/", () => {
	it("exists", () => {
		expect(existsSync(actionPath)).toBe(true);
	});

	it("is wrapped in withAdminFormAction gated on services:manage", () => {
		expect(actionSrc).toContain("withAdminFormAction");
		expect(actionSrc).toContain('requireAction: "services:manage"');
	});

	it("delegates all store/secret logic to connectSocialSyndicationProvider rather than touching the repository itself", () => {
		expect(actionSrc).toContain("connectSocialSyndicationProvider");
		expect(actionSrc).not.toContain("sqlite-runtime");
		expect(actionSrc).not.toContain("admin-store-dispatch");
	});
});

describe("src/social-syndication.ts — the sealed-secret mechanism", () => {
	it("never stores appPassword/accessToken as plaintext CmsConfig fields — only handle/instanceUrl are declarative", () => {
		const configTypeSrc = readFileSync(
			path.resolve(import.meta.dirname, "../src/config-service-types.ts"),
			"utf8",
		);
		const match = configTypeSrc.match(/export interface SocialSyndicationConfig \{[\s\S]*?\n\}/);
		expect(match).toBeTruthy();
		expect(match?.[0]).not.toContain("appPassword");
		expect(match?.[0]).not.toContain("accessToken");
	});

	it("seals credentials via repository.connect(), the same envelope path every other domain's secrets use", () => {
		expect(libSrc).toContain("repo.connect(");
		expect(libSrc).toContain("sqlite-runtime/integrations-d1.js");
	});

	it("reads credentials only via findSecret (the audit:integration-secrets-mandated read path)", () => {
		expect(libSrc).toContain("repo.findSecret<TFields>(SOCIAL_SYNDICATION_DOMAIN");
	});

	it("verifies a credential before ever sealing it", () => {
		expect(libSrc).toContain("verifyBlueskyCredentials");
		expect(libSrc).toContain("verifyMastodonCredentials");
	});

	it("is not built on the IntegrationDomain registry — SOCIAL_SYNDICATION_DOMAIN is a plain string, not added to the registry union", () => {
		const registryDataSrc = readFileSync(
			path.resolve(import.meta.dirname, "../src/integrations/registry-data.ts"),
			"utf8",
		);
		expect(registryDataSrc).not.toContain("social-syndication");
	});

	it("documents the EXISTING onContentPublish dispatch point being reused, and implements no actual retry/queue/scheduler infrastructure", () => {
		expect(libSrc).toContain("NOT new infrastructure");
		expect(libSrc).toContain("There is no retry, queue, or scheduler");
		expect(libSrc).not.toContain("setInterval");
		expect(libSrc).not.toContain("cron");
	});

	it("runSocialSyndicationOnPublish is called from runtime-actions-content.ts's existing dispatch call site, wrapped in try/catch", () => {
		const runtimeContentSrc = readFileSync(
			path.resolve(import.meta.dirname, "../src/runtime-actions-content.ts"),
			"utf8",
		);
		expect(runtimeContentSrc).toContain("runSocialSyndicationOnPublish");
		const callIndex = runtimeContentSrc.indexOf("runSocialSyndicationOnPublish(pluginEvent");
		expect(callIndex).toBeGreaterThan(-1);
		const surrounding = runtimeContentSrc.slice(
			runtimeContentSrc.lastIndexOf("try {", callIndex),
			callIndex + 200,
		);
		expect(surrounding).toContain("catch");
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

	it("admin-routes-definitions.ts points /ap-admin/social-syndication at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/social-syndication",\s*entrypoint: "social-syndication\.astro"/,
		);
	});

	it("registers the new social-syndication-connect action route", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/actions\/social-syndication-connect"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\t"social-syndication": \{/m);
	});

	it("integration-manifest-data.ts marks social-syndication status: env-gated with configField, keeping services:manage", () => {
		const entry = manifestSrc.match(
			/\{\s*href: "\/ap-admin\/social-syndication",[\s\S]*?\n\t\},/,
		)?.[0];
		expect(entry).toBeDefined();
		expect(entry).toContain('status: "env-gated"');
		expect(entry).toContain('configField: "socialSyndication"');
		expect(entry).toContain('requiredAction: "services:manage"');
		expect(entry).not.toContain("coming-soon");
	});

	it("has no static nav-action-map entry anymore (avoids a duplicate sidebar entry alongside the new INTEGRATIONS entry)", () => {
		expect(navActionMapSrc).not.toMatch(/\{\s*href: "\/ap-admin\/social-syndication"/);
	});

	it("has no static mappedLeaf in AdminLayout.astro anymore", () => {
		expect(adminLayoutSrc).not.toMatch(/mappedLeaf\("\/ap-admin\/social-syndication"/);
	});

	it("adminStubs.socialSyndication's configHint uses the real declarative shape (handle), not the old aspirational providers array", () => {
		expect(stubCatalogSrc).toContain("bluesky: { handle:");
		expect(stubCatalogSrc).not.toContain('providers: ["bluesky", "mastodon"]');
	});

	it("excludes X/Twitter and LinkedIn from configurable options with explicit reasons, not silent omission", () => {
		expect(stubCatalogSrc).toContain("X / Twitter (not available");
		expect(stubCatalogSrc).toContain("per post with a link");
		expect(stubCatalogSrc).toContain("LinkedIn (not available");
		expect(stubCatalogSrc).toContain("Marketing Developer Platform");
	});
});
