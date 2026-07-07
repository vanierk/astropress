/**
 * Manual search reindex — pushes published content into the connected
 * Typesense collection on demand. Host-triggered only: there is no
 * automatic on-publish sync. Wiring reindexing into the publish pipeline
 * is host responsibility via the `AstropressPlugin.onContentSave` hook
 * (see config.ts's search-indexer doc-comment example) — out of scope here.
 *
 * Reuses `listRuntimeContentStates` (the same enumeration
 * `admin-action-backup-export.ts` already uses for the backups export)
 * rather than inventing a second way to walk all content, and
 * `getRuntimeActiveIntegrationFields` to read the connected provider's
 * stored credentials.
 */
import {
	buildTypesenseCollectionsUrl,
	type TypesenseFields,
} from "./integrations/providers/typesense.js";
import type { ContentRecord } from "./persistence-types.js";
import { getRuntimeActiveIntegrationFields } from "./runtime-actions-integrations.js";
import { listRuntimeContentStates } from "./runtime-page-store.js";

export interface SearchReindexResult {
	readonly ok: true;
	readonly indexed: number;
	readonly failed: number;
	readonly total: number;
}

export type SearchReindexFailure =
	| { readonly ok: false; readonly code: "NOT_CONNECTED"; readonly error: string }
	| { readonly ok: false; readonly code: "IMPORT_FAILED"; readonly error: string };

interface TypesenseSearchDocument {
	id: string;
	title: string;
	slug: string;
	body?: string;
	excerpt?: string;
	kind?: string;
	status: string;
	updatedAt: string;
}

function buildTypesenseImportUrl(host: string, collection: string): string {
	const collectionsUrl = buildTypesenseCollectionsUrl(host);
	return `${collectionsUrl}/${encodeURIComponent(collection)}/documents/import?action=upsert`;
}

function toSearchDocument(record: ContentRecord): TypesenseSearchDocument {
	return {
		id: record.slug,
		title: record.title,
		slug: record.slug,
		body: record.body,
		excerpt: record.excerpt,
		kind: record.kind ?? undefined,
		status: record.status,
		updatedAt: record.updatedAt,
	};
}

export async function runSearchReindex(
	locals: App.Locals | null | undefined,
	deps: { fetch?: typeof fetch } = {},
): Promise<SearchReindexResult | SearchReindexFailure> {
	const active = await getRuntimeActiveIntegrationFields<TypesenseFields>(locals, "search");
	if (!active.ok) {
		return {
			ok: false,
			code: "NOT_CONNECTED",
			error: "No search provider connected. Connect one on this page first.",
		};
	}

	const content = await listRuntimeContentStates(locals);
	const published = content.filter((record) => record.status === "published");
	const documents = published.map(toSearchDocument);

	if (documents.length === 0) {
		return { ok: true, indexed: 0, failed: 0, total: 0 };
	}

	const fetchImpl = deps.fetch ?? fetch;
	const url = buildTypesenseImportUrl(active.fields.host, active.fields.collection);
	const jsonl = documents.map((doc) => JSON.stringify(doc)).join("\n");

	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: "POST",
			headers: {
				"X-TYPESENSE-API-KEY": active.fields.apiKey,
				"Content-Type": "text/plain",
			},
			body: jsonl,
		});
	} catch (err) {
		return {
			ok: false,
			code: "IMPORT_FAILED",
			error: err instanceof Error ? err.message : "Network error contacting Typesense.",
		};
	}

	if (!res.ok) {
		// Typesense returns 200 with per-document success/failure inside the
		// JSONL body even when some documents fail — a non-200 here means the
		// request itself was rejected (e.g. the collection doesn't exist yet,
		// or bad credentials).
		const bodyText = await res.text().catch(() => "");
		return {
			ok: false,
			code: "IMPORT_FAILED",
			error: `Typesense import request failed (${res.status}): ${bodyText || res.statusText}`,
		};
	}

	const resultText = await res.text();
	const lines = resultText.split("\n").filter((line) => line.trim().length > 0);
	let failed = 0;
	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as { success?: boolean };
			if (!parsed.success) failed += 1;
		} catch {
			failed += 1;
		}
	}
	const indexed = documents.length - failed;

	return { ok: true, indexed, failed, total: documents.length };
}
