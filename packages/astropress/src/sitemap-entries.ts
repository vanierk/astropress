import { listRuntimeContentStates } from "./runtime-page-store.js";
import { getRuntimeSystemRoute } from "./runtime-route-registry-system.js";

export interface SitemapUrlEntry {
	loc: string;
	lastmod?: string;
	changefreq: string;
	priority: string;
}

/**
 * Computes the exact set of sitemap entries the public `/sitemap.xml` route
 * renders, honoring the excludedPaths/extraUrls settings saved via
 * system.astro's sitemap section (`getRuntimeSystemRoute("/sitemap.xml", ...)`).
 * Shared by `pages/sitemap.xml.ts` and `pages/ap-admin/sitemaps.astro` so the
 * admin-visible URL count and the generated XML can never drift apart.
 */
export async function computeSitemapEntries(
	origin: string,
	locals?: App.Locals | null,
): Promise<SitemapUrlEntry[]> {
	const all = await listRuntimeContentStates(locals);
	const published = all.filter((r) => r.status === "published");

	const posts = published.filter((r) => r.kind === "post" || r.kind == null);
	const pages = published.filter((r) => r.kind === "page");

	const sitemapRoute = await getRuntimeSystemRoute("/sitemap.xml", locals);
	const settings = sitemapRoute?.settings ?? null;
	const excludedPaths = new Set(
		Array.isArray(settings?.excludedPaths) ? (settings.excludedPaths as string[]) : [],
	);
	const extraUrls = Array.isArray(settings?.extraUrls) ? (settings.extraUrls as string[]) : [];

	const entries: SitemapUrlEntry[] = [];

	if (!excludedPaths.has("/")) {
		entries.push({ loc: `${origin}/`, changefreq: "weekly", priority: "1.0" });
	}

	for (const post of posts) {
		const path = `/blog/${post.slug}/`;
		if (excludedPaths.has(path)) continue;
		entries.push({
			loc: `${origin}${path}`,
			lastmod: post.updatedAt ? post.updatedAt.slice(0, 10) : undefined,
			changefreq: "monthly",
			priority: "0.7",
		});
	}

	for (const page of pages) {
		const path = `/${page.slug}/`;
		if (excludedPaths.has(path)) continue;
		entries.push({
			loc: `${origin}${path}`,
			lastmod: page.updatedAt ? page.updatedAt.slice(0, 10) : undefined,
			changefreq: "monthly",
			priority: "0.8",
		});
	}

	for (const url of extraUrls) {
		entries.push({ loc: url, changefreq: "monthly", priority: "0.5" });
	}

	return entries;
}
