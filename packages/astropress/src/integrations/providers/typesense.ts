/**
 * Typesense search provider — push-button registration for the search
 * domain.
 *
 * Confirmed against Typesense's API docs (typesense.org/docs, fetched at
 * build time):
 *   - Auth: `X-TYPESENSE-API-KEY: <key>` (not Bearer — Typesense's own
 *     header, distinct from every other provider registered so far).
 *   - Typesense has no fixed cloud host — self-hosted and Typesense Cloud
 *     deployments both use a user-supplied host URL, so (like GrowthBook)
 *     `host` is a field, not a hardcoded constant.
 *   - verify() runs a GET against `/collections` — a lightweight,
 *     read-only, resource-independent list endpoint (returns an empty
 *     array on a fresh account, never a "not found"), suitable for a
 *     connection check without requiring any collection to already exist.
 *   - Confirmed open-source and free to self-host — no paid tier required
 *     to use the API, unlike Web3Forms' equivalent verify-capable key.
 *
 * verify() maps documented/standard REST status codes:
 *
 *   200          → key valid                    → connected
 *   401          → invalid/missing API key       → INTEGRATION_AUTH_REJECTED
 *   403          → key lacks required access     → INTEGRATION_AUTH_REJECTED
 *   404          → unknown route (bad host)      → INTEGRATION_NOT_FOUND
 *   429          → rate-limited                  → INTEGRATION_RATE_LIMITED
 *   other ¬ok    → INTEGRATION_VERIFY_FAILED
 */

import { z } from "zod";

import type { IntegrationErrorCode } from "../../integration-error-sanitizer.js";
import { registerSearch } from "../domains.js";
import type { RegisteredProvider } from "../registry.js";

export const TYPESENSE_FIELDS = z.object({
	host: z.string().url(),
	apiKey: z.string().min(1),
	collection: z.string().min(1),
});

export type TypesenseFields = z.infer<typeof TYPESENSE_FIELDS>;

const COLLECTIONS_PATH = "collections";

export class TypesenseVerifyError extends Error {
	constructor(public readonly code: IntegrationErrorCode) {
		super(code);
		this.name = "TypesenseVerifyError";
	}
}

export interface TypesenseVerifyDeps {
	readonly fetch?: typeof fetch;
}

function withTrailingSlash(url: string): string {
	return url.endsWith("/") ? url : `${url}/`;
}

export function buildTypesenseCollectionsUrl(host: string): string {
	return new URL(COLLECTIONS_PATH, withTrailingSlash(host)).toString();
}

export function buildTypesenseAuthHeader(apiKey: string): string {
	return apiKey;
}

export async function verifyTypesense(
	fields: TypesenseFields,
	ctx: { signal: AbortSignal },
	deps: TypesenseVerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const url = buildTypesenseCollectionsUrl(fields.host);
	const res = await fetchImpl(url, {
		method: "GET",
		headers: { "X-TYPESENSE-API-KEY": buildTypesenseAuthHeader(fields.apiKey) },
		signal: ctx.signal,
	});
	if (res.status === 401 || res.status === 403) {
		throw new TypesenseVerifyError("INTEGRATION_AUTH_REJECTED");
	}
	if (res.status === 404) {
		throw new TypesenseVerifyError("INTEGRATION_NOT_FOUND");
	}
	if (res.status === 429) {
		throw new TypesenseVerifyError("INTEGRATION_RATE_LIMITED");
	}
	if (!res.ok) {
		throw new TypesenseVerifyError("INTEGRATION_VERIFY_FAILED");
	}
}

export function registerTypesense(): RegisteredProvider<TypesenseFields> {
	return registerSearch<TypesenseFields>({
		id: "typesense",
		label: "Typesense",
		fields: TYPESENSE_FIELDS,
		verify: verifyTypesense,
		defaultErrorCode: "INTEGRATION_AUTH_REJECTED",
	});
}
