/**
 * Social syndication — auto-post on publish to Bluesky and/or Mastodon.
 *
 * This is deliberately NOT built on the IntegrationDomain/registerProvider
 * connect-verify machinery (search/forms/analytics's shape): those domains
 * assume a single active provider per domain and drive a shared
 * IntegrationConnect UI. Social syndication needs Bluesky AND Mastodon
 * connected and readable SIMULTANEOUSLY, which the underlying repository
 * already supports (findSecret() is a plain keyed lookup, independent of
 * the isActive flag — see IntegrationsRepository) — it's only the
 * generic connect/disconnect/reverify/set-active admin actions and the
 * IntegrationConnect component that assume a single winner. So this module
 * calls the repository (connect/findSecret) directly, under the plain
 * string domain "social-syndication", with its own small connect action
 * and status page instead of reusing the shared IntegrationConnect flow.
 *
 * The actual publish hook is NOT new infrastructure: dispatchPluginContentEvent
 * already fires "onContentPublish" on every real publish
 * (runtime-actions-content.ts). runSocialSyndicationOnPublish() (bottom of
 * this file) is called directly from that exact call site, gated on
 * `socialSyndication` being configured — NOT routed through
 * CmsConfig.plugins/registerCms(), because config.ts sits underneath
 * admin-store-dispatch.ts's own dependency chain (sqlite-runtime/utils.ts
 * imports config.ts), so config.ts importing this module (which needs
 * admin-store-dispatch.ts for secret storage) would be circular (confirmed
 * via `bun run audit:deps:graph`). runtime-actions-content.ts is a
 * consumer of admin-store-dispatch.ts, not part of its dependency chain,
 * so it can safely import this module directly.
 *
 * Delivery is best-effort: a failed post to one network does not stop an
 * attempt to the other, and neither blocks nor fails the publish action —
 * the caller wraps runSocialSyndicationOnPublish in try/catch, the same
 * never-fail-the-action contract dispatchPluginContentEvent already
 * upholds for real plugins. There is no retry, queue, or scheduler — by
 * design, per the confirmed small scope.
 */
import { z } from "zod";
import { withLocalStoreFallback } from "./admin-store-dispatch.js";
import type { AstropressContentEvent } from "./cms-plugins.js";
import type { IntegrationErrorCode } from "./integration-error-sanitizer.js";
import { getAstropressRootSecret, getAstropressRootSecretCandidates } from "./runtime-env.js";
import { createD1IntegrationsRepository } from "./sqlite-runtime/integrations-d1.js";

export const SOCIAL_SYNDICATION_DOMAIN = "social-syndication";

export const BLUESKY_SECRET_FIELDS = z.object({
	handle: z.string().min(1),
	appPassword: z.string().min(1),
});
export type BlueskySecretFields = z.infer<typeof BLUESKY_SECRET_FIELDS>;

export const MASTODON_SECRET_FIELDS = z.object({
	instanceUrl: z.string().url(),
	accessToken: z.string().min(1),
});
export type MastodonSecretFields = z.infer<typeof MASTODON_SECRET_FIELDS>;

const BLUESKY_PDS_URL = "https://bsky.social";

export class SocialSyndicationVerifyError extends Error {
	constructor(public readonly code: IntegrationErrorCode) {
		super(code);
		this.name = "SocialSyndicationVerifyError";
	}
}

interface VerifyDeps {
	readonly fetch?: typeof fetch;
}

function mapStatusToErrorCode(status: number): IntegrationErrorCode {
	if (status === 401 || status === 403) return "INTEGRATION_AUTH_REJECTED";
	if (status === 404) return "INTEGRATION_NOT_FOUND";
	if (status === 429) return "INTEGRATION_RATE_LIMITED";
	return "INTEGRATION_VERIFY_FAILED";
}

/** Confirms a Bluesky handle + app password can authenticate, before sealing them. */
export async function verifyBlueskyCredentials(
	fields: BlueskySecretFields,
	ctx: { signal: AbortSignal },
	deps: VerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const response = await fetchImpl(`${BLUESKY_PDS_URL}/xrpc/com.atproto.server.createSession`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ identifier: fields.handle, password: fields.appPassword }),
		signal: ctx.signal,
	});
	if (!response.ok) throw new SocialSyndicationVerifyError(mapStatusToErrorCode(response.status));
}

