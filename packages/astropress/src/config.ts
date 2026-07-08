export type {
	AstropressContentEvent,
	AstropressMediaEvent,
	AstropressPlugin,
} from "./cms-plugins.js";
export type {
	ContentTypeDefinition,
	FieldDefinition,
} from "./content-modeling.js";
export { validateContentFields } from "./content-modeling.js";

import type { AstropressPlugin } from "./cms-plugins.js";
import type { CmsAdminConfig } from "./config-admin.js";
import type {
	AbTestingConfig,
	AnalyticsConfig,
	AstropressApiConfig,
	DonationsConfig,
	EventsConfig,
	HeatmapsConfig,
	LocalBusinessConfig,
	ReferralsConfig,
	ReviewsConfig,
	SocialSyndicationConfig,
	TestimonialsConfig,
} from "./config-service-types.js";
import type { ContentTypeDefinition } from "./content-modeling.js";

export type {
	CmsAdminBranding,
	CmsAdminConfig,
	CmsAdminLabels,
	CmsAdminNavigationKey,
} from "./config-admin.js";

export type {
	AbTestingConfig,
	AnalyticsConfig,
	AstropressApiConfig,
	DonationsConfig,
	EventsConfig,
	GiveLivelyConfig,
	HeatmapsConfig,
	LiberapayConfig,
	LocalBusinessConfig,
	PledgeCryptoConfig,
	ReferralsConfig,
	ReviewsConfig,
	SocialSyndicationConfig,
	TestimonialsConfig,
} from "./config-service-types.js";

// ─── Main config ─────────────────────────────────────────────────────────────

/**
 * CmsConfig — the single seam between astropress and the host site.
 *
 * Call registerCms() once at startup (e.g. in src/site/cms-registration.ts imported by
 * middleware or the admin layout) before any astropress function is invoked.
 *
 * **Forward-looking note:** the provider-shaped fields on `CmsConfig` —
 * `analytics`, `newsletter`, `forms`, `abTesting`, `search`,
 * `cdnPurgeWebhook`, `monitoring`, `donations`, `testimonials` — are
 * targeted for migration into the per-domain integration registry
 * (Phase 3/4). The runtime adapters already prefer the registry's
 * `connected_integrations` row when one is present and fall back to
 * the static field. The static-config code paths will remain as a
 * deprecation shim for one cycle so existing
 * `registerCms({ analytics: ... })` call sites continue to boot. The
 * intended split is documented by the {@link CoreCmsConfig} and
 * {@link LegacyIntegrationsConfig} type aliases below.
 */

export interface CmsConfig {
	/** Template keys that are valid for structured page routes (e.g. "home", "impact"). */
	templateKeys: readonly string[];

	/** Canonical base URL of the site, e.g. "https://example.com". Used for sitemap, canonical tags, etc. */
	siteUrl: string;

	/** Human-readable site name used in transactional emails and admin UI. Defaults to "Astropress". */
	siteName?: string;

	/**
	 * Seeded content records loaded from the host site's pages.json.
	 * Typed loosely so the framework does not need to know the host's full page schema.
	 */
	// audit-boundary: opaque-passthrough -- user-supplied CMS config; narrowed at consumer
	seedPages: readonly Record<string, unknown>[];

	/**
	 * Archive sources loaded from the host site's archives.json.
	 * Used to build archive index and SEO pages in the admin.
	 */
	archives: ReadonlyArray<{
		slug: string;
		title: string;
		kind: string;
		legacyUrl: string;
		// audit-boundary: opaque-passthrough -- user-supplied CMS config; narrowed at consumer
		listingItems?: readonly Record<string, unknown>[];
	}>;

	/**
	 * Translation status entries from the host site's translation-status.json.
	 * Used to build the translation dashboard and SEO page.
	 */
	translationStatus: ReadonlyArray<{
		route: string;
		translationState: string;
		englishSourceUrl: string;
		locale: string;
	}>;

