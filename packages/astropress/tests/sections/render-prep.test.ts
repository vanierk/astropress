import { afterEach, describe, expect, it } from "vitest";
import { registerCms } from "../../src/config";
import {
	buildMediaUrlMap,
	collectMediaIds,
	type MediaLike,
	selectTestimonialsForSection,
} from "../../src/sections/render-prep";
import type { Section, TestimonialsSection } from "../../src/sections/schema";

const CMS_CONFIG_KEY = Symbol.for("astropress.cms-config");
function resetCmsConfig() {
	(globalThis as typeof globalThis & { [CMS_CONFIG_KEY]?: unknown })[CMS_CONFIG_KEY] = null;
}

describe("collectMediaIds", () => {
	it("returns ids from hero, image-text, gallery", () => {
		const sections: Section[] = [
			{
				id: "1",
				kind: "hero",
				headline: "h",
				alignment: "start",
				mediaId: "a",
			},
			{
				id: "2",
				kind: "image-text",
				heading: "x",
				body: "<p>x</p>",
				mediaId: "b",
				imageSide: "start",
			},
			{ id: "3", kind: "gallery", mediaIds: ["c", "d"], columns: 3 },
		];
		expect(collectMediaIds(sections).sort()).toEqual(["a", "b", "c", "d"]);
	});

	it("deduplicates repeated ids", () => {
		const sections: Section[] = [
			{
				id: "1",
				kind: "hero",
				headline: "h",
				alignment: "start",
				mediaId: "a",
			},
			{ id: "2", kind: "gallery", mediaIds: ["a", "a"], columns: 2 },
		];
		expect(collectMediaIds(sections)).toEqual(["a"]);
	});

	it("ignores empty / falsy ids", () => {
		const sections: Section[] = [
			{ id: "1", kind: "hero", headline: "h", alignment: "start" },
			{ id: "2", kind: "gallery", mediaIds: [""], columns: 2 },
		];
		expect(collectMediaIds(sections)).toEqual([]);
	});
});

describe("selectTestimonialsForSection", () => {
	const all = [
		{ id: "a", name: "A", quote: "q", featured: true, status: "approved" },
		{ id: "b", name: "B", quote: "q", featured: false, status: "approved" },
		{ id: "c", name: "C", quote: "q", featured: true, status: "pending" },
	];

	it("source=featured selects featured AND approved", () => {
		const sec: TestimonialsSection = {
			id: "t",
			kind: "testimonials",
			source: "featured",
			layout: "grid",
		};
		const picked = selectTestimonialsForSection(sec, all);
		expect(picked.map((p) => p.id)).toEqual(["a"]);
	});

	it("source=approved selects all approved", () => {
		const sec: TestimonialsSection = {
			id: "t",
			kind: "testimonials",
			source: "approved",
			layout: "grid",
		};
		const picked = selectTestimonialsForSection(sec, all);
		expect(picked.map((p) => p.id).sort()).toEqual(["a", "b"]);
	});

	it("source=ids selects exactly the requested ids", () => {
		const sec: TestimonialsSection = {
			id: "t",
			kind: "testimonials",
			source: "ids",
			layout: "grid",
			ids: ["b", "c"],
		};
		const picked = selectTestimonialsForSection(sec, all);
		expect(picked.map((p) => p.id).sort()).toEqual(["b", "c"]);
	});
});

// Mandatory regression coverage (item e): buildMediaUrlMap is the actual
// public-site render-path caller of resolveMediaUrl — the imageCdn
// extension must not change its output when imageCdn is unconfigured.
describe("buildMediaUrlMap — unaffected by the imageCdn extension when unconfigured", () => {
	afterEach(() => {
		resetCmsConfig();
	});

	const records: MediaLike[] = [
		{
			id: "img-1",
			sourceUrl: null,
			localPath: "/images/hero.jpg",
			r2Key: "images/hero.jpg",
		},
	];

	it("produces the same URL map before and after registerCms is called without imageCdn", () => {
		const before = buildMediaUrlMap(records, {
			runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
		} as App.Locals);

		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
		});

		const after = buildMediaUrlMap(records, {
			runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
		} as App.Locals);

		expect(after).toEqual(before);
		expect(after).toEqual({ "img-1": "https://cdn.example.org/images/hero.jpg" });
	});

	it("wraps URLs in the map when imageCdn is configured, without changing the map's keys", () => {
		registerCms({
			siteUrl: "https://example.com",
			templateKeys: [],
			seedPages: [],
			archives: [],
			translationStatus: [],
			imageCdn: { provider: "cloudinary", cloudName: "demo" },
		});

		const map = buildMediaUrlMap(records, {
			runtime: { env: { PUBLIC_R2_BASE_URL: "https://cdn.example.org" } },
		} as App.Locals);

		expect(Object.keys(map)).toEqual(["img-1"]);
		expect(map["img-1"]).toBe(
			"https://res.cloudinary.com/demo/image/fetch/https://cdn.example.org/images/hero.jpg",
		);
	});
});
