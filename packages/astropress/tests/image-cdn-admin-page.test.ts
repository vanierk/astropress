/**
 * Verifies image-cdn.astro follows monitoring.astro/live-chat.astro's exact
 * env-gated config+rewrite shape, never implies an upload pipeline was
 * built, and states the provider-dashboard prerequisite plainly. Astro
 * components in this repo are verified by source assertions (no render
 * harness set up for unit tests) — same convention as
 * live-chat-admin-page.test.ts / social-syndication-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const pagePath = path.join(pagesRoot, "image-cdn.astro");
const pageSrc = readFileSync(pagePath, "utf8");
const mediaSrc = readFileSync(path.resolve(import.meta.dirname, "../src/media.ts"), "utf8");

describe("image-cdn.astro — env-gated config+rewrite status page", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(pagePath)).toBe(true);
	});

	it("gates on services:manage — the same legitimate shared action monitoring/live-chat use", () => {
		expect(pageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("branches on peekCmsConfig()?.imageCdn, the same env-gated shape monitoring/heatmaps/live-chat use", () => {
		expect(pageSrc).toContain("peekCmsConfig()?.imageCdn");
	});

	it("shows RequiresIntegration when not configured", () => {
		expect(pageSrc).toContain("RequiresIntegration");
		expect(pageSrc).toContain('stubKey="imageCdn"');
	});

	it("states the provider-dashboard prerequisite plainly — Astropress does not provision it", () => {
		expect(pageSrc).toContain("imageCdn.dashboardPrereqNote");
	});

	it("shows the Cloudinary fetch-disabled-by-default note only for the cloudinary provider", () => {
		expect(pageSrc).toContain('config?.provider === "cloudinary"');
		expect(pageSrc).toContain("imageCdn.cloudinaryFetchDisabledNote");
	});

	it("states the CSP note honestly (img-src already allows https: by default)", () => {
		expect(pageSrc).toContain("imageCdn.cspNote");
	});

	it("shows a sample wrapped URL for verification using the real wrapImageCdnUrl function, not hand-rolled string logic", () => {
		expect(pageSrc).toContain("wrapImageCdnUrl(sampleOriginUrl, config)");
	});

	it("documents that no upload/migration pipeline was built, rather than silently omitting the distinction", () => {
		expect(pageSrc).toContain("no asset upload/migration");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(pageSrc).toContain("getPageT(locale)");
	});
});

describe("src/media.ts — the imageCdn wrap is behind strict, documented guards", () => {
	it("wrapImageCdnUrl is exported as a pure function", () => {
		expect(mediaSrc).toContain("export function wrapImageCdnUrl(");
	});

	it("resolveMediaUrl only calls wrapImageCdnUrl after computing the real R2 URL, never on the localPath fallback", () => {
		const fnBody = mediaSrc.slice(
			mediaSrc.indexOf("export function resolveMediaUrl"),
			mediaSrc.indexOf("export function getRuntimeMediaResolutionOptions"),
		);
		const localPathReturns = fnBody.match(/return record\.localPath;/g) ?? [];
		expect(localPathReturns.length).toBe(2); // dev-mode guard + missing r2BaseUrl/r2Key guard
		const wrapCallIndex = fnBody.indexOf("wrapImageCdnUrl(");
		expect(wrapCallIndex).toBeGreaterThan(-1);
		// The wrap call must appear after BOTH localPath early-returns, not before.
		const lastLocalPathReturnIndex = fnBody.lastIndexOf("return record.localPath;");
		expect(wrapCallIndex).toBeGreaterThan(lastLocalPathReturnIndex);
	});

	it("getRuntimeMediaResolutionOptions reads imageCdn from peekCmsConfig (safe, never throws if unregistered)", () => {
		expect(mediaSrc).toContain("imageCdn: peekCmsConfig()?.imageCdn");
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

	it("admin-routes-definitions.ts points /ap-admin/image-cdn at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/image-cdn",\s*entrypoint: "image-cdn\.astro"/,
		);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\t"image-cdn": \{/m);
	});

	it("integration-manifest-data.ts flips the EXISTING imageCdn entry to env-gated with configField, keeping services:manage", () => {
		const entry = manifestSrc.match(/\{\s*href: "\/ap-admin\/image-cdn",[\s\S]*?\n\t\},/)?.[0];
		expect(entry).toBeDefined();
		expect(entry).toContain('status: "env-gated"');
		expect(entry).toContain('configField: "imageCdn"');
		expect(entry).toContain('requiredAction: "services:manage"');
		expect(entry).not.toContain("coming-soon");

		const allMatches = manifestSrc.match(/href: "\/ap-admin\/image-cdn"/g) ?? [];
		expect(allMatches).toHaveLength(1);
	});

	it("adminStubs.imageCdn's configHint uses the real declarative shape, not the old process.env-based hint", () => {
		expect(stubCatalogSrc).toContain('imageCdn: { provider: "cloudinary", cloudName:');
		expect(stubCatalogSrc).not.toContain("process.env.CLOUDINARY_CLOUD");
	});

	it("demotes Cloudflare Images with the specific upload/storage + Cloudflare-proxied-DNS reason, not silent omission", () => {
		expect(stubCatalogSrc).toContain("Cloudflare Images (not available");
		expect(stubCatalogSrc).toContain("upload/storage-based");
		expect(stubCatalogSrc).toContain("Cloudflare-proxied DNS");
	});

	it("keeps Cloudinary/imgix/Bunny.net as the confirmed URL-rewrite providers", () => {
		expect(stubCatalogSrc).toContain(
			'{ name: "Cloudinary", href: "https://cloudinary.com", tag: "Recommended" }',
		);
		expect(stubCatalogSrc).toContain(
			'{ name: "imgix", href: "https://imgix.com", tag: "Recommended" }',
		);
		expect(stubCatalogSrc).toContain(
			'{ name: "Bunny.net", href: "https://bunny.net", tag: "Recommended" }',
		);
	});

	it("rewrites the 'enable image-pipeline routing' overclaim to the honest URL-rewrite framing", () => {
		expect(stubCatalogSrc).not.toContain("enable image-pipeline routing");
		expect(stubCatalogSrc).toContain(
			"Rewrites existing media URLs through the provider's on-the-fly transform proxy",
		);
	});
});
