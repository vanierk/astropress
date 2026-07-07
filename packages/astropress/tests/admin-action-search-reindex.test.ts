/**
 * Verifies the manual search reindex: composes from
 * getRuntimeActiveIntegrationFields (the connected provider's stored
 * credentials) + listRuntimeContentStates (the same enumeration
 * admin-action-backup-export.ts already uses), filters to published
 * content, and reports indexed/failed/total counts from Typesense's
 * per-line JSONL import response.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime-actions-integrations.js", () => ({
	getRuntimeActiveIntegrationFields: vi.fn(),
}));

vi.mock("../src/runtime-page-store.js", () => ({
	listRuntimeContentStates: vi.fn().mockResolvedValue([]),
}));

import { runSearchReindex } from "../src/admin-action-search-reindex.js";
import { getRuntimeActiveIntegrationFields } from "../src/runtime-actions-integrations.js";
import { listRuntimeContentStates } from "../src/runtime-page-store.js";

const mockActive = getRuntimeActiveIntegrationFields as unknown as ReturnType<typeof vi.fn>;
const mockContent = listRuntimeContentStates as unknown as ReturnType<typeof vi.fn>;

const CONNECTED = {
	ok: true as const,
	providerId: "typesense",
	fields: { host: "https://xyz.a1.typesense.net", apiKey: "secret-abc", collection: "content" },
};

const PUBLISHED_RECORD = {
	slug: "hello-world",
	title: "Hello World",
	status: "published",
	body: "Body text",
	excerpt: "An excerpt",
	kind: "post",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeFetchMock(status: number, bodyText: string) {
	const calls: Array<{ url: string; method: string | undefined; body: unknown; headers: Headers }> =
		[];
	const f: typeof fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input.toString();
		const headers =
			init?.headers instanceof Headers
				? init.headers
				: new Headers((init?.headers as Record<string, string>) ?? {});
		calls.push({ url, method: init?.method, body: init?.body, headers });
		return new Response(bodyText, { status });
	};
	return { fetch: f, calls };
}

afterEach(() => {
	vi.clearAllMocks();
	mockContent.mockResolvedValue([]);
});

describe("runSearchReindex — not connected", () => {
	it("returns NOT_CONNECTED when no search provider is active", async () => {
		mockActive.mockResolvedValue({ ok: false, code: "INTEGRATION_NOT_CONNECTED" });
		const result = await runSearchReindex({});
		expect(result).toMatchObject({ ok: false, code: "NOT_CONNECTED" });
	});

	it("never calls listRuntimeContentStates when not connected", async () => {
		mockActive.mockResolvedValue({ ok: false, code: "INTEGRATION_NOT_CONNECTED" });
		await runSearchReindex({});
		expect(mockContent).not.toHaveBeenCalled();
	});
});

describe("runSearchReindex — connected, no published content", () => {
	it("returns ok with zero counts and never calls fetch", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([]);
		const fetchSpy = vi.fn();
		const result = await runSearchReindex({}, { fetch: fetchSpy });
		expect(result).toEqual({ ok: true, indexed: 0, failed: 0, total: 0 });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("filters out non-published content before counting", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([{ ...PUBLISHED_RECORD, status: "draft" }]);
		const fetchSpy = vi.fn();
		const result = await runSearchReindex({}, { fetch: fetchSpy });
		expect(result).toEqual({ ok: true, indexed: 0, failed: 0, total: 0 });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("runSearchReindex — connected, with published content", () => {
	it("posts JSONL to {host}/collections/{collection}/documents/import?action=upsert", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([PUBLISHED_RECORD]);
		const { fetch, calls } = makeFetchMock(200, '{"success":true}\n');
		await runSearchReindex({}, { fetch });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(
			"https://xyz.a1.typesense.net/collections/content/documents/import?action=upsert",
		);
		expect(calls[0].method).toBe("POST");
		expect(calls[0].headers.get("x-typesense-api-key")).toBe("secret-abc");
	});

	it("sends one JSON document per line, transformed from the content record", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([PUBLISHED_RECORD]);
		const { fetch, calls } = makeFetchMock(200, '{"success":true}\n');
		await runSearchReindex({}, { fetch });
		const sentDoc = JSON.parse(String(calls[0].body).trim());
		expect(sentDoc).toEqual({
			id: "hello-world",
			title: "Hello World",
			slug: "hello-world",
			body: "Body text",
			excerpt: "An excerpt",
			kind: "post",
			status: "published",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
	});

	it("reports indexed/failed/total from the per-line success flags", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([
			PUBLISHED_RECORD,
			{ ...PUBLISHED_RECORD, slug: "second-post", title: "Second" },
		]);
		const { fetch } = makeFetchMock(
			200,
			'{"success":true}\n{"success":false,"error":"bad field"}\n',
		);
		const result = await runSearchReindex({}, { fetch });
		expect(result).toEqual({ ok: true, indexed: 1, failed: 1, total: 2 });
	});

	it("treats an unparseable response line as a failure", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([PUBLISHED_RECORD]);
		const { fetch } = makeFetchMock(200, "not json\n");
		const result = await runSearchReindex({}, { fetch });
		expect(result).toEqual({ ok: true, indexed: 0, failed: 1, total: 1 });
	});

	it("returns IMPORT_FAILED when the request itself is rejected (non-200)", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([PUBLISHED_RECORD]);
		const { fetch } = makeFetchMock(404, "collection not found");
		const result = await runSearchReindex({}, { fetch });
		expect(result).toMatchObject({ ok: false, code: "IMPORT_FAILED" });
		expect((result as { error: string }).error).toContain("404");
	});

	it("returns IMPORT_FAILED when fetch itself throws (network error)", async () => {
		mockActive.mockResolvedValue(CONNECTED);
		mockContent.mockResolvedValue([PUBLISHED_RECORD]);
		const throwingFetch: typeof fetch = async () => {
			throw new Error("network down");
		};
		const result = await runSearchReindex({}, { fetch: throwingFetch });
		expect(result).toMatchObject({ ok: false, code: "IMPORT_FAILED", error: "network down" });
	});
});
