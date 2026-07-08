import { afterEach, describe, expect, it } from "vitest";

import { getCmsConfig, type LiveChatConfig, type peekCmsConfig, registerCms } from "../src/config";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");

function restoreConfig(config: ReturnType<typeof peekCmsConfig>) {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] =
		config ?? null;
}

afterEach(() => {
	restoreConfig(null);
});

describe("LiveChatConfig types", () => {
	it("crisp live chat config is correctly typed", () => {
		const config: LiveChatConfig = { provider: "crisp", websiteId: "abc-123" };
		expect(config.provider).toBe("crisp");
		expect(config.websiteId).toBe("abc-123");
	});

	it("tawkto live chat config uses propertyId + widgetId", () => {
		const config: LiveChatConfig = { provider: "tawkto", propertyId: "prop1", widgetId: "widget1" };
		expect(config.propertyId).toBe("prop1");
		expect(config.widgetId).toBe("widget1");
	});

	it("chatwoot live chat config uses websiteToken + baseUrl", () => {
		const config: LiveChatConfig = {
			provider: "chatwoot",
			websiteToken: "tok",
			baseUrl: "https://app.chatwoot.com",
		};
		expect(config.websiteToken).toBe("tok");
		expect(config.baseUrl).toBe("https://app.chatwoot.com");
	});

	it("custom live chat config uses snippetSrc", () => {
		const config: LiveChatConfig = {
			provider: "custom",
			snippetSrc: "<script>window.myChat = true;</script>",
		};
		expect(config.snippetSrc).toContain("myChat");
	});

	it("all supported live chat providers are valid", () => {
		const providers: LiveChatConfig["provider"][] = ["crisp", "tawkto", "chatwoot", "custom"];
		for (const provider of providers) {
			const config: LiveChatConfig = { provider };
			expect(config.provider).toBe(provider);
		}
	});

	it("does not include intercom as a configurable provider — heavier CSP footprint excluded from this build", () => {
		// @ts-expect-error — "intercom" is intentionally not part of the union
		const config: LiveChatConfig = { provider: "intercom" };
		expect(config).toBeDefined();
	});

	it("label is optional", () => {
		const withLabel: LiveChatConfig = {
			provider: "crisp",
			websiteId: "abc",
			label: "Support chat",
		};
		const withoutLabel: LiveChatConfig = { provider: "crisp", websiteId: "abc" };
		expect(withLabel.label).toBe("Support chat");
		expect(withoutLabel.label).toBeUndefined();
	});
});

describe("registerCms with liveChat field", () => {
	it("registerCms accepts liveChat config", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			liveChat: { provider: "crisp", websiteId: "abc-123" },
		});

		const config = getCmsConfig();
		expect(config.liveChat?.provider).toBe("crisp");
		expect(config.liveChat?.websiteId).toBe("abc-123");
	});

	it("liveChat is optional — absent when not configured", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const config = getCmsConfig();
		expect(config.liveChat).toBeUndefined();
	});
});
