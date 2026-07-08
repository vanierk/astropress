import { describe, expect, it } from "vitest";

import {
	apiErrors,
	jsonOk,
	jsonOkPaginated,
	jsonOkWithEtag,
	withApiRequest,
} from "../src/api-middleware.js";
import type { AstropressSecurityHeadersOptions } from "../src/security-headers.js";
import {
	applyAstropressSecurityHeaders,
	applyCacheHeaders,
	createAstropressSecureRedirect,
	createAstropressSecurityHeaders,
	isTrustedRequestOrigin,
	isTrustedStrictRequestOrigin,
} from "../src/security-headers.js";
import { resolveAstropressSecurityArea } from "../src/security-middleware.js";

// The standard security envelope every admin/api JSON response must carry (#103, #119).
const ENVELOPE_HEADERS = [
	"content-security-policy",
	"referrer-policy",
	"x-content-type-options",
	"permissions-policy",
	"cross-origin-resource-policy",
] as const;

function expectEnvelope(res: Response) {
	for (const header of ENVELOPE_HEADERS) {
		expect(res.headers.get(header), `missing ${header}`).toBeTruthy();
	}
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	// api/admin areas are same-site CORP, never cross-origin readable
	expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
}

describe("security headers", () => {
	it("builds a CSP that forbids inline scripts and framing by default", () => {
		// allowInlineStyles defaults to false — callers that need it must opt in explicitly
		const headers = createAstropressSecurityHeaders({
			area: "admin",
			allowInlineStyles: true,
		});
		const csp = headers.get("Content-Security-Policy") ?? "";

		expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
		expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
		expect(csp).toContain("style-src 'self' 'unsafe-inline'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(headers.get("X-Frame-Options")).toBe("DENY");
		expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
	});

	it("defaults allowInlineStyles to false — style-src excludes unsafe-inline without explicit opt-in", () => {
		const headers = createAstropressSecurityHeaders({ area: "admin" });
		const csp = headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("style-src 'self'");
		expect(csp).not.toContain("'unsafe-inline'");
	});

	it("sets Cross-Origin-Resource-Policy: same-site for admin, auth, and api areas", () => {
		for (const area of ["admin", "auth", "api"] as const) {
			const headers = createAstropressSecurityHeaders({ area });
			expect(headers.get("Cross-Origin-Resource-Policy"), `area: ${area}`).toBe("same-site");
		}
		// Public area does NOT get CORP
		const publicHeaders = createAstropressSecurityHeaders({ area: "public" });
		expect(publicHeaders.has("Cross-Origin-Resource-Policy")).toBe(false);
	});

	it("adds HSTS only when explicitly requested", () => {
		const withoutHsts = createAstropressSecurityHeaders({ area: "auth" });
		const withHsts = createAstropressSecurityHeaders({
			area: "auth",
			forceHsts: true,
		});

		expect(withoutHsts.has("Strict-Transport-Security")).toBe(false);
		expect(withHsts.get("Strict-Transport-Security")).toContain("max-age=31536000");
	});

	it("applies headers onto an existing collection and secures redirects", () => {
		const target = new Headers({ "Cache-Control": "no-store" });
		applyAstropressSecurityHeaders(target, { area: "api" });

		// applyAstropressSecurityHeaders sets Cache-Control to 'private, no-store' for api area
		expect(target.get("Cache-Control")).toBe("private, no-store");
		expect(target.get("Permissions-Policy")).toContain("camera=()");

		const response = createAstropressSecureRedirect("/ap-admin/login", 302);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/ap-admin/login");
		expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
		expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
	});

	it("CSP includes all required default directives with proper separators", () => {
		const csp = createAstropressSecurityHeaders().get("Content-Security-Policy") ?? "";
		expect(csp).toContain("base-uri 'self'");
		expect(csp).toContain("img-src 'self' data: https:");
		expect(csp).toContain("font-src 'self' data: https:");
		expect(csp).toContain("connect-src 'self' https:");
		expect(csp).toContain("media-src 'self' data: https:");
		expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
		expect(csp).toContain("worker-src 'self' blob:");
		expect(csp).toContain("manifest-src 'self'");
		expect(csp).toContain("upgrade-insecure-requests");
		expect(csp).toContain("; base-uri 'self'");
	});

	it("default area is public — object-src self and COOP same-origin", () => {
		const headers = createAstropressSecurityHeaders();
		const csp = headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("object-src 'self'");
		expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
	});

	it("accepts same-origin form posts and rejects cross-origin origins", () => {
		expect(
			isTrustedRequestOrigin(
				new Request("https://example.com/ap-admin/actions/content-save", {
					method: "POST",
					headers: { origin: "https://example.com" },
				}),
			),
		).toBe(true);

		expect(
			isTrustedRequestOrigin(
				new Request("https://example.com/ap-admin/actions/content-save", {
					method: "POST",
					headers: { origin: "https://attacker.example" },
				}),
			),
		).toBe(false);
	});

	it("adds report-uri and Report-To header when reportUri option is set", () => {
		const reportUri = "/ap-admin/actions/csp-report";
		const headers = createAstropressSecurityHeaders({
			area: "admin",
			reportUri,
		});
		const csp = headers.get("Content-Security-Policy") ?? "";

		expect(csp).toContain(`report-uri ${reportUri}`);
		expect(csp).toContain("report-to csp-endpoint");
		expect(headers.get("Report-To")).toContain("csp-endpoint");
		expect(headers.get("Report-To")).toContain(reportUri);
	});

	it("omits report-uri and Report-To when reportUri is not set", () => {
		const headers = createAstropressSecurityHeaders({ area: "admin" });
		const csp = headers.get("Content-Security-Policy") ?? "";

		expect(csp).not.toContain("report-uri");
		expect(csp).not.toContain("report-to");
		expect(headers.has("Report-To")).toBe(false);
	});

	it("rejects cross-origin requests and handles no-origin/no-referer (returns true)", () => {
		// referer check branch (origin absent, referer present)
		expect(
			isTrustedRequestOrigin(
				new Request("https://example.com/ap-admin/save", {
					method: "POST",
					headers: { referer: "https://example.com/ap-admin/page" },
				}),
			),
		).toBe(true); // same-origin referer → truthy

		expect(
			isTrustedRequestOrigin(
				new Request("https://example.com/ap-admin/save", {
					method: "POST",
					headers: { referer: "https://attacker.com/page" },
				}),
			),
		).toBe(false); // cross-origin referer → false

		// Lines 35-36: parseOrigin catch branch — invalid URL string in origin header
		expect(
			isTrustedRequestOrigin(
				new Request("https://example.com/ap-admin/save", {
					method: "POST",
					headers: { origin: "not-a-valid-url" },
				}),
			),
		).toBe(false); // origin header present but unparseable → return false (stricter: no fallback to referer)
	});

	it("uses SAMEORIGIN when frameAncestors option is not 'none'", () => {
		const headers = createAstropressSecurityHeaders({
			frameAncestors: "'self'",
		});
		expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
	});

	it("public area uses object-src self and form-action self https:", () => {
		const headers = createAstropressSecurityHeaders({ area: "public" });
		const csp = headers.get("Content-Security-Policy") ?? "";

		expect(csp).toContain("object-src 'self'");
		expect(csp).toContain("form-action 'self' https:");
	});

	it("admin/auth/api areas use object-src none and restricted form-action", () => {
		for (const area of ["admin", "auth", "api"] as const) {
			const csp = createAstropressSecurityHeaders({ area }).get("Content-Security-Policy") ?? "";
			expect(csp).toContain("object-src 'none'");
			expect(csp).toContain("form-action 'self'");
			expect(csp).not.toContain("form-action 'self' https:");
		}
	});

	it("disables inline styles when allowInlineStyles is false", () => {
		const csp =
			createAstropressSecurityHeaders({ allowInlineStyles: false }).get(
				"Content-Security-Policy",
			) ?? "";
		expect(csp).toContain("style-src 'self'");
		expect(csp).not.toContain("'unsafe-inline'");
	});

	it("applyCacheHeaders uses default 300/3600 TTL for public area", () => {
		const headers = new Headers();
		applyCacheHeaders(headers, "public");
		expect(headers.get("Cache-Control")).toBe(
			"public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
		);
	});

	it("applyCacheHeaders respects publicCacheTtl override for public area", () => {
		const headers = new Headers();
		applyCacheHeaders(headers, "public", 600);
		expect(headers.get("Cache-Control")).toBe(
			"public, max-age=600, s-maxage=7200, stale-while-revalidate=86400",
		);
	});

	it("applyCacheHeaders sets no-store for non-public areas regardless of publicCacheTtl", () => {
		for (const area of ["admin", "auth", "api"] as const) {
			const headers = new Headers();
			applyCacheHeaders(headers, area, 600);
			expect(headers.get("Cache-Control"), `area: ${area}`).toBe("private, no-store");
		}
	});

	it("isTrustedStrictRequestOrigin accepts same-origin origin header", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/accept-invite", {
					method: "POST",
					headers: { origin: "https://example.com" },
				}),
			),
		).toBe(true);
	});

	it("isTrustedStrictRequestOrigin rejects cross-origin origin header", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/accept-invite", {
					method: "POST",
					headers: { origin: "https://attacker.example" },
				}),
			),
		).toBe(false);
	});

	it("isTrustedStrictRequestOrigin accepts same-origin referer when origin absent", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/reset-password", {
					method: "POST",
					headers: { referer: "https://example.com/ap-admin/reset-password" },
				}),
			),
		).toBe(true);
	});

	it("isTrustedStrictRequestOrigin rejects cross-origin referer", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/reset-password", {
					method: "POST",
					headers: { referer: "https://attacker.example/page" },
				}),
			),
		).toBe(false);
	});

	it("isTrustedStrictRequestOrigin rejects requests with neither origin nor referer", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/accept-invite", {
					method: "POST",
				}),
			),
		).toBe(false);
	});

	it("isTrustedStrictRequestOrigin rejects invalid URL in origin header", () => {
		expect(
			isTrustedStrictRequestOrigin(
				new Request("https://example.com/ap-admin/actions/accept-invite", {
					method: "POST",
					headers: { origin: "not-a-valid-url" },
				}),
			),
		).toBe(false);
	});

	it("classifies public, auth, admin, and action routes for middleware application", () => {
		expect(resolveAstropressSecurityArea(new URL("https://example.com/"))).toBe("public");
		expect(resolveAstropressSecurityArea(new URL("https://example.com/ap-admin/login"))).toBe(
			"auth",
		);
		expect(resolveAstropressSecurityArea(new URL("https://example.com/ap-admin"))).toBe("admin");
		expect(
			resolveAstropressSecurityArea(
				new URL("https://example.com/ap-admin/actions/comment-moderate"),
			),
		).toBe("api");
	});
});

