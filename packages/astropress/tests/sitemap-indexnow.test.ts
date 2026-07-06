/**
 * IndexNow submission — key derivation, the authenticated ping, and the
 * persisted last-submitted-at timestamp (reusing the existing
 * /sitemap.xml system-route settings record rather than a new data model).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime-route-registry-system.js", () => ({
	getRuntimeSystemRoute: vi.fn().mockResolvedValue(null),
	saveRuntimeSystemRoute: vi.fn().mockResolvedValue({ ok: true }),
}));

import {
	getRuntimeSystemRoute,
	saveRuntimeSystemRoute,
} from "../src/runtime-route-registry-system.js";
import {
	deriveIndexNowKey,
	getIndexNowLastSubmittedAt,
	recordIndexNowSubmission,
	submitIndexNow,
} from "../src/sitemap-indexnow.js";

const mockGetRuntimeSystemRoute = getRuntimeSystemRoute as unknown as ReturnType<typeof vi.fn>;
const mockSaveRuntimeSystemRoute = saveRuntimeSystemRoute as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
	vi.clearAllMocks();
	mockGetRuntimeSystemRoute.mockResolvedValue(null);
	mockSaveRuntimeSystemRoute.mockResolvedValue({ ok: true });
});

describe("deriveIndexNowKey", () => {
	it("is deterministic for the same origin + secret", () => {
		const a = deriveIndexNowKey("https://example.com", "root-secret");
		const b = deriveIndexNowKey("https://example.com", "root-secret");
		expect(a).toBe(b);
	});

	it("differs for a different origin", () => {
		const a = deriveIndexNowKey("https://example.com", "root-secret");
		const b = deriveIndexNowKey("https://other.example.com", "root-secret");
		expect(a).not.toBe(b);
	});

	it("differs for a different secret", () => {
		const a = deriveIndexNowKey("https://example.com", "secret-a");
		const b = deriveIndexNowKey("https://example.com", "secret-b");
		expect(a).not.toBe(b);
	});

	it("is a hex string within IndexNow's 8-128 char key length", () => {
		const key = deriveIndexNowKey("https://example.com", "root-secret");
		expect(key).toMatch(/^[0-9a-f]+$/);
		expect(key.length).toBeGreaterThanOrEqual(8);
		expect(key.length).toBeLessThanOrEqual(128);
	});
});

describe("submitIndexNow", () => {
	function makeFetchMock(status: number) {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ url: String(input), init: init ?? {} });
			return new Response(null, { status });
		}) as typeof fetch;
		return { fetch: f, calls };
	}

	it("POSTs to the IndexNow API with host/key/keyLocation/urlList", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await submitIndexNow("https://example.com", "abc123", ["https://example.com/"], { fetch });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://api.indexnow.org/indexnow");
		expect(calls[0].init.method).toBe("POST");
		const body = JSON.parse(calls[0].init.body as string);
		expect(body.host).toBe("example.com");
		expect(body.key).toBe("abc123");
		expect(body.keyLocation).toBe("https://example.com/abc123.txt");
		expect(body.urlList).toEqual(["https://example.com/"]);
	});

	it("resolves ok:true on HTTP 200", async () => {
		const { fetch } = makeFetchMock(200);
		await expect(submitIndexNow("https://example.com", "k", [], { fetch })).resolves.toEqual({
			ok: true,
		});
	});

	it("resolves ok:true on HTTP 202 (accepted, processing)", async () => {
		const { fetch } = makeFetchMock(202);
		await expect(submitIndexNow("https://example.com", "k", [], { fetch })).resolves.toEqual({
			ok: true,
		});
	});

	it("resolves ok:false with a specific message on HTTP 400", async () => {
		const { fetch } = makeFetchMock(400);
		const result = await submitIndexNow("https://example.com", "k", [], { fetch });
		expect(result.ok).toBe(false);
		expect((result as { error: string }).error).toMatch(/malformed/i);
	});

	it("resolves ok:false with a specific message on HTTP 403 (key verification failed)", async () => {
		const { fetch } = makeFetchMock(403);
		const result = await submitIndexNow("https://example.com", "k", [], { fetch });
		expect(result.ok).toBe(false);
		expect((result as { error: string }).error).toMatch(/verify/i);
	});

	it("resolves ok:false on HTTP 422 (invalid URLs)", async () => {
		const { fetch } = makeFetchMock(422);
		const result = await submitIndexNow("https://example.com", "k", [], { fetch });
		expect(result.ok).toBe(false);
	});

	it("resolves ok:false with a specific message on HTTP 429 (rate limited)", async () => {
		const { fetch } = makeFetchMock(429);
		const result = await submitIndexNow("https://example.com", "k", [], { fetch });
		expect(result.ok).toBe(false);
		expect((result as { error: string }).error).toMatch(/rate/i);
	});

	it("resolves ok:false on an unexpected status", async () => {
		const { fetch } = makeFetchMock(500);
		const result = await submitIndexNow("https://example.com", "k", [], { fetch });
		expect(result.ok).toBe(false);
	});

	it("resolves ok:false (not throw) when fetch rejects", async () => {
		const fetchImpl = (async () => {
			throw new Error("network down");
		}) as typeof fetch;
		const result = await submitIndexNow("https://example.com", "k", [], { fetch: fetchImpl });
		expect(result.ok).toBe(false);
	});

	it("resolves ok:false for a malformed origin", async () => {
		const { fetch } = makeFetchMock(200);
		const result = await submitIndexNow("not-a-url", "k", [], { fetch });
		expect(result.ok).toBe(false);
	});

	it("falls back to global fetch when deps.fetch is omitted", async () => {
		const stub = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		try {
			await expect(submitIndexNow("https://example.com", "k", [])).resolves.toEqual({
				ok: true,
			});
			expect(stub).toHaveBeenCalledTimes(1);
		} finally {
			stub.mockRestore();
		}
	});
});

describe("getIndexNowLastSubmittedAt", () => {
	it("returns null when no system route exists yet", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue(null);
		await expect(getIndexNowLastSubmittedAt({})).resolves.toBeNull();
	});

	it("returns null when settings has no indexNow sub-object", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({ settings: { excludedPaths: [] } });
		await expect(getIndexNowLastSubmittedAt({})).resolves.toBeNull();
	});

	it("returns the persisted timestamp", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({
			settings: { indexNow: { lastSubmittedAt: "2026-01-01T00:00:00.000Z" } },
		});
		await expect(getIndexNowLastSubmittedAt({})).resolves.toBe("2026-01-01T00:00:00.000Z");
	});
});

describe("recordIndexNowSubmission", () => {
	const actor = { email: "admin@example.com", role: "admin" as const, name: "Admin" };

	it("preserves existing excludedPaths/extraUrls settings", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue({
			title: "Sitemap",
			settings: { excludedPaths: ["/x/"], extraUrls: ["https://y.example/"] },
		});
		await recordIndexNowSubmission(actor, {});
		const [, input] = mockSaveRuntimeSystemRoute.mock.calls[0];
		expect(input.settings.excludedPaths).toEqual(["/x/"]);
		expect(input.settings.extraUrls).toEqual(["https://y.example/"]);
	});

	it("writes an ISO timestamp under settings.indexNow.lastSubmittedAt", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue(null);
		await recordIndexNowSubmission(actor, {});
		const [, input] = mockSaveRuntimeSystemRoute.mock.calls[0];
		expect(input.settings.indexNow.lastSubmittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("falls back to a default title when no system route exists yet", async () => {
		mockGetRuntimeSystemRoute.mockResolvedValue(null);
		await recordIndexNowSubmission(actor, {});
		const [path, input] = mockSaveRuntimeSystemRoute.mock.calls[0];
		expect(path).toBe("/sitemap.xml");
		expect(input.title).toBe("Sitemap");
	});
});
