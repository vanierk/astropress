import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adminStoreDispatch from "../src/admin-store-dispatch";
import * as runtimeEnv from "../src/runtime-env";
import {
	connectSocialSyndicationProvider,
	listConnectedSocialSyndicationProviders,
	postToBluesky,
	postToMastodon,
	runSocialSyndicationOnPublish,
	SOCIAL_SYNDICATION_DOMAIN,
	SocialSyndicationVerifyError,
	verifyBlueskyCredentials,
	verifyMastodonCredentials,
} from "../src/social-syndication";
import { makeDb } from "./helpers/make-db.js";
import { SqliteBackedD1Database } from "./helpers/provider-test-fixtures.js";

function withD1Backed(db: DatabaseSync) {
	const d1 = new SqliteBackedD1Database(db);
	vi.spyOn(adminStoreDispatch, "withLocalStoreFallback").mockImplementation(
		async (_locals, onD1, _onLocal) => onD1(d1 as never),
	);
	return d1;
}

function withNoStore() {
	vi.spyOn(adminStoreDispatch, "withLocalStoreFallback").mockImplementation(
		async (_locals, _onD1, onLocal) => onLocal({ integrations: undefined } as never),
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("verifyBlueskyCredentials", () => {
	it("succeeds on a 2xx createSession response", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		await expect(
			verifyBlueskyCredentials(
				{ handle: "a.bsky.social", appPassword: "app-pw" },
				{ signal: new AbortController().signal },
				{ fetch: fetchMock },
			),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledWith(
			"https://bsky.social/xrpc/com.atproto.server.createSession",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("maps 401 to INTEGRATION_AUTH_REJECTED", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
		await expect(
			verifyBlueskyCredentials(
				{ handle: "a.bsky.social", appPassword: "wrong" },
				{ signal: new AbortController().signal },
				{ fetch: fetchMock },
			),
		).rejects.toMatchObject({ code: "INTEGRATION_AUTH_REJECTED" });
	});

	it("maps 429 to INTEGRATION_RATE_LIMITED", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
		await expect(
			verifyBlueskyCredentials(
				{ handle: "a.bsky.social", appPassword: "x" },
				{ signal: new AbortController().signal },
				{ fetch: fetchMock },
			),
		).rejects.toMatchObject({ code: "INTEGRATION_RATE_LIMITED" });
	});
});

describe("verifyMastodonCredentials", () => {
	it("succeeds on a 2xx verify_credentials response", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		await expect(
			verifyMastodonCredentials(
				{ instanceUrl: "https://mastodon.social", accessToken: "tok" },
				{ signal: new AbortController().signal },
				{ fetch: fetchMock },
			),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledWith(
			"https://mastodon.social/api/v1/accounts/verify_credentials",
			expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
		);
	});

	it("maps 403 to INTEGRATION_AUTH_REJECTED", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 403 }));
		await expect(
			verifyMastodonCredentials(
				{ instanceUrl: "https://mastodon.social", accessToken: "bad" },
				{ signal: new AbortController().signal },
				{ fetch: fetchMock },
			),
		).rejects.toMatchObject({ code: "INTEGRATION_AUTH_REJECTED" });
	});
});

describe("postToBluesky", () => {
	it("creates a session then posts a record with the given text", async () => {
		const calls: string[] = [];
		const fetchMock = vi.fn(async (url: string) => {
			calls.push(url);
			if (url.includes("createSession")) {
				return new Response(JSON.stringify({ accessJwt: "jwt-1", did: "did:plc:abc" }), {
					status: 200,
				});
			}
			return new Response("{}", { status: 200 });
		});
		await postToBluesky({ handle: "a.bsky.social", appPassword: "pw" }, "hello world", {
			fetch: fetchMock as never,
		});
		expect(calls[0]).toContain("createSession");
		expect(calls[1]).toContain("createRecord");
	});

	it("throws when session creation fails", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
		await expect(
			postToBluesky({ handle: "a.bsky.social", appPassword: "bad" }, "hi", {
				fetch: fetchMock as never,
			}),
		).rejects.toBeInstanceOf(SocialSyndicationVerifyError);
	});

	it("throws when the post itself fails after a successful session", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("createSession")) {
				return new Response(JSON.stringify({ accessJwt: "jwt", did: "did:plc:x" }), {
					status: 200,
				});
			}
			return new Response("", { status: 500 });
		});
		await expect(
			postToBluesky({ handle: "a.bsky.social", appPassword: "pw" }, "hi", {
				fetch: fetchMock as never,
			}),
		).rejects.toBeInstanceOf(SocialSyndicationVerifyError);
	});
});

describe("postToMastodon", () => {
	it("posts a status with the given text", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		await postToMastodon({ instanceUrl: "https://mastodon.social", accessToken: "tok" }, "hello", {
			fetch: fetchMock as never,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://mastodon.social/api/v1/statuses",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ status: "hello" }),
			}),
		);
	});

	it("throws on a non-ok response", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 422 }));
		await expect(
			postToMastodon({ instanceUrl: "https://mastodon.social", accessToken: "tok" }, "hi", {
				fetch: fetchMock as never,
			}),
		).rejects.toBeInstanceOf(SocialSyndicationVerifyError);
	});
});