describe("CSP extra-origin extension (extraScriptSrc/extraConnectSrc/extraImgSrc/extraFontSrc/extraFrameSrc)", () => {
	// One full snapshot per representative option combo, computed from the
	// pre-extension behavior. If any of these ever changes when no extras
	// are passed, the extension has stopped being additive.
	const NO_EXTRAS_CASES: [string, AstropressSecurityHeadersOptions][] = [
		["defaults", {}],
		["admin area", { area: "admin" }],
		["public area with inline styles", { area: "public", allowInlineStyles: true }],
		["auth area with forceHsts", { area: "auth", forceHsts: true }],
		["api area with reportUri", { area: "api", reportUri: "/ap-admin/actions/csp-report" }],
		["frameAncestors 'self'", { frameAncestors: "'self'" }],
	];

	it.each(
		NO_EXTRAS_CASES,
	)("produces byte-identical CSP output when no extras are passed (%s)", (_label, options) => {
		const withoutExtraFields =
			createAstropressSecurityHeaders(options).get("Content-Security-Policy");
		const withExplicitEmptyExtras = createAstropressSecurityHeaders({
			...options,
			extraScriptSrc: [],
			extraConnectSrc: [],
			extraImgSrc: [],
			extraFontSrc: [],
			extraFrameSrc: [],
		}).get("Content-Security-Policy");

		expect(withExplicitEmptyExtras).toBe(withoutExtraFields);
		// Pin the exact known-good string for the plain no-options case so a
		// silent change to the base directives themselves is also caught.
		if (_label === "defaults") {
			expect(withoutExtraFields).toBe(
				"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https:; " +
					"img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; " +
					"media-src 'self' data: https:; script-src 'self' https://challenges.cloudflare.com; " +
					"style-src 'self'; object-src 'self'; frame-src 'self' https://challenges.cloudflare.com; " +
					"worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
			);
		}
	});

	it("appends valid extra origins to the correct directive without replacing the default allowlist", () => {
		const csp = createAstropressSecurityHeaders({
			extraScriptSrc: ["https://client.crisp.chat", "https://app.cal.com"],
			extraConnectSrc: ["https://*.crisp.chat", "wss://*.relay.crisp.chat"],
			extraImgSrc: ["https://static.intercomassets.com"],
			extraFontSrc: ["https://js.intercomcdn.com"],
			extraFrameSrc: ["https://*.cal.com"],
		}).get("Content-Security-Policy");

		expect(csp).toContain(
			"script-src 'self' https://challenges.cloudflare.com https://client.crisp.chat https://app.cal.com",
		);
		expect(csp).toContain(
			"connect-src 'self' https: https://*.crisp.chat wss://*.relay.crisp.chat",
		);
		expect(csp).toContain("img-src 'self' data: https: https://static.intercomassets.com");
		expect(csp).toContain("font-src 'self' data: https: https://js.intercomcdn.com");
		expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com https://*.cal.com");
	});

	it("accepts a wildcard-host origin (CSP host wildcard, distinct from a bare '*')", () => {
		const csp = createAstropressSecurityHeaders({
			extraScriptSrc: ["https://*.tawk.to"],
		}).get("Content-Security-Policy");
		expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com https://*.tawk.to");
	});

	it("accepts an origin with a port (self-hosted Chatwoot on a non-standard port)", () => {
		const csp = createAstropressSecurityHeaders({
			extraConnectSrc: ["wss://chat.example.com:8443"],
		}).get("Content-Security-Policy");
		expect(csp).toContain("connect-src 'self' https: wss://chat.example.com:8443");
	});

	it("limits the extension surface to exactly the five documented directives — base-uri and upgrade-insecure-requests are untouched", () => {
		const csp = createAstropressSecurityHeaders({
			extraScriptSrc: ["https://client.crisp.chat"],
		}).get("Content-Security-Policy");
		expect(csp).toContain("base-uri 'self'");
		expect(csp).toContain("upgrade-insecure-requests");
		expect(csp).not.toContain("base-uri 'self' https://client.crisp.chat");
	});

	describe("rejects malicious/malformed extra origins (throws, never silently drops)", () => {
		const MALICIOUS_INPUTS = [
			["a CSP keyword", "'unsafe-inline'"],
			["a semicolon directive-injection attempt", "https://x.com; script-src *"],
			["a bare wildcard", "*"],
			["two origins separated by whitespace", "https://a.com https://b.com"],
			["unsafe-eval", "'unsafe-eval'"],
			["a nonce source", "'nonce-abc123'"],
			["strict-dynamic", "'strict-dynamic'"],
			["a data: scheme", "data:text/html,<script>alert(1)</script>"],
			["a blob: scheme", "blob:https://example.com/uuid"],
			["a plain http: origin (not https/wss)", "http://insecure.example.com"],
			["an empty string", ""],
			["a host with no scheme", "client.crisp.chat"],
		] as const;

		it.each(MALICIOUS_INPUTS)("rejects %s (%j) in extraScriptSrc", (_label, value) => {
			expect(() => createAstropressSecurityHeaders({ extraScriptSrc: [value] })).toThrow(
				/Invalid CSP origin/,
			);
		});

		it("rejects a malicious entry regardless of which of the five directives carries it", () => {
			for (const field of [
				"extraScriptSrc",
				"extraConnectSrc",
				"extraImgSrc",
				"extraFontSrc",
				"extraFrameSrc",
			] as const) {
				expect(() => createAstropressSecurityHeaders({ [field]: ["'unsafe-inline'"] })).toThrow(
					/Invalid CSP origin/,
				);
			}
		});

		it("throws before returning any headers — a bad entry never partially applies", () => {
			expect(() =>
				createAstropressSecurityHeaders({
					extraScriptSrc: ["https://good.example.com", "'unsafe-inline'"],
				}),
			).toThrow(/Invalid CSP origin/);
		});
	});
});