/** Confirms a Mastodon instance URL + access token can authenticate, before sealing them. */
export async function verifyMastodonCredentials(
	fields: MastodonSecretFields,
	ctx: { signal: AbortSignal },
	deps: VerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const response = await fetchImpl(`${fields.instanceUrl}/api/v1/accounts/verify_credentials`, {
		headers: { Authorization: `Bearer ${fields.accessToken}` },
		signal: ctx.signal,
	});
	if (!response.ok) throw new SocialSyndicationVerifyError(mapStatusToErrorCode(response.status));
}

/** Posts a short status to Bluesky using a fresh session (no token caching — posts are infrequent, on-publish only). */
export async function postToBluesky(
	fields: BlueskySecretFields,
	text: string,
	deps: VerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const sessionRes = await fetchImpl(`${BLUESKY_PDS_URL}/xrpc/com.atproto.server.createSession`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ identifier: fields.handle, password: fields.appPassword }),
	});
	if (!sessionRes.ok) {
		throw new SocialSyndicationVerifyError(mapStatusToErrorCode(sessionRes.status));
	}
	const session = (await sessionRes.json()) as { accessJwt: string; did: string };
	const postRes = await fetchImpl(`${BLUESKY_PDS_URL}/xrpc/com.atproto.repo.createRecord`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.accessJwt}`,
		},
		body: JSON.stringify({
			repo: session.did,
			collection: "app.bsky.feed.post",
			record: {
				$type: "app.bsky.feed.post",
				text,
				createdAt: new Date().toISOString(),
			},
		}),
	});
	if (!postRes.ok) throw new SocialSyndicationVerifyError(mapStatusToErrorCode(postRes.status));
}

/** Posts a short status to Mastodon. */
export async function postToMastodon(
	fields: MastodonSecretFields,
	text: string,
	deps: VerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const response = await fetchImpl(`${fields.instanceUrl}/api/v1/statuses`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${fields.accessToken}`,
		},
		body: JSON.stringify({ status: text }),
	});
	if (!response.ok) throw new SocialSyndicationVerifyError(mapStatusToErrorCode(response.status));
}

function composePost(event: AstropressContentEvent): string {
	const title = event.title?.trim();
	if (title && event.canonicalUrl) return `${title}\n\n${event.canonicalUrl}`;
	if (event.canonicalUrl) return event.canonicalUrl;
	return `New post: ${event.slug}`;
}

/**
 * Presence-only connection status for the admin status page — which
 * providers have a sealed row with status "connected", never the
 * credential values themselves. Kept here rather than in the page (pages
 * must not import sqlite-runtime directly — see dependency-cruiser's
 * pages-no-direct-sqlite rule).
 */
export async function listConnectedSocialSyndicationProviders(
	locals: App.Locals | null | undefined,
): Promise<ReadonlySet<string>> {
	const now = new Date().toISOString();
	return withLocalStoreFallback<ReadonlySet<string>>(
		locals,
		async (db) => {
			const repo = createD1IntegrationsRepository({ getDb: () => db, now });
			const statuses = await repo.listStatuses();
			return new Set(
				statuses
					.filter((s) => s.domain === SOCIAL_SYNDICATION_DOMAIN && s.status === "connected")
					.map((s) => s.provider),
			);
		},
		(store) => {
			if (!store.integrations) return new Set<string>();
			const statuses = store.integrations.listStatuses();
			return new Set(
				statuses
					.filter((s) => s.domain === SOCIAL_SYNDICATION_DOMAIN && s.status === "connected")
					.map((s) => s.provider),
			);
		},
	);
}

async function findSealedSecret<TFields extends Record<string, string>>(
	locals: App.Locals | null | undefined,
	provider: string,
): Promise<TFields | undefined> {
	let rootSecrets: { current: string; previous?: string };
	try {
		const candidates = getAstropressRootSecretCandidates(locals);
		rootSecrets = { current: getAstropressRootSecret(locals), previous: candidates[1] };
	} catch {
		return undefined;
	}
	const now = new Date().toISOString();
	return withLocalStoreFallback<TFields | undefined>(
		locals,
		async (db) => {
			const repo = createD1IntegrationsRepository({ getDb: () => db, now });
			return repo.findSecret<TFields>(SOCIAL_SYNDICATION_DOMAIN, provider, rootSecrets);
		},
		async (store) => {
			const repo = store.integrations;
			if (!repo) return undefined;
			return repo.findSecret<TFields>(SOCIAL_SYNDICATION_DOMAIN, provider, rootSecrets);
		},
	);
}