describe("connectSocialSyndicationProvider", () => {
	beforeEach(() => {
		vi.spyOn(runtimeEnv, "getAstropressRootSecret").mockReturnValue("root-secret");
	});

	it("rejects when the root secret is not configured (fail closed)", async () => {
		vi.spyOn(runtimeEnv, "getAstropressRootSecret").mockImplementation(() => {
			throw new Error("no root secret");
		});
		const result = await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "pw",
		} as never);
		expect(result).toEqual({
			ok: false,
			error: "Root secret is not configured — cannot seal a posting credential.",
		});
	});

	it("rejects bluesky with missing fields before ever calling fetch", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "",
			appPassword: "",
		} as never);
		expect(result.ok).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not persist when Bluesky verify fails", async () => {
		withNoStore();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 401 })),
		);
		const result = await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "wrong",
		} as never);
		expect(result.ok).toBe(false);
	});

	it("REAL D1-backed round trip: connects Bluesky, seals it, and it's readable back via listConnectedSocialSyndicationProviders", async () => {
		const db = makeDb();
		withD1Backed(db);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
		);

		const result = await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "correct-app-password",
		} as never);
		expect(result).toEqual({ ok: true });

		const connected = await listConnectedSocialSyndicationProviders(undefined);
		expect(connected.has("bluesky")).toBe(true);
		expect(connected.has("mastodon")).toBe(false);
	});

	it("REAL D1-backed: Bluesky and Mastodon can both be connected simultaneously (isActive doesn't exclude either)", async () => {
		const db = makeDb();
		withD1Backed(db);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
		);

		await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "pw",
		} as never);
		await connectSocialSyndicationProvider(undefined, "mastodon", {
			instanceUrl: "https://mastodon.social",
			accessToken: "tok",
		} as never);

		const connected = await listConnectedSocialSyndicationProviders(undefined);
		expect(connected.has("bluesky")).toBe(true);
		expect(connected.has("mastodon")).toBe(true);
	});
});

describe("listConnectedSocialSyndicationProviders", () => {
	it("returns an empty set when nothing is connected", async () => {
		const db = makeDb();
		withD1Backed(db);
		const connected = await listConnectedSocialSyndicationProviders(undefined);
		expect(connected.size).toBe(0);
	});
});

describe("runSocialSyndicationOnPublish", () => {
	beforeEach(() => {
		vi.spyOn(runtimeEnv, "getAstropressRootSecret").mockReturnValue("root-secret");
		vi.spyOn(runtimeEnv, "getAstropressRootSecretCandidates").mockReturnValue(["root-secret"]);
	});

	it("does nothing (no fetch calls) when neither network is connected", async () => {
		withNoStore();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await runSocialSyndicationOnPublish({
			slug: "hello",
			kind: "post",
			status: "published",
			actor: "a@b.com",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("REAL D1-backed: posts to Bluesky using the sealed credential composed from title + canonicalUrl", async () => {
		const db = makeDb();
		withD1Backed(db);
		const postBodies: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				if (url.includes("createSession")) {
					return new Response(JSON.stringify({ accessJwt: "jwt", did: "did:plc:x" }), {
						status: 200,
					});
				}
				if (url.includes("createRecord")) {
					postBodies.push(String(init?.body));
					return new Response("{}", { status: 200 });
				}
				return new Response("{}", { status: 200 });
			}),
		);

		await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "pw",
		} as never);

		await runSocialSyndicationOnPublish({
			slug: "hello-world",
			kind: "post",
			status: "published",
			actor: "a@b.com",
			title: "Hello World",
			canonicalUrl: "https://example.com/hello-world",
		});

		expect(postBodies).toHaveLength(1);
		expect(postBodies[0]).toContain("Hello World");
		expect(postBodies[0]).toContain("https://example.com/hello-world");
	});

	it("a Bluesky post failure does not prevent a Mastodon attempt (best-effort, independent per network)", async () => {
		const db = makeDb();
		withD1Backed(db);
		const mastodonCalls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.includes("bsky") || url.includes("createSession") || url.includes("createRecord")) {
					return new Response("", { status: 500 });
				}
				if (url.includes("statuses")) {
					mastodonCalls.push(url);
					return new Response("{}", { status: 200 });
				}
				return new Response("{}", { status: 200 });
			}),
		);

		await connectSocialSyndicationProvider(undefined, "bluesky", {
			handle: "a.bsky.social",
			appPassword: "pw",
		} as never);
		await connectSocialSyndicationProvider(undefined, "mastodon", {
			instanceUrl: "https://mastodon.social",
			accessToken: "tok",
		} as never);

		await expect(
			runSocialSyndicationOnPublish({
				slug: "hello-world",
				kind: "post",
				status: "published",
				actor: "a@b.com",
				title: "Hello World",
				canonicalUrl: "https://example.com/hello-world",
			}),
		).resolves.toBeUndefined();

		expect(mastodonCalls).toHaveLength(1);
	});

	it("never throws even when everything fails (findSealedSecret's own root-secret resolution also fails closed)", async () => {
		vi.spyOn(runtimeEnv, "getAstropressRootSecret").mockImplementation(() => {
			throw new Error("boom");
		});
		withNoStore();
		await expect(
			runSocialSyndicationOnPublish({
				slug: "x",
				kind: "post",
				status: "published",
				actor: "a@b.com",
			}),
		).resolves.toBeUndefined();
	});
});

describe("SOCIAL_SYNDICATION_DOMAIN", () => {
	it("is a plain string, not registered in the IntegrationDomain union (deliberate — see module doc)", () => {
		expect(SOCIAL_SYNDICATION_DOMAIN).toBe("social-syndication");
	});
});
