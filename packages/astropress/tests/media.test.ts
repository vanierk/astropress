import {
	getRuntimeMediaResolutionOptions,
	registerCms,
	resolveMediaUrl,
	resolveRuntimeMediaUrl,
	wrapImageCdnUrl,
} from "@astropress-diy/astropress";
import { afterEach, describe, expect, it } from "vitest";

const sampleRecord = {
	id: "img-001",
	sourceUrl: "https://legacy.example.org/wp-content/uploads/hero.jpg",
	localPath: "/images/home/community-garden-hero.jpg",
	r2Key: "images/home/community-garden-hero.jpg",
};

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");
function resetCmsConfig() {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] = null;
}

describe("resolveMediaUrl()", () => {
	it("returns localPath in development mode", () => {
		const url = resolveMediaUrl(sampleRecord, { mode: "development" });
		expect(url).toBe(sampleRecord.localPath);
	});

	it("development mode short-circuits even when r2BaseUrl is set (kills dev-branch mutants)", () => {
		// Critical: dev mode must NOT build an R2 URL even if one is configured.
		// Original returns localPath; if the dev short-circuit were removed we'd
		// fall through to the deployment branch and synthesize an R2 URL.
		const url = resolveMediaUrl(sampleRecord, {
			mode: "development",
			r2BaseUrl: "https://cdn.example.org",
		});
		expect(url).toBe(sampleRecord.localPath);
		expect(url).not.toContain("cdn.example.org");
	});

	it("returns localPath in deployment mode when no r2BaseUrl is provided", () => {
		const url = resolveMediaUrl(sampleRecord, { mode: "deployment" });
		expect(url).toBe(sampleRecord.localPath);
	});

	it("returns r2 URL in deployment mode when r2BaseUrl is provided", () => {
		const url = resolveMediaUrl(sampleRecord, {
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org",
		});
		expect(url).toBe("https://cdn.example.org/images/home/community-garden-hero.jpg");
	});

	it("strips trailing slash from r2BaseUrl before joining", () => {
		const url = resolveMediaUrl(sampleRecord, {
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org/",
		});
		expect(url).not.toContain("//images");
		expect(url).toBe("https://cdn.example.org/images/home/community-garden-hero.jpg");
	});

	it("keeps localPath when no r2 key exists", () => {
		const url = resolveMediaUrl(
			{ ...sampleRecord, r2Key: null },
			{ mode: "deployment", r2BaseUrl: "https://cdn.example.org" },
		);
		expect(url).toBe(sampleRecord.localPath);
	});

	it("builds runtime media options from env defaults", () => {
		expect(getRuntimeMediaResolutionOptions()).toEqual({
			mode: "development",
			r2BaseUrl: undefined,
		});
	});

	it("switches runtime media options to deployment when an R2 base URL is configured", () => {
		expect(
			getRuntimeMediaResolutionOptions({
				runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
			} as App.Locals),
		).toEqual({
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org",
		});
	});

	it("resolves runtime media URLs with local defaults", () => {
		expect(resolveRuntimeMediaUrl(sampleRecord)).toBe(sampleRecord.localPath);
	});

	it("resolves runtime media URLs to R2 when configured through runtime bindings", () => {
		expect(
			resolveRuntimeMediaUrl(sampleRecord, {
				runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
			} as App.Locals),
		).toBe("https://cdn.example.org/images/home/community-garden-hero.jpg");
	});
});

