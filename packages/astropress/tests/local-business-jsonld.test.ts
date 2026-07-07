/**
 * Verifies AstropressLocalBusinessJsonLd.astro mirrors the established typed
 * JSON-LD component pattern (JsonLd.astro base, WebSiteJsonLd sibling):
 * same escaping regex (injection safety), same script-tag emission, and the
 * expected LocalBusiness/PostalAddress/GeoCoordinates schema shape.
 *
 * Astro components in this repo are verified by source assertions (no
 * render harness is set up for unit tests) — same convention as
 * aeo-metadata.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsRoot = path.resolve(import.meta.dirname, "../components");
const localBusinessSrc = readFileSync(
	path.join(componentsRoot, "AstropressLocalBusinessJsonLd.astro"),
	"utf8",
);
const webSiteSrc = readFileSync(path.join(componentsRoot, "AstropressWebSiteJsonLd.astro"), "utf8");

function escapingLines(source: string): string[] {
	return source
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.includes(".replace(/<"));
}

describe("AstropressLocalBusinessJsonLd — mirrors the WebSiteJsonLd sibling", () => {
	it("uses the identical script-breakout escaping regex as WebSiteJsonLd", () => {
		const localEscaping = escapingLines(localBusinessSrc).map((l) => l.replace(/;$/, ""));
		const webSiteEscaping = escapingLines(webSiteSrc).map((l) => l.replace(/;$/, ""));
		expect(localEscaping).toEqual(webSiteEscaping);
		expect(localEscaping).toEqual([
			'.replace(/<\\/(script)/gi, "<\\\\/$1")',
			'.replace(/<(script)/gi, "<$1")',
		]);
	});

	it("emits via set:html on a script[type=application/ld+json], not raw prop interpolation", () => {
		expect(localBusinessSrc).toContain('<script type="application/ld+json" set:html={json}>');
		expect(webSiteSrc).toContain('<script type="application/ld+json" set:html={json}>');
	});

	it("JSON.stringifies the schema before escaping (never interpolates raw props into markup)", () => {
		expect(localBusinessSrc).toMatch(/const json = JSON\.stringify\(/);
	});
});

describe("AstropressLocalBusinessJsonLd — schema shape", () => {
	it("declares the required LocalBusiness + PostalAddress fields", () => {
		expect(localBusinessSrc).toContain('"@type": "LocalBusiness"');
		expect(localBusinessSrc).toContain('"@type": "PostalAddress"');
		expect(localBusinessSrc).toContain("streetAddress");
		expect(localBusinessSrc).toContain("addressLocality");
		expect(localBusinessSrc).toContain("addressRegion");
		expect(localBusinessSrc).toContain("postalCode");
		expect(localBusinessSrc).toContain("addressCountry");
	});

	it("conditionally includes telephone only when provided", () => {
		expect(localBusinessSrc).toMatch(/if\s*\(telephone\)\s*businessSchema\.telephone/);
	});

	it("conditionally includes openingHours only when a non-empty array is provided", () => {
		expect(localBusinessSrc).toMatch(/openingHours && openingHours\.length > 0/);
	});

	it("conditionally emits GeoCoordinates only when both lat and lng are provided", () => {
		expect(localBusinessSrc).toContain('"@type": "GeoCoordinates"');
		expect(localBusinessSrc).toMatch(/geoLatitude !== undefined && geoLongitude !== undefined/);
	});

	it("declares required (non-optional) props matching schema.org's required LocalBusiness fields", () => {
		expect(localBusinessSrc).toMatch(/name: string;/);
		expect(localBusinessSrc).toMatch(/streetAddress: string;/);
		expect(localBusinessSrc).toMatch(/telephone\?: string;/);
	});
});
