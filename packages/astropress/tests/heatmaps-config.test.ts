import { afterEach, describe, expect, it } from "vitest";
import { getCmsConfig, type HeatmapsConfig, type peekCmsConfig, registerCms } from "../src/config";
import { resolveHeatmapsSnippet, resolveHeatmapsSnippetConsentAware } from "../src/heatmaps.js";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");

function restoreConfig(config: ReturnType<typeof peekCmsConfig>) {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] =
		config ?? null;
}

afterEach(() => {
	restoreConfig(null);
});

describe("HeatmapsConfig types", () => {
	it("clarity heatmaps config is correctly typed", () => {
		const config: HeatmapsConfig = { type: "clarity", projectId: "abc123" };
		expect(config.type).toBe("clarity");
		expect(config.projectId).toBe("abc123");
	});

	it("hotjar heatmaps config accepts hjid and optional hjsv", () => {
		const config: HeatmapsConfig = { type: "hotjar", hjid: "1234567", hjsv: "6" };
		expect(config.hjid).toBe("1234567");
		expect(config.hjsv).toBe("6");
	});

	it("custom heatmaps config uses snippetSrc", () => {
		const config: HeatmapsConfig = {
			type: "custom",
			snippetSrc: "<script>window.myHeatmap = true;</script>",
		};
		expect(config.snippetSrc).toContain("myHeatmap");
	});

	it("all supported heatmaps types are valid", () => {
		const types: HeatmapsConfig["type"][] = ["clarity", "hotjar", "custom"];
		for (const type of types) {
			const config: HeatmapsConfig = { type };
			expect(config.type).toBe(type);
		}
	});

	it("label is optional", () => {
		const withLabel: HeatmapsConfig = { type: "clarity", projectId: "abc", label: "My Heatmaps" };
		const withoutLabel: HeatmapsConfig = { type: "clarity", projectId: "abc" };
		expect(withLabel.label).toBe("My Heatmaps");
		expect(withoutLabel.label).toBeUndefined();
	});
});

describe("registerCms with heatmaps field", () => {
	it("registerCms accepts heatmaps config", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			heatmaps: { type: "clarity", projectId: "abc123" },
		});

		const config = getCmsConfig();
		expect(config.heatmaps?.type).toBe("clarity");
		expect(config.heatmaps?.projectId).toBe("abc123");
	});

	it("heatmaps is optional — absent when not configured", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const config = getCmsConfig();
		expect(config.heatmaps).toBeUndefined();
	});
});

