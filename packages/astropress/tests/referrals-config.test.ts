import { afterEach, describe, expect, it } from "vitest";

import { getCmsConfig, type peekCmsConfig, type ReferralsConfig, registerCms } from "../src/config";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");

function restoreConfig(config: ReturnType<typeof peekCmsConfig>) {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] =
		config ?? null;
}

afterEach(() => {
	restoreConfig(null);
});

describe("ReferralsConfig types", () => {
	it("rewardful referrals config is correctly typed", () => {
		const config: ReferralsConfig = { provider: "rewardful", rewardfulPublicKey: "abc123" };
		expect(config.provider).toBe("rewardful");
		expect(config.rewardfulPublicKey).toBe("abc123");
	});

	it("firstpromoter referrals config uses firstPromoterPublicId", () => {
		const config: ReferralsConfig = {
			provider: "firstpromoter",
			firstPromoterPublicId: "abcdef12",
		};
		expect(config.firstPromoterPublicId).toBe("abcdef12");
	});

	it("custom referrals config uses snippetSrc", () => {
		const config: ReferralsConfig = {
			provider: "custom",
			snippetSrc: "<script>window.myReferrals = true;</script>",
		};
		expect(config.snippetSrc).toContain("myReferrals");
	});

	it("all supported referrals providers are valid", () => {
		const providers: ReferralsConfig["provider"][] = ["rewardful", "firstpromoter", "custom"];
		for (const provider of providers) {
			const config: ReferralsConfig = { provider };
			expect(config.provider).toBe(provider);
		}
	});

	it("label is optional", () => {
		const withLabel: ReferralsConfig = {
			provider: "rewardful",
			rewardfulPublicKey: "abc",
			label: "Affiliate program",
		};
		const withoutLabel: ReferralsConfig = { provider: "rewardful", rewardfulPublicKey: "abc" };
		expect(withLabel.label).toBe("Affiliate program");
		expect(withoutLabel.label).toBeUndefined();
	});
});

describe("registerCms with referrals field", () => {
	it("registerCms accepts referrals config", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			referrals: { provider: "rewardful", rewardfulPublicKey: "abc123" },
		});

		const config = getCmsConfig();
		expect(config.referrals?.provider).toBe("rewardful");
		expect(config.referrals?.rewardfulPublicKey).toBe("abc123");
	});

	it("referrals is optional — absent when not configured", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const config = getCmsConfig();
		expect(config.referrals).toBeUndefined();
	});
});
