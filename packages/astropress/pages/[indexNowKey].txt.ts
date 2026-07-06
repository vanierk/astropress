import {
	getAstropressRootSecretCandidates,
	resolveCanonicalOrigin,
} from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { deriveIndexNowKey } from "../src/sitemap-indexnow.js";

/**
 * GET /:indexNowKey.txt
 *
 * IndexNow's protocol requires the submitted key to be verifiable at
 * `${origin}/${key}.txt` before a participating search engine will accept a
 * notification as authenticated. The key is derived deterministically
 * (see sitemap-indexnow.ts), so this route only needs to recompute it and
 * compare — nothing about the key itself is persisted.
 *
 * Astro prioritizes static filenames over this dynamic segment, so this
 * never shadows /robots.txt or /llms.txt.
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
	const rootSecret = getAstropressRootSecretCandidates(locals)[0];
	if (!rootSecret) {
		return new Response("Not found", { status: 404 });
	}
	const origin = resolveCanonicalOrigin(request);
	const key = deriveIndexNowKey(origin, rootSecret);
	if (params.indexNowKey !== key) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(key, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