describe("API middleware security envelope (#119)", () => {
	it("jsonOk carries the envelope", () => {
		expectEnvelope(jsonOk({ ok: true }));
	});

	it("jsonOkPaginated carries the envelope and keeps the total-count header", () => {
		const res = jsonOkPaginated({ records: [] }, 7);
		expectEnvelope(res);
		expect(res.headers.get("x-total-count")).toBe("7");
	});

	it("jsonOkWithEtag carries the envelope on both the 200 and the 304 path", () => {
		const body = { hello: "world" };
		const full = jsonOkWithEtag(body, new Request("https://x.test/"));
		expectEnvelope(full);
		const etag = full.headers.get("etag");
		expect(etag).toBeTruthy();

		const notModified = jsonOkWithEtag(
			body,
			new Request("https://x.test/", { headers: { "If-None-Match": etag as string } }),
		);
		expect(notModified.status).toBe(304);
		expectEnvelope(notModified);
	});

	it("withApiRequest auth-failure responses stay inside the envelope", async () => {
		const res = await withApiRequest(
			new Request("https://x.test/ap-api/v1/content"),
			{
				apiTokens: { verify: async () => ({ valid: false, reason: "no" }) } as never,
				checkRateLimit: () => true,
			},
			["content:read"],
			async () => jsonOk({ unreachable: true }),
		);
		expect(res.status).toBe(401);
		expectEnvelope(res);
	});

	it("apiErrors shapes flow through the envelope via withApiRequest", async () => {
		const res = await withApiRequest(
			new Request("https://x.test/ap-api/v1/content", {
				headers: { Authorization: "Bearer t" },
			}),
			{
				apiTokens: {
					verify: async () => ({ valid: true, record: { id: "t", scopes: [] } }),
				} as never,
				checkRateLimit: () => true,
			},
			["content:read"],
			async () => apiErrors.notFound("nope"),
		);
		// token lacks the required scope → 403, still enveloped
		expect(res.status).toBe(403);
		expectEnvelope(res);
	});
});

describe("admin media JSON endpoint security envelope (#103)", () => {
	it("applies the admin envelope + private,no-store on the 401 auth-failure path", async () => {
		const { GET } = await import("../pages/ap-admin/api/media.js");
		const res = await GET({ locals: { adminUser: undefined } } as never);
		expect(res.status).toBe(401);
		expectEnvelope(res);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
	});
});