const VERIFY_TIMEOUT_MS = 10_000;

export type ConnectSocialSyndicationResult = { ok: true } | { ok: false; error: string };

/**
 * Verifies a submitted Bluesky/Mastodon credential, then seals it via the
 * same repository.connect()/sealIntegrationSecret() path every other
 * domain's secrets go through. Called by the admin connect action —
 * kept here (not in pages/) so the store/repository access stays out of
 * the pages layer, matching every other admin action's shape.
 */
export async function connectSocialSyndicationProvider(
	locals: App.Locals | null | undefined,
	provider: "bluesky" | "mastodon",
	rawFields: Record<string, FormDataEntryValue | null>,
): Promise<ConnectSocialSyndicationResult> {
	let rootSecret: string;
	try {
		rootSecret = getAstropressRootSecret(locals);
	} catch {
		return {
			ok: false,
			error: "Root secret is not configured — cannot seal a posting credential.",
		};
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
	try {
		if (provider === "bluesky") {
			const parsed = BLUESKY_SECRET_FIELDS.safeParse({
				handle: rawFields.handle,
				appPassword: rawFields.appPassword,
			});
			if (!parsed.success) {
				return { ok: false, error: "A Bluesky handle and app password are both required." };
			}
			try {
				await verifyBlueskyCredentials(parsed.data, { signal: controller.signal });
			} catch (err) {
				if (err instanceof SocialSyndicationVerifyError) {
					return {
						ok: false,
						error: "Bluesky rejected that handle/app password — check and try again.",
					};
				}
				throw err;
			}
			await sealSecret(locals, "bluesky", parsed.data, rootSecret);
		} else {
			const parsed = MASTODON_SECRET_FIELDS.safeParse({
				instanceUrl: rawFields.instanceUrl,
				accessToken: rawFields.accessToken,
			});
			if (!parsed.success) {
				return { ok: false, error: "A Mastodon instance URL and access token are both required." };
			}
			try {
				await verifyMastodonCredentials(parsed.data, { signal: controller.signal });
			} catch (err) {
				if (err instanceof SocialSyndicationVerifyError) {
					return {
						ok: false,
						error: "Mastodon rejected that instance URL/access token — check and try again.",
					};
				}
				throw err;
			}
			await sealSecret(locals, "mastodon", parsed.data, rootSecret);
		}
	} finally {
		clearTimeout(timeout);
	}

	return { ok: true };
}

async function sealSecret(
	locals: App.Locals | null | undefined,
	provider: "bluesky" | "mastodon",
	secretFields: Record<string, string>,
	rootSecret: string,
): Promise<void> {
	const now = new Date().toISOString();
	await withLocalStoreFallback<void>(
		locals,
		async (db) => {
			const repo = createD1IntegrationsRepository({ getDb: () => db, now });
			await repo.connect(
				{ domain: SOCIAL_SYNDICATION_DOMAIN, provider, configJson: "{}", secretFields, now },
				rootSecret,
			);
		},
		async (store) => {
			if (!store.integrations) return;
			await store.integrations.connect(
				{ domain: SOCIAL_SYNDICATION_DOMAIN, provider, configJson: "{}", secretFields, now },
				rootSecret,
			);
		},
	);
}

/**
 * Called directly from runtime-actions-content.ts's existing
 * onContentPublish dispatch call site, gated on `socialSyndication` being
 * configured — see the module doc above for why this isn't routed through
 * CmsConfig.plugins/registerCms().
 */
export async function runSocialSyndicationOnPublish(
	event: AstropressContentEvent,
	locals?: App.Locals,
): Promise<void> {
	const text = composePost(event);

	const blueskyFields = await findSealedSecret<BlueskySecretFields>(locals, "bluesky");
	if (blueskyFields) {
		try {
			await postToBluesky(blueskyFields, text);
		} catch (err) {
			console.error("[astropress] social-syndication: Bluesky post failed:", err);
		}
	}

	const mastodonFields = await findSealedSecret<MastodonSecretFields>(locals, "mastodon");
	if (mastodonFields) {
		try {
			await postToMastodon(mastodonFields, text);
		} catch (err) {
			console.error("[astropress] social-syndication: Mastodon post failed:", err);
		}
	}
}
