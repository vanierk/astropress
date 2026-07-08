export type AstropressSecurityArea = "admin" | "auth" | "public" | "api";

/**
 * Confirmed third-party CSP origins for the embed components built this
 * session (heatmaps, events, reviews, referrals, live-chat), for use with
 * extraScriptSrc/extraConnectSrc/extraImgSrc/extraFontSrc/extraFrameSrc
 * below. Confidence varies by row — see the note on each.
 *
 * Bluesky / Mastodon (social-syndication) are NOT listed: posting happens
 * server-side (a fetch call at publish time), so there is no client-side
 * script and no CSP entry is needed for that feature at all.
 *
 *                    script-src                              connect-src / frame-src
 * Clarity            www.clarity.ms                          not verified this pass — confirm against Clarity's current CSP docs
 * Hotjar             static.hotjar.com                       not verified this pass — confirm against Hotjar's current CSP docs
 * Cal.com            app.cal.com (*.cal.com per Cal's docs)  connect-src *.cal.com; frame-src *.cal.com (also references s3.amazonaws.com for uploads) — verified
 * Calendly           assets.calendly.com                     not verified this pass — confirm against Calendly's current CSP docs
 * Trustpilot         widget.trustpilot.com                   not verified this pass — confirm against Trustpilot's current CSP docs
 * Rewardful          r.wdfl.co                                not verified this pass — confirm against Rewardful's current CSP docs
 * FirstPromoter      cdn.firstpromoter.com                   not verified this pass — confirm against FirstPromoter's current CSP docs
 * Crisp              client.crisp.chat                       connect-src *.crisp.chat, wss://*.relay.crisp.chat, wss://*.relay.rescue.crisp.chat — verified (wss: required, not ws: or long-polling)
 * Tawk.to            embed.tawk.to                           connect-src *.tawk.to (wildcard; Tawk.to's own guidance recommends the whole subdomain family) — verified at the wildcard level
 * Chatwoot           <your baseUrl> (self-hosted or app.chatwoot.com)  connect-src wss://<your baseUrl>/cable — verified (must be wss:, not ws:)
 * Intercom           widget.intercom.io, js.intercomcdn.com   connect-src *.intercom.io, wss://*.intercom.io (easy to miss); img-src static.intercomassets.com, *.intercomcdn.com; font-src js.intercomcdn.com; frame-src intercom-sheets.com — verified (documented for awareness; not a configurable liveChat provider)
 *
 * Rows marked "not verified this pass" had their script-src origin
 * confirmed directly from the component that loads them; their
 * connect-src/img-src/frame-src needs were not independently re-checked
 * against the provider's current docs and should be confirmed before
 * relying on them as complete guidance.
 */
export interface AstropressSecurityHeadersOptions {
	area?: AstropressSecurityArea;
	allowInlineStyles?: boolean;
	frameAncestors?: "'none'" | "'self'";
	forceHsts?: boolean;
	reportUri?: string;
	/**
	 * Extra allowed origins for embedding third-party scripts (chat,
	 * booking, analytics widgets, etc.) beyond Astropress's default
	 * allowlist ('self' + Cloudflare Turnstile). Purely additive: omitting
	 * these five options produces byte-identical CSP output to before they
	 * existed. See the reference table above for confirmed per-provider
	 * values.
	 *
	 * Each entry MUST be a bare origin — "https://host" or "wss://host",
	 * optionally with a CSP host wildcard ("https://*.host") or a port.
	 * Anything else throws: a CSP keyword ('unsafe-inline', 'unsafe-eval',
	 * a nonce/strict-dynamic source), a data:/blob: scheme, embedded
	 * whitespace, a semicolon, or a bare "*" are all rejected, since any of
	 * those would silently weaken CSP for every request rather than merely
	 * adding one origin.
	 */
	extraScriptSrc?: readonly string[];
	extraConnectSrc?: readonly string[];
	extraImgSrc?: readonly string[];
	extraFontSrc?: readonly string[];
	extraFrameSrc?: readonly string[];
}

