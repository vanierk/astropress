import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildTypesenseAuthHeader,
	buildTypesenseCollectionsUrl,
	registerTypesense,
	TYPESENSE_FIELDS,
	TypesenseVerifyError,
	verifyTypesense,
} from "../../../src/integrations/providers/typesense";
import { _resetRegistryForTests, getProvider } from "../../../src/integrations/registry";

interface CapturedCall {
	url: string;
	method: string | undefined;
	apiKeyHeader: string | null;
	signalIs: AbortSignal | undefined;
}

function makeFetchMock(status: number): {
	fetch: typeof fetch;
	calls: CapturedCall[];
} {
	const calls: CapturedCall[] = [];
	const f: typeof fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input.toString();
		const headers =
			init?.headers instanceof Headers
				? init.headers
				: new Headers((init?.headers as Record<string, string>) ?? {});
		calls.push({
			url,
			method: init?.method,
			apiKeyHeader: headers.get("x-typesense-api-key"),
			signalIs: init?.signal ?? undefined,
		});
		return new Response(null, { status });
	};
	return { fetch: f, calls };
}

const FIELDS = {
	host: "https://xyz.a1.typesense.net",
	apiKey: "secret-abc123",
	collection: "content",
};

afterEach(() => {
	_resetRegistryForTests();
});

describe("TYPESENSE_FIELDS schema", () => {
	it("accepts a valid host URL, non-empty apiKey, and non-empty collection", () => {
		expect(TYPESENSE_FIELDS.parse(FIELDS)).toEqual(FIELDS);
	});

	it("rejects a non-URL host", () => {
		expect(TYPESENSE_FIELDS.safeParse({ ...FIELDS, host: "not-a-url" }).success).toBe(false);
	});

	it("rejects an empty apiKey", () => {
		expect(TYPESENSE_FIELDS.safeParse({ ...FIELDS, apiKey: "" }).success).toBe(false);
	});

	it("rejects an empty collection", () => {
		expect(TYPESENSE_FIELDS.safeParse({ ...FIELDS, collection: "" }).success).toBe(false);
	});
});

describe("buildTypesenseCollectionsUrl", () => {
	it("appends collections to a host with no trailing slash", () => {
		expect(buildTypesenseCollectionsUrl("https://xyz.a1.typesense.net")).toBe(
			"https://xyz.a1.typesense.net/collections",
		);
	});

	it("appends collections to a host that already has a trailing slash", () => {
		expect(buildTypesenseCollectionsUrl("https://xyz.a1.typesense.net/")).toBe(
			"https://xyz.a1.typesense.net/collections",
		);
	});

	it("works against a self-hosted host with a custom port", () => {
		expect(buildTypesenseCollectionsUrl("http://localhost:8108")).toBe(
			"http://localhost:8108/collections",
		);
	});
});

describe("buildTypesenseAuthHeader", () => {
	it("returns the raw api key (Typesense's header carries the key directly, no Bearer prefix)", () => {
		expect(buildTypesenseAuthHeader("secret-xyz")).toBe("secret-xyz");
	});
});

describe("verifyTypesense", () => {
	let signal: AbortSignal;

	beforeEach(() => {
		signal = new AbortController().signal;
	});

	it("resolves on 200", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).resolves.toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it("hits GET {host}/collections", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTypesense(FIELDS, { signal }, { fetch });
		expect(calls[0].url).toBe("https://xyz.a1.typesense.net/collections");
		expect(calls[0].method).toBe("GET");
	});

	it("attaches the X-TYPESENSE-API-KEY header with the api key", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTypesense(FIELDS, { signal }, { fetch });
		expect(calls[0].apiKeyHeader).toBe("secret-abc123");
	});

	it("forwards the AbortSignal", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTypesense(FIELDS, { signal }, { fetch });
		expect(calls[0].signalIs).toBe(signal);
	});

	it("throws AUTH_REJECTED on 401 (invalid/missing api key)", async () => {
		const { fetch } = makeFetchMock(401);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws AUTH_REJECTED on 403 (key lacks required access)", async () => {
		const { fetch } = makeFetchMock(403);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws NOT_FOUND on 404 (unknown route / bad host)", async () => {
		const { fetch } = makeFetchMock(404);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_NOT_FOUND",
		});
	});

	it("throws RATE_LIMITED on 429", async () => {
		const { fetch } = makeFetchMock(429);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_RATE_LIMITED",
		});
	});

	it("throws VERIFY_FAILED on 500", async () => {
		const { fetch } = makeFetchMock(500);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("throws VERIFY_FAILED on 400 (4xx that isn't 401/403/429)", async () => {
		const { fetch } = makeFetchMock(400);
		await expect(verifyTypesense(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("TypesenseVerifyError subclasses Error and carries the typed code", async () => {
		const { fetch } = makeFetchMock(403);
		try {
			await verifyTypesense(FIELDS, { signal }, { fetch });
			throw new Error("expected verify to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(TypesenseVerifyError);
			expect(err).toBeInstanceOf(Error);
			expect((err as TypesenseVerifyError).code).toBe("INTEGRATION_AUTH_REJECTED");
		}
	});

	it("falls back to global fetch when deps.fetch is omitted", async () => {
		const stub = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		try {
			await expect(verifyTypesense(FIELDS, { signal })).resolves.toBeUndefined();
			expect(stub).toHaveBeenCalledTimes(1);
		} finally {
			stub.mockRestore();
		}
	});
});

describe("registerTypesense", () => {
	it("registers under search with id 'typesense' and label 'Typesense'", () => {
		const entry = registerTypesense();
		expect(entry.domain).toBe("search");
		expect(entry.id).toBe("typesense");
		expect(entry.label).toBe("Typesense");
		const looked = getProvider("search", "typesense");
		expect(looked?.label).toBe("Typesense");
	});

	it("registers TYPESENSE_FIELDS schema", () => {
		registerTypesense();
		const provider = getProvider("search", "typesense");
		expect(provider?.fields.safeParse({ ...FIELDS, apiKey: "" }).success).toBe(false);
	});

	it("wires verifyTypesense so connect-flow gets a callable verify", () => {
		registerTypesense();
		const provider = getProvider("search", "typesense");
		expect(typeof provider?.verify).toBe("function");
	});

	it("wires defaultErrorCode to AUTH_REJECTED (most common verify failure)", () => {
		registerTypesense();
		const provider = getProvider("search", "typesense");
		expect(provider?.defaultErrorCode).toBe("INTEGRATION_AUTH_REJECTED");
	});
});