// Mandatory regression coverage for the imageCdn extension: resolveMediaUrl
// is a public-API hot path called on every published page's render, so
// "additive when unconfigured" and "never wraps in dev / on the localPath
// fallback" must be proven, not assumed.
describe("resolveMediaUrl() — imageCdn extension safety guards", () => {
	afterEach(() => {
		resetCmsConfig();
	});

	const cloudinaryConfig = { provider: "cloudinary" as const, cloudName: "demo" };

	it("(a) additive-noop: dev mode output is byte-identical whether or not imageCdn is passed", () => {
		const without = resolveMediaUrl(sampleRecord, { mode: "development" });
		const withImageCdn = resolveMediaUrl(sampleRecord, {
			mode: "development",
			imageCdn: cloudinaryConfig,
		});
		expect(withImageCdn).toBe(without);
		expect(withImageCdn).toBe(sampleRecord.localPath);
	});

	it("(a) additive-noop: deployment+R2 output is byte-identical when imageCdn is omitted vs. undefined", () => {
		const baseOptions = { mode: "deployment" as const, r2BaseUrl: "https://cdn.example.org" };
		const omitted = resolveMediaUrl(sampleRecord, baseOptions);
		const explicitUndefined = resolveMediaUrl(sampleRecord, {
			...baseOptions,
			imageCdn: undefined,
		});
		expect(explicitUndefined).toBe(omitted);
		expect(omitted).toBe("https://cdn.example.org/images/home/community-garden-hero.jpg");
	});

	it("(a) additive-noop: local-fallback output is byte-identical whether or not imageCdn is passed", () => {
		const recordWithoutR2Key = { ...sampleRecord, r2Key: null };
		const without = resolveMediaUrl(recordWithoutR2Key, {
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org",
		});
		const withImageCdn = resolveMediaUrl(recordWithoutR2Key, {
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org",
			imageCdn: cloudinaryConfig,
		});
		expect(withImageCdn).toBe(without);
		expect(withImageCdn).toBe(sampleRecord.localPath);
	});

	it("(b) never wraps in development mode, even when imageCdn is configured and r2BaseUrl/r2Key are both present", () => {
		const url = resolveMediaUrl(sampleRecord, {
			mode: "development",
			r2BaseUrl: "https://cdn.example.org",
			imageCdn: cloudinaryConfig,
		});
		expect(url).toBe(sampleRecord.localPath);
		expect(url).not.toContain("res.cloudinary.com");
	});

	it("(c) never wraps the localPath fallback, even when imageCdn is configured (deployment mode, missing r2Key)", () => {
		const url = resolveMediaUrl(
			{ ...sampleRecord, r2Key: null },
			{
				mode: "deployment",
				r2BaseUrl: "https://cdn.example.org",
				imageCdn: cloudinaryConfig,
			},
		);
		expect(url).toBe(sampleRecord.localPath);
		expect(url).not.toContain("res.cloudinary.com");
	});

	it("(c) never wraps the localPath fallback, even when imageCdn is configured (deployment mode, missing r2BaseUrl)", () => {
		const url = resolveMediaUrl(sampleRecord, {
			mode: "deployment",
			imageCdn: cloudinaryConfig,
		});
		expect(url).toBe(sampleRecord.localPath);
		expect(url).not.toContain("res.cloudinary.com");
	});

	it("(d) wraps only a real, resolved R2 URL in deployment mode when imageCdn is configured", () => {
		const url = resolveMediaUrl(sampleRecord, {
			mode: "deployment",
			r2BaseUrl: "https://cdn.example.org",
			imageCdn: cloudinaryConfig,
		});
		expect(url).toBe(
			"https://res.cloudinary.com/demo/image/fetch/https://cdn.example.org/images/home/community-garden-hero.jpg",
		);
	});
});

describe("getRuntimeMediaResolutionOptions() — reads imageCdn from CmsConfig", () => {
	afterEach(() => {
		resetCmsConfig();
	});

	it("imageCdn is absent when registerCms was never called with it (additive-noop at the runtime-options layer)", () => {
		const options = getRuntimeMediaResolutionOptions();
		expect(options.imageCdn).toBeUndefined();
	});

	it("reads the configured imageCdn field from CmsConfig", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			imageCdn: { provider: "imgix", sourceHostname: "my-source.imgix.net" },
		});

		const options = getRuntimeMediaResolutionOptions();
		expect(options.imageCdn).toEqual({ provider: "imgix", sourceHostname: "my-source.imgix.net" });
	});

	it("end-to-end: resolveRuntimeMediaUrl wraps through the configured provider", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			imageCdn: { provider: "bunny", pullZoneHostname: "my-zone.b-cdn.net" },
		});

		const url = resolveRuntimeMediaUrl(sampleRecord, {
			runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
		} as App.Locals);
		expect(url).toBe("https://my-zone.b-cdn.net/images/home/community-garden-hero.jpg");
	});

	it("end-to-end: resolveRuntimeMediaUrl in development mode ignores the configured provider entirely", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			imageCdn: { provider: "bunny", pullZoneHostname: "my-zone.b-cdn.net" },
		});

		expect(resolveRuntimeMediaUrl(sampleRecord)).toBe(sampleRecord.localPath);
	});
});