function parseOrigin(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

// Whitelist-style, not blacklist-style: only a bare "https://host" or
// "wss://host" origin matches (optionally "*.host" or ":port"). Anchored
// start-to-end, so anything appended after a valid origin (a semicolon, a
// second origin separated by whitespace, a CSP keyword) fails to match
// rather than needing to be individually blocklisted.
const CSP_ORIGIN_PATTERN =
	/^(https|wss):\/\/(\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+(?::[0-9]{1,5})?$/;

/**
 * Validates a single extra CSP origin. Throws rather than silently
 * dropping the entry: a malformed entry here means the host's own extra
 * origin never gets applied to the response CSP, and continuing to serve
 * the rest of the policy would look like success while quietly not doing
 * what was configured.
 */
function assertValidCspOrigin(value: string, directiveName: string): void {
	if (!CSP_ORIGIN_PATTERN.test(value)) {
		throw new Error(
			`Invalid CSP origin "${value}" for ${directiveName}: must be a bare "https://host" or "wss://host" origin ` +
				`(optionally "https://*.host" or with a port). CSP keywords (e.g. 'unsafe-inline'), data:/blob: schemes, ` +
				'embedded whitespace, semicolons, and a bare "*" are not allowed.',
		);
	}
}

function extendDirective(
	base: string,
	extras: readonly string[] | undefined,
	directiveName: string,
): string {
	if (!extras || extras.length === 0) return base;
	for (const origin of extras) {
		assertValidCspOrigin(origin, directiveName);
	}
	return `${base} ${extras.join(" ")}`;
}

function buildContentSecurityPolicy(options: Required<AstropressSecurityHeadersOptions>) {
	const styleSource = options.allowInlineStyles
		? "style-src 'self' 'unsafe-inline'"
		: "style-src 'self'";
	const objectSource = options.area === "public" ? "object-src 'self'" : "object-src 'none'";
	const formAction = options.area === "public" ? "form-action 'self' https:" : "form-action 'self'";

	const directives = [
		"default-src 'self'",
		"base-uri 'self'",
		`frame-ancestors ${options.frameAncestors}`,
		formAction,
		extendDirective("img-src 'self' data: https:", options.extraImgSrc, "img-src"),
		extendDirective("font-src 'self' data: https:", options.extraFontSrc, "font-src"),
		extendDirective("connect-src 'self' https:", options.extraConnectSrc, "connect-src"),
		"media-src 'self' data: https:",
		extendDirective(
			"script-src 'self' https://challenges.cloudflare.com",
			options.extraScriptSrc,
			"script-src",
		),
		styleSource,
		objectSource,
		extendDirective(
			"frame-src 'self' https://challenges.cloudflare.com",
			options.extraFrameSrc,
			"frame-src",
		),
		"worker-src 'self' blob:",
		"manifest-src 'self'",
		"upgrade-insecure-requests",
	];

	if (options.reportUri) {
		directives.push(`report-uri ${options.reportUri}`, "report-to csp-endpoint");
	}

	return directives.join("; ");
}

export function createAstropressSecurityHeaders(
	options: AstropressSecurityHeadersOptions = {},
): Headers {
	const resolved: Required<AstropressSecurityHeadersOptions> = {
		area: options.area ?? "public",
		allowInlineStyles: options.allowInlineStyles ?? false,
		frameAncestors: options.frameAncestors ?? "'none'",
		forceHsts: options.forceHsts ?? false,
		reportUri: options.reportUri ?? "",
		extraScriptSrc: options.extraScriptSrc ?? [],
		extraConnectSrc: options.extraConnectSrc ?? [],
		extraImgSrc: options.extraImgSrc ?? [],
		extraFontSrc: options.extraFontSrc ?? [],
		extraFrameSrc: options.extraFrameSrc ?? [],
	};

	const headers = new Headers();
	headers.set("Content-Security-Policy", buildContentSecurityPolicy(resolved));
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("X-Frame-Options", resolved.frameAncestors === "'none'" ? "DENY" : "SAMEORIGIN");
	headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
	headers.set("Cross-Origin-Opener-Policy", "same-origin");

	if (resolved.area === "admin" || resolved.area === "api" || resolved.area === "auth") {
		headers.set("Cross-Origin-Resource-Policy", "same-site");
	}

	if (resolved.forceHsts) {
		headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	}

	if (resolved.reportUri) {
		headers.set(
			"Report-To",
			JSON.stringify({
				group: "csp-endpoint",
				max_age: 86400,
				endpoints: [{ url: resolved.reportUri }],
			}),
		);
	}

	return headers;
}

export function applyCacheHeaders(
	headers: Headers,
	area: AstropressSecurityArea = "public",
	publicCacheTtl?: number,
): void {
	if (area === "public") {
		// Public content: short browser cache, longer CDN cache, stale-while-revalidate for background refresh
		const browserTtl = publicCacheTtl ?? 300;
		const cdnTtl = publicCacheTtl != null ? publicCacheTtl * 12 : 3600;
		headers.set(
			"Cache-Control",
			`public, max-age=${browserTtl}, s-maxage=${cdnTtl}, stale-while-revalidate=86400`,
		);
	} else {
		// Admin, auth, and API responses must never be cached
		headers.set("Cache-Control", "private, no-store");
	}
}

export function applyAstropressSecurityHeaders(
	target: Headers,
	options: AstropressSecurityHeadersOptions = {},
): Headers {
	const generated = createAstropressSecurityHeaders(options);
	generated.forEach((value, key) => {
		target.set(key, value);
	});
	applyCacheHeaders(target, options.area ?? "public");
	return target;
}

export function createAstropressSecureRedirect(
	location: string,
	status = 302,
	options: AstropressSecurityHeadersOptions = {},
): Response {
	const headers = createAstropressSecurityHeaders({ area: "api", ...options });
	headers.set("Location", location);
	return new Response(null, { status, headers });
}

export function isTrustedRequestOrigin(request: Request): boolean {
	let requestOrigin: string;
	try {
		requestOrigin = new URL(request.url).origin;
	} catch {
		return false;
	}

	const rawOrigin = request.headers.get("origin");
	if (rawOrigin !== null) {
		const origin = parseOrigin(rawOrigin);
		if (origin === null) return false;
		return origin.origin === requestOrigin;
	}

	const rawReferer = request.headers.get("referer");
	if (rawReferer !== null) {
		const referer = parseOrigin(rawReferer);
		if (referer === null) return false;
		return referer.origin === requestOrigin;
	}

	return true;
}

export function isTrustedStrictRequestOrigin(request: Request): boolean {
	let requestOrigin: string;
	try {
		requestOrigin = new URL(request.url).origin;
	} catch {
		return false;
	}

	const origin = parseOrigin(request.headers.get("origin") ?? "");
	if (request.headers.get("origin") !== null) {
		if (!origin) return false;
		return origin.origin === requestOrigin;
	}

	const referer = parseOrigin(request.headers.get("referer") ?? "");
	if (request.headers.get("referer") !== null) {
		if (!referer) return false;
		return referer.origin === requestOrigin;
	}

	return false;
}