	/**
	 * Optional admin-shell customization. Hosts can rename labels and swap simple
	 * brand assets without forking Astropress admin templates.
	 */
	admin?: CmsAdminConfig;

	/**
	 * Optional list of locale prefixes used in URL paths (e.g. ["en", "es", "fr"]).
	 *
	 * When set, `localeFromPath("/es/my-post/")` will return `"es"` for any prefix
	 * in this list, and fall back to the first entry (or `"en"`) for unmatched paths.
	 *
	 * When unset, the default is `["en", "es"]` (backwards-compatible behaviour).
	 *
	 * @example
	 * ```ts
	 * registerCms({
	 *   locales: ["en", "es", "fr", "de"],
	 *   // ...
	 * });
	 * ```
	 */
	locales?: readonly string[];

	/**
	 * Optional analytics / heatmap integration.
	 * When configured, an "Analytics" entry appears in the admin services sidebar.
	 */
	analytics?: AnalyticsConfig;

	/**
	 * Optional heatmaps / session-replay integration (Microsoft Clarity, Hotjar,
	 * or a custom snippet). This is a data declaration only — Astropress does
	 * not auto-emit it; render `resolveHeatmapsSnippet()`'s output in your own
	 * site layout `<head>` (see the `heatmaps.ts` module doc comment). Heatmaps
	 * themselves are always viewed in the provider's own dashboard, never
	 * inside Astropress admin. Hosts already using `analytics: { type: "posthog" }`
	 * get session replay/heatmaps from that same snippet with no extra config.
	 */
	heatmaps?: HeatmapsConfig;

	/**
	 * Optional scheduling/booking widget integration (Cal.com, Calendly, or a
	 * custom embed). This is a data declaration only — Astropress does not
	 * auto-emit it; render `<AstropressEventsEmbed>` in your own site layout
	 * (see the component's doc comment). RSVP/attendee data always lives in
	 * the provider's own dashboard — Astropress has no visibility into
	 * bookings made through the widget.
	 */
	events?: EventsConfig;

	/**
	 * Optional third-party review display widget (Trustpilot, or a custom
	 * embed). This is a data declaration only — Astropress does not
	 * auto-emit it; render `<AstropressReviewsEmbed>` in your own site
	 * layout (see the component's doc comment). Review responses happen in
	 * the provider's own dashboard — Astropress only displays the widget.
	 */
	reviews?: ReviewsConfig;

	/**
	 * Optional referral-link arrival tracking (Rewardful, FirstPromoter, or a
	 * custom embed). This is a data declaration only — Astropress does not
	 * auto-emit it; render `<AstropressReferralsEmbed>` in your own site
	 * layout (see the component's doc comment).
	 *
	 * This tracks referral-link ARRIVAL only (a visitor landed via a
	 * referral link). It does NOT track conversions or payouts — turning an
	 * arrival into a payout requires your own checkout code to separately
	 * report the conversion to the provider's server-side API (e.g.
	 * attaching the referral ID to a Stripe customer, or calling a
	 * provider's conversion endpoint). Astropress does not do this and has
	 * no visibility into your checkout flow.
	 */
	referrals?: ReferralsConfig;

	/**
	 * Optional auto-post-on-publish declaration for Bluesky/Mastodon. Only
	 * non-secret identifying fields (handle, instance URL) live here — the
	 * app password / access token are submitted via the admin connect form
	 * and stored as a sealed secret (see social-syndication.ts), never as a
	 * plaintext CmsConfig field. Setting this field enables a call to the
	 * existing onContentPublish dispatch point (see
	 * runtime-actions-content.ts / social-syndication.ts's module doc for
	 * why this isn't wired through CmsConfig.plugins/registerCms()).
	 */
	socialSyndication?: SocialSyndicationConfig;

	/**
	 * Optional donation / fundraising integrations.
	 * When configured, a "Fundraising" entry appears in the admin sidebar.
	 * Multiple providers can be enabled simultaneously.
	 */
	donations?: DonationsConfig;