describe("wrapImageCdnUrl() — pure, provider-template wrapping", () => {
	const resolvedUrl = "https://cdn.example.org/images/home/community-garden-hero.jpg";

	describe("cloudinary", () => {
		it("wraps in the fetch delivery type", () => {
			expect(wrapImageCdnUrl(resolvedUrl, { provider: "cloudinary", cloudName: "demo" })).toBe(
				`https://res.cloudinary.com/demo/image/fetch/${resolvedUrl}`,
			);
		});

		it("inserts defaultParams as a leading path segment", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, {
					provider: "cloudinary",
					cloudName: "demo",
					defaultParams: "w_800,q_auto,f_auto",
				}),
			).toBe(`https://res.cloudinary.com/demo/image/fetch/w_800,q_auto,f_auto/${resolvedUrl}`);
		});

		it("returns the unwrapped URL when cloudName is missing", () => {
			expect(wrapImageCdnUrl(resolvedUrl, { provider: "cloudinary" })).toBe(resolvedUrl);
		});
	});

	describe("imgix", () => {
		it("wraps as a URI-encoded web-proxy path", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, { provider: "imgix", sourceHostname: "my-source.imgix.net" }),
			).toBe(`https://my-source.imgix.net/${encodeURIComponent(resolvedUrl)}`);
		});

		it("appends defaultParams as a query string", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, {
					provider: "imgix",
					sourceHostname: "my-source.imgix.net",
					defaultParams: "w=800&auto=format",
				}),
			).toBe(`https://my-source.imgix.net/${encodeURIComponent(resolvedUrl)}?w=800&auto=format`);
		});

		it("returns the unwrapped URL when sourceHostname is missing", () => {
			expect(wrapImageCdnUrl(resolvedUrl, { provider: "imgix" })).toBe(resolvedUrl);
		});
	});

	describe("bunny", () => {
		it("replaces the origin host with the pull zone hostname, keeping the path", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, { provider: "bunny", pullZoneHostname: "my-zone.b-cdn.net" }),
			).toBe("https://my-zone.b-cdn.net/images/home/community-garden-hero.jpg");
		});

		it("appends defaultParams as a query string", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, {
					provider: "bunny",
					pullZoneHostname: "my-zone.b-cdn.net",
					defaultParams: "width=800&quality=80",
				}),
			).toBe(
				"https://my-zone.b-cdn.net/images/home/community-garden-hero.jpg?width=800&quality=80",
			);
		});

		it("returns the unwrapped URL when pullZoneHostname is missing", () => {
			expect(wrapImageCdnUrl(resolvedUrl, { provider: "bunny" })).toBe(resolvedUrl);
		});

		it("returns the unwrapped URL when the resolved URL is not a parseable URL", () => {
			expect(
				wrapImageCdnUrl("not-a-url", { provider: "bunny", pullZoneHostname: "my-zone.b-cdn.net" }),
			).toBe("not-a-url");
		});
	});

	describe("custom", () => {
		it("substitutes the {url} placeholder", () => {
			expect(
				wrapImageCdnUrl(resolvedUrl, {
					provider: "custom",
					urlTemplate: "https://cdn.example.net/proxy?src={url}",
				}),
			).toBe(`https://cdn.example.net/proxy?src=${resolvedUrl}`);
		});

		it("returns the unwrapped URL when urlTemplate is missing", () => {
			expect(wrapImageCdnUrl(resolvedUrl, { provider: "custom" })).toBe(resolvedUrl);
		});
	});
});
