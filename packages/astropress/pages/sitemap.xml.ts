import { resolveCanonicalOrigin } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { computeSitemapEntries } from "../src/sitemap-entries.js";

/**
 * GET /sitemap.xml
 *
 * Generates a sitemap for published posts and pages, honoring the
 * excludedPaths/extraUrls settings saved via the admin sitemap settings form
 * (system.astro) — see `computeSitemapEntries` for the shared logic, also
 * used by the admin sitemaps.astro page so the two never drift apart.
 * Works in both SSR (called at request time) and static (called at build time) modes.
 *
 * The origin is the configured canonical site origin (CmsConfig.siteUrl), falling
 * back to the request origin only when no siteUrl is registered. This keeps the
 * sitemap stable behind proxies/alternate hosts and prevents host-header poisoning.
 */
export const GET: APIRoute = async ({ request, locals }) => {
	const origin = resolveCanonicalOrigin(request);
	const entries = await computeSitemapEntries(origin, locals);

	const urlElements = entries
		.map((e) => {
			const parts = ["  <url>", `    <loc>${escapeXml(e.loc)}</loc>`];
			if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
			parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
			parts.push(`    <priority>${e.priority}</priority>`);
			parts.push("  </url>");
			return parts.join("\n");
		})
		.join("\n");

	const xml = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
		urlElements,
		"</urlset>",
	].join("\n");

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
