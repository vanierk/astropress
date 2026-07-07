/**
 * Tally forms provider — push-button registration for the forms domain.
 *
 * Confirmed against Tally's REST API docs (developers.tally.so, fetched at
 * build time):
 *   - Auth: `Authorization: Bearer <token>` (token format `tly-xxxx`,
 *     issued from Tally's account settings). API access is free on all
 *     plans — no paid tier required, unlike Web3Forms' equivalent
 *     verify-capable key, which is a paid-only feature.
 *   - Base API host is fixed at `https://api.tally.so` — unlike GrowthBook,
 *     Tally has no self-hosted variant, so there's no host field to collect.
 *   - verify() runs a GET against `/forms` — a lightweight, read-only,
 *     paginated forms-list endpoint suitable for a connection check.
 *
 * verify() maps documented/standard REST status codes:
 *
 *   200          → key valid                    → connected
 *   401          → invalid/missing/revoked token → INTEGRATION_AUTH_REJECTED
 *   403          → token lacks required access   → INTEGRATION_AUTH_REJECTED
 *   404          → unknown route                 → INTEGRATION_NOT_FOUND
 *   429          → rate-limited                  → INTEGRATION_RATE_LIMITED
 *   other ¬ok    → INTEGRATION_VERIFY_FAILED
 */

import { z } from "zod";

import type { IntegrationErrorCode } from "../../integration-error-sanitizer.js";
import { registerForms } from "../domains.js";
import type { RegisteredProvider } from "../registry.js";

export const TALLY_FIELDS = z.object({
	apiToken: z.string().min(1),
});

export type TallyFields = z.infer<typeof TALLY_FIELDS>;

const TALLY_API_BASE = "https://api.tally.so";
const FORMS_PATH = "/forms";

export class TallyVerifyError extends Error {
	constructor(public readonly code: IntegrationErrorCode) {
		super(code);
		this.name = "TallyVerifyError";
	}
}

export interface TallyVerifyDeps {
	readonly fetch?: typeof fetch;
}

export function buildTallyFormsUrl(): string {
	return `${TALLY_API_BASE}${FORMS_PATH}`;
}

export function buildTallyAuthHeader(apiToken: string): string {
	return `Bearer ${apiToken}`;
}

export async function verifyTally(
	fields: TallyFields,
	ctx: { signal: AbortSignal },
	deps: TallyVerifyDeps = {},
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const url = buildTallyFormsUrl();
	const auth = buildTallyAuthHeader(fields.apiToken);
	const res = await fetchImpl(url, {
		method: "GET",
		headers: { Authorization: auth },
		signal: ctx.signal,
	});
	if (res.status === 401 || res.status === 403) {
		throw new TallyVerifyError("INTEGRATION_AUTH_REJECTED");
	}
	if (res.status === 404) {
		throw new TallyVerifyError("INTEGRATION_NOT_FOUND");
	}
	if (res.status === 429) {
		throw new TallyVerifyError("INTEGRATION_RATE_LIMITED");
	}
	if (!res.ok) {
		throw new TallyVerifyError("INTEGRATION_VERIFY_FAILED");
	}
}

export function registerTally(): RegisteredProvider<TallyFields> {
	return registerForms<TallyFields>({
		id: "tally",
		label: "Tally",
		fields: TALLY_FIELDS,
		verify: verifyTally,
		defaultErrorCode: "INTEGRATION_AUTH_REJECTED",
	});
}