	/**
	 * Optional testimonials and referral capture via Formbricks or Typebot.
	 * When configured, a "Testimonials" entry appears in the admin sidebar and
	 * the /ap-api/v1/testimonials/ingest webhook endpoint becomes active.
	 */
	testimonials?: TestimonialsConfig;

	/**
	 * Optional A/B testing / feature flag integration.
	 * When configured, an "A/B Testing" entry appears in the admin services sidebar.
	 */
	abTesting?: AbTestingConfig;

	/**
	 * Optional business details for schema.org/LocalBusiness JSON-LD, editable
	 * from /ap-admin/maps-local. This is a data declaration only — Astropress
	 * does not auto-emit it; render `<AstropressLocalBusinessJsonLd>` in your
	 * own site layout (see the component's doc comment).
	 */
	localBusiness?: LocalBusinessConfig;

	/**
	 * Optional REST API configuration.
	 * When api.enabled is true, /ap-api/v1/* endpoints are active and
	 * API Tokens + Webhooks appear in the admin sidebar.
	 * Default: disabled (all /ap-api/* routes return 404).
	 */
	api?: AstropressApiConfig;

	/**
	 * Cache lifetime in seconds for public (non-admin, non-API) pages.
	 *
	 * Sets `Cache-Control: public, max-age=<publicCacheTtl>, s-maxage=<publicCacheTtl * 12>`.
	 * Defaults to 300 (5 minutes) with a CDN TTL of 3600 (1 hour).
	 *
	 * @example
	 * ```ts
	 * registerCms({ publicCacheTtl: 600, ... });
	 * // → Cache-Control: public, max-age=600, s-maxage=7200
	 * ```
	 */
	publicCacheTtl?: number;

	/**
	 * Maximum number of days to retain audit log entries.
	 *
	 * When set, the audit log writer prunes records older than this many days on each write,
	 * keeping the `audit_events` table bounded without a separate cron job.
	 * Defaults to `90` when unset. Set to `0` to disable automatic pruning.
	 *
	 * @example
	 * ```ts
	 * registerCms({ auditRetentionDays: 30, ... }); // keep 30 days of audit history
	 * ```
	 */
	auditRetentionDays?: number;

	/**
	 * Maximum allowed size of a single media upload in bytes.
	 *
	 * When set, the admin media-upload action rejects files larger than this value
	 * before reading the full body, returning a descriptive error to the user.
	 * Defaults to `10 * 1024 * 1024` (10 MiB) when unset.
	 *
	 * @example
	 * ```ts
	 * registerCms({ maxUploadBytes: 5 * 1024 * 1024, ... }); // 5 MiB
	 * ```
	 */
	maxUploadBytes?: number;

	/**
	 * Optional content type definitions that add typed, validated custom fields to content records.
	 *
	 * When a content type is defined for a `templateKey`, its field values are read from and written to
	 * the `metadata` JSON column, and are validated by `saveRuntimeContentState` before persisting.
	 *
	 * @example
	 * ```ts
	 * registerCms({
	 *   contentTypes: [
	 *     {
	 *       key: "event",
	 *       label: "Event",
	 *       fields: [
	 *         { name: "eventDate", label: "Event Date", type: "date", required: true },
	 *         { name: "venue", label: "Venue", type: "text" },
	 *       ],
	 *     },
	 *   ],
	 *   // ...
	 * });
	 * ```
	 */
	contentTypes?: readonly ContentTypeDefinition[];

	/**
	 * Optional list of plugins that extend Astropress with lifecycle hooks
	 * or additional admin navigation items.
	 *
	 * @example
	 * ```ts
	 * import type { AstropressPlugin } from "@astropress-diy/astropress";
	 *
	 * const searchPlugin: AstropressPlugin = {
	 *   name: "search-indexer",
	 *   async onContentSave({ slug, status }) {
	 *     if (status === "published") {
	 *       await searchIndex.upsert(slug);
	 *     }
	 *   },
	 * };
	 *
	 * registerCms({ ..., plugins: [searchPlugin] });
	 * ```
	 */
	plugins?: readonly AstropressPlugin[];

