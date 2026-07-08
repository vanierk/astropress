import { afterEach, describe, expect, it } from "vitest";

import { getCmsConfig, type peekCmsConfig, type ReviewsConfig, registerCms } from "../src/config";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");

function restoreConfig(config: ReturnType<typeof peekCmsConfig>) {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] =
		config ?? null;
}

afterEach(() => {
	restoreConfig(null);
});

describe("ReviewsConfig types", () => {
	it("trustpilot reviews config is correctly typed", () => {
		const config: ReviewsConfig = {
			provider: "trustpilot",
			businessUnitId: "abc123",
			templateId: "56278e9abfbbba0bdcd568bc",
		};
		expect(config.provider).toBe("trustpilot");
		expect(config.businessUnitId).toBe("abc123");
		expect(config.templateId).toBe("56278e9abfbbba0bdcd568bc");
	});

	it("custom reviews config uses embedSrc", () => {
		const config: ReviewsConfig = {
			provider: "custom",
			embedSrc: "<div>custom reviews embed</div>",
		};
		expect(config.embedSrc).toContain("custom reviews embed");
	});

	it("all supported reviews providers are valid", () => {
		const providers: ReviewsConfig["provider"][] = ["trustpilot", "custom"];
		for (const provider of providers) {
			const config: ReviewsConfig = { provider };
			expect(config.provider).toBe(provider);
		}
	});

	it("label is optional", () => {
		const withLabel: ReviewsConfig = {
			provider: "trustpilot",
			businessUnitId: "abc",
			label: "Customer reviews",
		};
		const withoutLabel: ReviewsConfig = { provider: "trustpilot", businessUnitId: "abc" };
		expect(withLabel.label).toBe("Customer reviews");
		expect(withoutLabel.label).toBeUndefined();
	});
});

describe("registerCms with reviews field", () => {
	it("registerCms accepts reviews config", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			reviews: { provider: "trustpilot", businessUnitId: "abc123", templateId: "tmpl-1" },
		});

		const config = getCmsConfig();
		expect(config.reviews?.provider).toBe("trustpilot");
		expect(config.reviews?.businessUnitId).toBe("abc123");
	});

	it("reviews is optional — absent when not configured", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const config = getCmsConfig();
		expect(config.reviews).toBeUndefined();
	});
});
