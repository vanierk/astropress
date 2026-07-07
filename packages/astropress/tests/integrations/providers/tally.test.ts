import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildTallyAuthHeader,
	buildTallyFormsUrl,
	registerTally,
	TALLY_FIELDS,
	TallyVerifyError,
	verifyTally,
} from "../../../src/integrations/providers/tally";
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

const FIELDS = { apiToken: "tly-secret-abc123" };

afterEach(() => {
	_resetRegistryForTests();
});

describe("TALLY_FIELDS schema", () => {
	it("accepts a non-empty apiToken", () => {
		expect(TALLY_FIELDS.parse(FIELDS)).toEqual(FIELDS);
	});

	it("rejects an empty apiToken", () => {
		expect(TALLY_FIELDS.safeParse({ apiToken: "" }).success).toBe(false);
	});

	it("rejects a missing apiToken", () => {
		expect(TALLY_FIELDS.safeParse({}).success).toBe(false);
	});
});

describe("buildTallyFormsUrl", () => {
	it("returns the fixed api.tally.so /forms endpoint", () => {
		expect(buildTallyFormsUrl()).toBe("https://api.tally.so/forms");
	});
});

describe("buildTallyAuthHeader", () => {
	it("prefixes the token with 'Bearer '", () => {
		expect(buildTallyAuthHeader("tly-xyz")).toBe("Bearer tly-xyz");
	});

	it("does not mutate or trim whitespace in the token", () => {
		expect(buildTallyAuthHeader("  tly-abc  ")).toBe("Bearer   tly-abc  ");
	});
});

describe("verifyTally", () => {
	let signal: AbortSignal;

	beforeEach(() => {
		signal = new AbortController().signal;
	});

	it("resolves on 200", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).resolves.toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it("hits GET https://api.tally.so/forms", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTally(FIELDS, { signal }, { fetch });
		expect(calls[0].url).toBe("https://api.tally.so/forms");
		expect(calls[0].method).toBe("GET");
	});

	it("attaches Bearer auth header with the api token", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTally(FIELDS, { signal }, { fetch });
		expect(calls[0].authorization).toBe("Bearer tly-secret-abc123");
	});

	it("forwards the AbortSignal", async () => {
		const { fetch, calls } = makeFetchMock(200);
		await verifyTally(FIELDS, { signal }, { fetch });
		expect(calls[0].signalIs).toBe(signal);
	});

	it("throws AUTH_REJECTED on 401 (invalid/missing/revoked token)", async () => {
		const { fetch } = makeFetchMock(401);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws AUTH_REJECTED on 403 (token lacks required access)", async () => {
		const { fetch } = makeFetchMock(403);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_AUTH_REJECTED",
		});
	});

	it("throws NOT_FOUND on 404", async () => {
		const { fetch } = makeFetchMock(404);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_NOT_FOUND",
		});
	});

	it("throws RATE_LIMITED on 429", async () => {
		const { fetch } = makeFetchMock(429);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_RATE_LIMITED",
		});
	});

	it("throws VERIFY_FAILED on 500", async () => {
		const { fetch } = makeFetchMock(500);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("throws VERIFY_FAILED on 400 (4xx that isn't 401/403/429)", async () => {
		const { fetch } = makeFetchMock(400);
		await expect(verifyTally(FIELDS, { signal }, { fetch })).rejects.toMatchObject({
			code: "INTEGRATION_VERIFY_FAILED",
		});
	});

	it("TallyVerifyError subclasses Error and carries the typed code", async () => {
		const { fetch } = makeFetchMock(403);
		try {
			await verifyTally(FIELDS, { signal }, { fetch });
			throw new Error("expected verify to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(TallyVerifyError);
			expect(err).toBeInstanceOf(Error);
			expect((err as TallyVerifyError).code).toBe("INTEGRATION_AUTH_REJECTED");
		}
	});

	it("falls back to global fetch when deps.fetch is omitted", async () => {
		const stub = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));
		try {
			await expect(verifyTally(FIELDS, { signal })).resolves.toBeUndefined();
			expect(stub).toHaveBeenCalledTimes(1);
		} finally {
			stub.mockRestore();
		}
	});
});

describe("registerTally", () => {
	it("registers under forms with id 'tally' and label 'Tally'", () => {
		const entry = registerTally();
		expect(entry.domain).toBe("forms");
		expect(entry.id).toBe("tally");
		expect(entry.label).toBe("Tally");
		const looked = getProvider("forms", "tally");
		expect(looked?.label).toBe("Tally");
	});

	it("registers TALLY_FIELDS schema", () => {
		registerTally();
		const provider = getProvider("forms", "tally");
		expect(provider?.fields.safeParse({ apiToken: "" }).success).toBe(false);
	});

	it("wires verifyTally so connect-flow gets a callable verify", () => {
		registerTally();
		const provider = getProvider("forms", "tally");
		expect(typeof provider?.verify).toBe("function");
	});

	it("wires defaultErrorCode to AUTH_REJECTED (most common verify failure)", () => {
		registerTally();
		const provider = getProvider("forms", "tally");
		expect(provider?.defaultErrorCode).toBe("INTEGRATION_AUTH_REJECTED");
	});
});