describe("resolveHeatmapsSnippet", () => {
	it("returns empty string for null/undefined config", () => {
		expect(resolveHeatmapsSnippet(null)).toBe("");
		expect(resolveHeatmapsSnippet(undefined)).toBe("");
	});

	it("clarity: produces the Clarity IIFE bootstrap with the project ID", () => {
		const snippet = resolveHeatmapsSnippet({ type: "clarity", projectId: "abc123" });
		expect(snippet).toContain("<script>");
		expect(snippet).toContain("https://www.clarity.ms/tag/");
		expect(snippet).toContain("'abc123'");
		expect(snippet).toContain("</script>");
	});

	it("clarity: returns empty string when projectId is missing", () => {
		expect(resolveHeatmapsSnippet({ type: "clarity" })).toBe("");
	});

	it("clarity: snippet contains every line of the IIFE bootstrap and joins them with newlines (pins each generator line)", () => {
		const snippet = resolveHeatmapsSnippet({ type: "clarity", projectId: "proj_1" });
		// One distinguishing substring per generator line — a StringLiteral
		// mutation on any line would replace it with '' and lose the substring.
		expect(snippet).toContain("(function(c,l,a,r,i,t,y){");
		expect(snippet).toContain("c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)}");
		expect(snippet).toContain(
			't=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;',
		);
		expect(snippet).toContain("y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);");
		expect(snippet).toContain('})(window, document, "clarity", "script",');
		expect(snippet).toMatch(/<script>\n\(function\(c,l,a,r,i,t,y\)/);
	});

	it("hotjar: produces the Hotjar IIFE bootstrap with hjid and default hjsv", () => {
		const snippet = resolveHeatmapsSnippet({ type: "hotjar", hjid: "1234567" });
		expect(snippet).toContain("<script>");
		expect(snippet).toContain("hjid:'1234567'");
		expect(snippet).toContain("hjsv:'6'");
		expect(snippet).toContain("static.hotjar.com/c/hotjar-");
		expect(snippet).toContain("</script>");
	});

	it("hotjar: uses the explicit hjsv override when provided", () => {
		const snippet = resolveHeatmapsSnippet({ type: "hotjar", hjid: "1234567", hjsv: "7" });
		expect(snippet).toContain("hjsv:'7'");
		expect(snippet).not.toContain("hjsv:'6'");
	});

	it("hotjar: returns empty string when hjid is missing", () => {
		expect(resolveHeatmapsSnippet({ type: "hotjar" })).toBe("");
	});

	it("hotjar: snippet contains every line of the IIFE bootstrap and joins them with newlines (pins each generator line)", () => {
		const snippet = resolveHeatmapsSnippet({ type: "hotjar", hjid: "999" });
		expect(snippet).toContain("(function(h,o,t,j,a,r){");
		expect(snippet).toContain("h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};");
		expect(snippet).toContain("a=o.getElementsByTagName('head')[0];");
		expect(snippet).toContain("r=o.createElement('script');r.async=1;");
		expect(snippet).toContain("r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;");
		expect(snippet).toContain("a.appendChild(r);");
		expect(snippet).toContain(
			"})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');",
		);
		expect(snippet).toMatch(/<script>\n\(function\(h,o,t,j,a,r\)/);
	});

	it("custom: passes snippet through as-is", () => {
		const custom = "<script>window.myHeatmap = true;</script>";
		const snippet = resolveHeatmapsSnippet({ type: "custom", snippetSrc: custom });
		expect(snippet).toBe(custom);
	});

	it("custom: returns empty string when snippetSrc is absent", () => {
		expect(resolveHeatmapsSnippet({ type: "custom" })).toBe("");
	});

	it("unknown type falls through to default and returns empty string", () => {
		// Defensive branch for forward-compatible configs from a newer schema version
		expect(resolveHeatmapsSnippet({ type: "unknown-future-type" as never })).toBe("");
	});

	it("escJs escapes backslash, apostrophe, and newline inside the clarity project ID (prevents breaking out of the quoted argument)", () => {
		const snippet = resolveHeatmapsSnippet({
			type: "clarity",
			projectId: "proj\\test'one\ntwo",
		});
		expect(snippet).toContain("proj\\\\test\\'one\\ntwo");
		// The raw apostrophe must never appear unescaped — that would break out
		// of the quoted string and let arbitrary JS run.
		expect(snippet).not.toMatch(/'proj\\\\test'one/);
	});

	it("escJs escapes an injection attempt inside the hotjar hjid, so the payload's apostrophe never closes the quoted string", () => {
		const malicious = "123'};alert(document.cookie);({hjid:'123";
		const snippet = resolveHeatmapsSnippet({ type: "hotjar", hjid: malicious });
		// The raw, unescaped break-out sequence must never appear — every
		// apostrophe in the payload must be preceded by a backslash, so the
		// payload stays inert text inside the string instead of closing it
		// and letting `};alert(document.cookie);({` run as code.
		expect(snippet).not.toContain("hjid:'123'};alert");
		expect(snippet).toContain("hjid:'123\\'};alert(document.cookie);({hjid:\\'123'");
	});
});

describe("resolveHeatmapsSnippetConsentAware", () => {
	function makeRequest(headers: Record<string, string> = {}) {
		return new Request("https://example.com/", { headers });
	}

	const clarityConfig: HeatmapsConfig = { type: "clarity", projectId: "abc123" };

	it("returns snippet when no opt-out header", () => {
		const snippet = resolveHeatmapsSnippetConsentAware(clarityConfig, makeRequest());
		expect(snippet).toContain("clarity.ms");
	});

	it("returns empty string when DNT: 1", () => {
		const snippet = resolveHeatmapsSnippetConsentAware(clarityConfig, makeRequest({ DNT: "1" }));
		expect(snippet).toBe("");
	});

	it("returns empty string when Sec-GPC: 1", () => {
		const snippet = resolveHeatmapsSnippetConsentAware(
			clarityConfig,
			makeRequest({ "Sec-GPC": "1" }),
		);
		expect(snippet).toBe("");
	});

	it("returns empty string when config is null", () => {
		const snippet = resolveHeatmapsSnippetConsentAware(null, makeRequest());
		expect(snippet).toBe("");
	});
});
