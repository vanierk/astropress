/**
 * GrowthBook feature-flag provider — push-button registration for the
 * ab-testing domain.
 *
 * Confirmed against GrowthBook's REST API docs (docs.growthbook.io/api,
 * fetched at build time):
 *   - Auth: `Authorization: Bearer <secret key>` (the docs also allow HTTP
 *     Basic with the secret key as username; Bearer matches this codebase's
 *     existing provider convention — see plausible.ts/github-deploy.ts).
 *   - Base API host: GrowthBook Cloud is `https://api.growthbook.io/api`;
 *     self-hosted deployments set their own `API_HOST` (defaults to
 *     `http://localhost:3100/api`) — so the host is a user-supplied field,
 *     not hardcoded, exactly like Plausible's self-hosted `host` field.
 *   - verify() runs a GET against `{apiHost}/v1/features` — a lightweight,
 *     read-only endpoint suitable for a connection check.
 *
 * verify() maps GrowthBook's documented status codes:
 *
 *   200          → key valid, has access      → connected
 *   401          → "No valid API key provided" → INTEGRATION_AUTH_REJECTED
 *   403          → key lacks required access   → INTEGRATION_AUTH_REJECTED
 *   404          → unknown route (bad apiHost) → INTEGRATION_NOT_FOUND
 *   429          → rate-limited (60 req/min)   → INTEGRATION_RATE_LIMITED
 *   other ¬ok    → INTEGRATION_VERIFY_FAILED
 */

import { z } from "zod";

import type { IntegrationErrorCode } from "../../integration-error-sanitizer.js";
import { registerAbTesting } from "../domains.js";
import type { RegisteredProvider } from "../registry.js";

export const GROWTHBOOK_FIELDS = z.object({
	apiHost: z.string().url(),
	secretKey: z.string().min(1),
});

export type GrowthbookFields = z.infer<typeof GROWTHBOOK_FIELDS>;

const FEATURES_PATH = "v1/features";

export class GrowthbookVerifyError extends Error {
	constructor(public readonly code: IntegrationErrorCode) {
		super(code);
		this.name = "GrowthbookVerifyError";
	}
}

export interface GrowthbookVerifyDeps {
	readonly fetch?: typeof fetch;
}

function withTrailingSlash(url: string): string {
	return url.endsWith("/") ? url : `${url}/`;
}

export function buildGrowthbookFeaturesUrl(apiHost: string): string {
	return new URL(FEATURES_PATH, withTrailingSlash(apiHost)).toString();
}

export function buildGrowthbookAuthHeader(secretKey: string): string {
	return `Bearer ${secretKey}`;
}

export async function verifyGrowthbook(
	fields: GrowthbookFields,
	ctx: { signal: AbortSignal },
	deps: GrowthbookVerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const url = buildGrowthbookFeaturesUrl(fields.apiHost);
	const auth = buildGrowthbookAuthHeader(fields.secretKey);
	const res = await fetchImpl(url, {
		method: "GET",
		headers: { Authorization: auth },
		signal: ctx.signal,
	});
	if (res.status === 401 || res.status === 403) {
		throw new GrowthbookVerifyError("INTEGRATION_AUTH_REJECTED");
	}
	if (res.status === 404) {
		throw new GrowthbookVerifyError("INTEGRATION_NOT_FOUND");
	}
	if (res.status === 429) {
		throw new GrowthbookVerifyError("INTEGRATION_RATE_LIMITED");
	}
	if (!res.ok) {
		throw new GrowthbookVerifyError("INTEGRATION_VERIFY_FAILED");
	}
}

export function registerGrowthbook(): RegisteredProvider<GrowthbookFields> {
	return registerAbTesting<GrowthbookFields>({
		id: "growthbook",
		label: "GrowthBook",
		fields: GROWTHBOOK_FIELDS,
		verify: verifyGrowthbook,
		defaultErrorCode: "INTEGRATION_AUTH_REJECTED",
	});
}
