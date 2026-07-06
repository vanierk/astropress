import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildGrowthbookAuthHeader,
	buildGrowthbookFeaturesUrl,
	GROWTHBOOK_FIELDS,
	GrowthbookVerifyError,
	registerGrowthbook,
	verifyGrowthbook,
} from "../../../src/integrations/providers/growthbook";
import { _resetRegistryForTests, getProvider } from "../../../src/integrations/registry";

interface CapturedCall {
	url: string;
	method: string | undefined;
	authorization: string | null;
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
			authorization: headers.get("authorization"),
			signalIs: init?.signal ?? undefined,
		});
		return new Response(null, { status });
	};
	return { fetch: f, calls };
}

const FIELDS = { apiHost: "https://api.growthbook.io/api", secretKey: "secret_abc123" };

afterEach(() => {
	_resetRegistryForTests();
});

describe("GROWTHBOOK_FIELDS schema", () => {
	it("accepts a valid apiHost URL and non-empty secretKey", () => {
		expect(GROWTHBOOK_FIELDS.parse(FIELDS)).toEqual(FIELDS);
	});

	it("rejects a non-URL apiHost", () => {
		expect(GROWTHBOOK_FIELDS.safeParse({ ...FIELDS, apiHost: "not-a-url" }).success).toBe(false);
	});

	it("rejects an empty secretKey", () => {
		expect(GROWTHBOOK_FIELDS.safeParse({ ...FIELDS, secretKey: "" }).success).toBe(false);
	});
});

describe("buildGrowthbookFeaturesUrl", () => {
	it("appends v1/features to a host with no trailing slash", () => {
		expect(buildGrowthbookFeaturesUrl("https://api.growthbook.io/api")).toBe(
			"https://api.growthbook.io/api/v1/features",
		);
	});

	it("appends v1/features to a host that already has a trailing slash", () => {
		expect(buildGrowthbookFeaturesUrl("https://api.growthbook.io/api/")).toBe(
			"https://api.growthbook.io/api/v1/features",
		);
	});

	it("works against a self-hosted host with a custom port", () => {
		expect(buildGrowthbookFeaturesUrl("http://localhost:3100/api")).toBe(
			"http://localhost:3100/api/v1/features",
		);
	});
});

describe("buildGrowthbookAuthHeader", () => {
	it("prefixes the secret key with 'Bearer '", () => {
		expect(buildGrowthbookAuthHeader("xyz")).toBe("Bearer xyz");
	});

	it("does not mutate or trim whitespace in the key", () => {
		expect(buildGrowthbookAuthHeader("  abc  ")).toBe("Bearer   abc  ");
	});
});

describe("verifyGrowthbook", () => {
	let signal: AbortSignal;

	beforeEach(() => {
		signal = new AbortController().signal;
	});

	it("resolves on 200", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).resolves.toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it("hits {apiHost}/v1/features with GET", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyGrowthbook(FIELDS, { signal }, { fetch });
		expect(calls[0].url).toBe("https://api.growthbook.io/api/v1/features");
		expect(calls[0].method).toBe("GET");
	});

	it("attaches Bearer auth header with the secret key", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyGrowthbook(FIELDS, { signal }, { fetch });
		expect(calls[0].authorization).toBe("Bearer secret_abc123");
	});

	it("forwards the AbortSignal", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyGrowthbook(FIELDS, { signal }, { fetch });
		expect(calls[0].signalIs).toBe(signal);
	});

	it("throws AUTH_REJECTED on 401 (no valid API key)", async () => {
		const { fetch } = makeFetchMock(401);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws AUTH_REJECTED on 403 (key lacks required access)", async () => {
		const { fetch } = makeFetchMock(403);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws NOT_FOUND on 404 (unknown route / bad apiHost)", async () => {
		const { fetch } = makeFetchMock(404);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_NOT_FOUND",
		});
	});

	it("throws RATE_LIMITED on 429", async () => {
		const { fetch } = makeFetchMock(429);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_RATE_LIMITED",
		});
	});

	it("throws VERIFY_FAILED on 500", async () => {
		const { fetch } = makeFetchMock(500);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("throws VERIFY_FAILED on 400 (4xx that isn't 401/403/429)", async () => {
		const { fetch } = makeFetchMock(400);
		await expect(verifyGrowthbook(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("GrowthbookVerifyError subclasses Error and carries the typed code", async () => {
		const { fetch } = makeFetchMock(403);
		try {
			await verifyGrowthbook(FIELDS, { signal }, { fetch });
			throw new Error("expected verify to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(GrowthbookVerifyError);
			expect(err).toBeInstanceOf(Error);
			expect((err as GrowthbookVerifyError).code).toBe("INTEGRATION_AUTH_REJECTED");
		}
	});

	it("falls back to global fetch when deps.fetch is omitted", async () => {
		const stub = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		try {
			await expect(verifyGrowthbook(FIELDS, { signal })).resolves.toBeUndefined();
			expect(stub).toHaveBeenCalledTimes(1);
		} finally {
			stub.mockRestore();
		}
	});
});

describe("registerGrowthbook", () => {
	it("registers under ab-testing with id 'growthbook' and label 'GrowthBook'", () => {
		const entry = registerGrowthbook();
		expect(entry.domain).toBe("ab-testing");
		expect(entry.id).toBe("growthbook");
		expect(entry.label).toBe("GrowthBook");
		const looked = getProvider("ab-testing", "growthbook");
		expect(looked?.label).toBe("GrowthBook");
	});

	it("registers GROWTHBOOK_FIELDS schema", () => {
		registerGrowthbook();
		const provider = getProvider("ab-testing", "growthbook");
		expect(provider?.fields.safeParse({ ...FIELDS, secretKey: "" }).success).toBe(false);
	});

	it("wires verifyGrowthbook so connect-flow gets a callable verify", () => {
		registerGrowthbook();
		const provider = getProvider("ab-testing", "growthbook");
		expect(typeof provider?.verify).toBe("function");
	});

	it("wires defaultErrorCode to AUTH_REJECTED (most common verify failure)", () => {
		registerGrowthbook();
		const provider = getProvider("ab-testing", "growthbook");
		expect(provider?.defaultErrorCode).toBe("INTEGRATION_AUTH_REJECTED");
	});
});