	/**
	 * Optional CDN purge webhook URL.
	 * When set, Astropress will POST `{ slug, purgedAt }` to this URL after content is published.
	 * Supports Cloudflare deploy hooks, Vercel deploy hooks, and Netlify build hooks.
	 *
	 * For Cloudflare Cache API purging, set `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN`
	 * environment variables instead of (or in addition to) this webhook URL.
	 *
	 * @example
	 * ```ts
	 * registerCms({
	 *   cdnPurgeWebhook: process.env.NETLIFY_BUILD_HOOK_URL,
	 * });
	 * ```
	 */
	cdnPurgeWebhook?: string;

	/**
	 * Optional full-text search configuration.
	 * When `enabled` is true, an FTS5 virtual table is created for `content_overrides`
	 * and the REST API accepts `?q=` for full-text search.
	 */
	search?: {
		/** Enable SQLite FTS5 full-text search on content. Default: false. */
		enabled?: boolean;
	};

	/**
	 * Optional monitoring / observability configuration.
	 * When `prometheusEnabled` is true, an unauthenticated Prometheus text format
	 * endpoint is exposed at GET /ap/metrics.
	 */
	monitoring?: {
		/** Expose Prometheus text format metrics at GET /ap/metrics. Default: false. */
		prometheusEnabled?: boolean;
	};
}

/**
 * Provider-shaped fields slated for migration into the per-domain
 * integration registry (Phase 3/4). Defined as a `Pick<>` over
 * `CmsConfig` so the source of truth stays the existing interface
 * — the alias only documents which fields are deprecation-track.
 *
 * Hosts that have admin-connected the matching provider can remove
 * the static-config field and the runtime adapter will read the
 * sealed credentials from `connected_integrations` instead.
 */
export type LegacyIntegrationsConfig = Pick<
	CmsConfig,
	| "analytics"
	| "abTesting"
	| "search"
	| "cdnPurgeWebhook"
	| "monitoring"
	| "donations"
	| "testimonials"
>;

/**
 * The non-deprecation-track fields on `CmsConfig`: template/route
 * shape, content seeds, retention/upload limits, plugins, api
 * surface. Defined as `Omit<CmsConfig, keyof LegacyIntegrationsConfig>`
 * so it stays in lockstep with the canonical interface.
 */
export type CoreCmsConfig = Omit<CmsConfig, keyof LegacyIntegrationsConfig>;

import {
	peekCmsConfig as _peekStore,
	getCmsConfigOrThrow,
	setStoreConfig,
} from "./config-store.js";

// social-syndication.ts is NOT imported here. config.ts sits underneath
// admin-store-dispatch.ts's own dependency chain (sqlite-runtime/utils.ts
// imports config.ts), so importing anything that reaches back into store
// access from here would be circular (confirmed via `bun run
// audit:deps:graph`). Instead, runtime-actions-content.ts — a consumer of
// admin-store-dispatch.ts, not part of its dependency chain — invokes
// social-syndication directly at the existing onContentPublish dispatch
// call site, gated on `socialSyndication` being configured.

export function registerCms(config: CmsConfig): void {
	setStoreConfig(config);
}

export function getCmsConfig(): CmsConfig {
	return getCmsConfigOrThrow();
}

export function peekCmsConfig(): CmsConfig | null {
	return _peekStore();
}

// ─── Plugin dispatch — extracted to plugin-dispatch.ts ───────────────────────
export type { PluginDispatchStats } from "./plugin-dispatch";
export {
	dispatchPluginContentEvent,
	dispatchPluginMediaEvent,
	getPluginDispatchStats,
	reportAstropressError,
} from "./plugin-dispatch";
