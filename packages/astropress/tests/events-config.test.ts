import { afterEach, describe, expect, it } from "vitest";

import { type EventsConfig, getCmsConfig, type peekCmsConfig, registerCms } from "../src/config";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");

function restoreConfig(config: ReturnType<typeof peekCmsConfig>) {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] =
		config ?? null;
}

afterEach(() => {
	restoreConfig(null);
});

describe("EventsConfig types", () => {
	it("cal.com events config is correctly typed", () => {
		const config: EventsConfig = { provider: "cal", calLink: "your-team/30min" };
		expect(config.provider).toBe("cal");
		expect(config.calLink).toBe("your-team/30min");
	});

	it("calendly events config uses url", () => {
		const config: EventsConfig = { provider: "calendly", url: "https://calendly.com/your-team" };
		expect(config.url).toBe("https://calendly.com/your-team");
	});

	it("custom events config uses embedSrc", () => {
		const config: EventsConfig = {
			provider: "custom",
			embedSrc: "<div>custom embed</div>",
		};
		expect(config.embedSrc).toContain("custom embed");
	});

	it("all supported events providers are valid", () => {
		const providers: EventsConfig["provider"][] = ["cal", "calendly", "custom"];
		for (const provider of providers) {
			const config: EventsConfig = { provider };
			expect(config.provider).toBe(provider);
		}
	});

	it("label is optional", () => {
		const withLabel: EventsConfig = {
			provider: "cal",
			calLink: "team/30min",
			label: "Book office hours",
		};
		const withoutLabel: EventsConfig = { provider: "cal", calLink: "team/30min" };
		expect(withLabel.label).toBe("Book office hours");
		expect(withoutLabel.label).toBeUndefined();
	});
});

describe("registerCms with events field", () => {
	it("registerCms accepts events config", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			events: { provider: "cal", calLink: "your-team/30min" },
		});

		const config = getCmsConfig();
		expect(config.events?.provider).toBe("cal");
		expect(config.events?.calLink).toBe("your-team/30min");
	});

	it("events is optional — absent when not configured", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const config = getCmsConfig();
		expect(config.events).toBeUndefined();
	});
});
