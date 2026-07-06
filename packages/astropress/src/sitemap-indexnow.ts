/**
 * IndexNow submission for the generated sitemap.
 *
 * Deliberately minimal: a single authenticated ping to the IndexNow API
 * (https://www.indexnow.org) telling participating search engines (Bing,
 * Yandex, Seznam, and others that honor the protocol) that the site's URLs
 * changed. No OAuth, no scheduler, no coverage/indexing-status tracking —
 * IndexNow itself is fire-and-forget; it does not report back whether a URL
 * was indexed. The admin page's copy says exactly that.
 *
 * The IndexNow key is derived deterministically (KMAC256 over the origin +
 * root secret) rather than stored, so nothing new needs persisting for the
 * key itself — only the "last submitted at" timestamp, which reuses the
 * existing `/sitemap.xml` system-route settings record.
 */
import { createKmacDigest } from "./crypto-primitives.js";
import type { Actor } from "./persistence-types.js";
import { getRuntimeSystemRoute, saveRuntimeSystemRoute } from "./runtime-route-registry-system.js";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY_LENGTH = 16;

export function deriveIndexNowKey(origin: string, rootSecret: string): string {
	return createKmacDigest(origin, rootSecret, "indexnow-key", INDEXNOW_KEY_LENGTH);
}

export interface IndexNowSubmitDeps {
	readonly fetch?: typeof fetch;
}

export type IndexNowSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * POSTs a bulk URL notification to the IndexNow API. `key` must be reachable
 * at `${origin}/${key}.txt` (see `pages/[indexNowKey].txt.ts`) for
 * participating engines to accept the submission as authenticated.
 */
export async function submitIndexNow(
	origin: string,
	key: string,
	urls: readonly string[],
	deps: IndexNowSubmitDeps = {},
): Promise<IndexNowSubmitResult> {
	const fetchImpl = deps.fetch ?? fetch;
	let host: string;
	try {
		host = new URL(origin).host;
	} catch {
		return { ok: false, error: "The configured site origin is not a valid URL." };
	}

	let res: Response;
	try {
		res = await fetchImpl(INDEXNOW_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				host,
				key,
				keyLocation: `${origin}/${key}.txt`,
				urlList: urls,
			}),
		});
	} catch {
		return { ok: false, error: "Could not reach the IndexNow API — check network connectivity." };
	}

	if (res.status === 200 || res.status === 202) {
		return { ok: true };
	}
	if (res.status === 400) {
		return { ok: false, error: "IndexNow rejected the request as malformed (HTTP 400)." };
	}
	if (res.status === 403) {
		return {
			ok: false,
			error: "IndexNow could not verify the key file at the expected location (HTTP 403).",
		};
	}
	if (res.status === 422) {
		return { ok: false, error: "IndexNow rejected one or more submitted URLs (HTTP 422)." };
	}
	if (res.status === 429) {
		return {
			ok: false,
			error: "IndexNow rate-limited this submission (HTTP 429) — try again later.",
		};
	}
	return { ok: false, error: `IndexNow returned an unexpected response (HTTP ${res.status}).` };
}

export async function getIndexNowLastSubmittedAt(
	locals?: App.Locals | null,
): Promise<string | null> {
	const route = await getRuntimeSystemRoute("/sitemap.xml", locals);
	const settings = route?.settings as
		| { indexNow?: { lastSubmittedAt?: string } }
		| null
		| undefined;
	return settings?.indexNow?.lastSubmittedAt ?? null;
}

/**
 * Records the submission timestamp on the existing `/sitemap.xml`
 * system-route settings record, preserving excludedPaths/extraUrls (and any
 * other settings) already saved there. `system-route-save.ts` preserves this
 * `indexNow` sub-object symmetrically when the admin re-saves the sitemap
 * settings form, so the two writers never clobber each other.
 */
export async function recordIndexNowSubmission(
	actor: Actor,
	locals?: App.Locals | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const existing = await getRuntimeSystemRoute("/sitemap.xml", locals);
	const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
	return saveRuntimeSystemRoute(
		"/sitemap.xml",
		{
			title: existing?.title ?? "Sitemap",
			summary: existing?.summary ?? "",
			bodyHtml: existing?.bodyHtml ?? "",
			settings: {
				...existingSettings,
				indexNow: { lastSubmittedAt: new Date().toISOString() },
			},
			revisionNote: "IndexNow submission",
		},
		actor,
		locals,
	);
}
