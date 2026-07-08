/**
 * Catalog of admin-page stubs shown by leaves whose backing integration is
 * not yet configured. One entry per stub page; the page reads its entry,
 * checks whether the relevant config is present, and either renders the
 * real UI or <RequiresIntegration> with these values.
 *
 * Provider ordering: free / open-source first, SaaS after. "Recommended"
 * tag marks the lowest-friction option for a new install.
 */

export interface StubProvider {
	name: string;
	href?: string;
	tag?: "Recommended" | "Self-hosted" | "OSS" | "SaaS";
}

export interface StubEntry {
	capability: string;
	description: string;
	configHint: string;
	providers: StubProvider[];
	docsHref?: string;
}

export const adminStubs = {
	forms: {
		capability: "Forms",
		description:
			"Connect a forms provider to manage submissions in its own dashboard. Astropress verifies the credential — it doesn't capture, store, or notify on submissions itself.",
		configHint: 'import { registerTally } from "astropress";\n\nregisterTally();',
		providers: [
			{ name: "Web3Forms", href: "https://web3forms.com", tag: "Recommended" },
			{ name: "Formspree", href: "https://formspree.io", tag: "SaaS" },
			{ name: "Tally", href: "https://tally.so", tag: "SaaS" },
			{ name: "Typeform", href: "https://typeform.com", tag: "SaaS" },
			{
				name: "Netlify Forms",
				href: "https://www.netlify.com/products/forms/",
				tag: "SaaS",
			},
		],
	},
	newsletter: {
		capability: "Newsletter",
		description:
			"Compose and send newsletter campaigns to your subscribers. Subscribers are managed under Audience › Subscribers.",
		configHint:
			'registerCms({\n  newsletter: { provider: "listmonk", url: process.env.LISTMONK_URL },\n});',
		providers: [
			{ name: "Listmonk", href: "https://listmonk.app", tag: "Recommended" },
			{ name: "Mailchimp", href: "https://mailchimp.com", tag: "SaaS" },
			{ name: "ConvertKit", href: "https://convertkit.com", tag: "SaaS" },
			{ name: "Beehiiv", href: "https://beehiiv.com", tag: "SaaS" },
			{ name: "Buttondown", href: "https://buttondown.com", tag: "SaaS" },
		],
	},
	events: {
		capability: "Events",
		description:
			"Embed a scheduling/booking widget so visitors can book a slot. RSVP and attendee data always live in the provider's own dashboard — Astropress never sees or manages bookings.",
		configHint: 'registerCms({\n  events: { provider: "cal", calLink: "your-team/30min" },\n});',
		providers: [
			{ name: "Cal.com", href: "https://cal.com", tag: "Recommended" },
			{ name: "Calendly", href: "https://calendly.com", tag: "SaaS" },
			{
				name: "Eventbrite (embed shape not yet confirmed)",
				href: "https://eventbrite.com",
				tag: "SaaS",
			},
			{ name: "Luma (embed shape not yet confirmed)", href: "https://lu.ma", tag: "SaaS" },
		],
	},
	reviews: {
		capability: "Reviews",
		description:
			"Embed a Trustpilot review widget so visitors see your reviews. Review responses happen in Trustpilot's own dashboard — Astropress only displays the widget.",
		configHint:
			'registerCms({\n  reviews: { provider: "trustpilot", businessUnitId: "...", templateId: "..." },\n});',
		providers: [
			{ name: "Trustpilot", href: "https://business.trustpilot.com", tag: "Recommended" },
			{
				name: "Google Business Profile (needs a separate API integration — Places API caps at 5 auto-selected reviews)",
				href: "https://business.google.com",
				tag: "SaaS",
			},
			{
				name: "Yelp Fusion (needs a separate API integration — 3 short excerpts + attribution requirements)",
				href: "https://docs.developer.yelp.com",
				tag: "SaaS",
			},
		],
	},
	referrals: {
		capability: "Referrals",
		description:
			"Embed a referral-link arrival tracker (Rewardful or FirstPromoter). This only attributes that a visitor arrived via a referral link — converting that into a payout requires your own checkout code to report the conversion to the provider's API, which Astropress does not do.",
		configHint:
			'registerCms({\n  referrals: { provider: "rewardful", rewardfulPublicKey: "..." },\n});',
		providers: [
			{ name: "Rewardful", href: "https://rewardful.com", tag: "Recommended" },
			{ name: "FirstPromoter", href: "https://firstpromoter.com", tag: "SaaS" },
			{
				name: "ReferralCandy (tracking needs a computed secret signature, not a safe client-side embed)",
				href: "https://referralcandy.com",
				tag: "SaaS",
			},
			{
				name: "GrowSurf (embed shape not yet confirmed)",
				href: "https://growsurf.com",
				tag: "SaaS",
			},
		],
	},
	memberships: {
		capability: "Memberships",
		description:
			"Gate content behind subscriptions or membership tiers. Manage member access and billing.",
		configHint:
			'registerCms({\n  memberships: { provider: "memberstack", siteId: process.env.MEMBERSTACK_SITE_ID },\n});',
		providers: [
			{ name: "Memberstack", href: "https://memberstack.com", tag: "SaaS" },
			{ name: "Outseta", href: "https://outseta.com", tag: "SaaS" },
			{ name: "Patreon", href: "https://patreon.com", tag: "SaaS" },
			{
				name: "Stripe Customer Portal",
				href: "https://stripe.com/billing",
				tag: "SaaS",
			},
		],
	},
	community: {
		capability: "Community",
		description:
			"Embed your external community forum (Discourse, Flarum) inside the admin shell via registerAstropressService — the same iframe-proxy mechanism services/[provider].astro uses.",
		configHint:
			'registerAstropressService({\n  provider: "community",\n  label: "Discourse",\n  description: "Community forum",\n  proxyTarget: "https://forum.example.com",\n  adminPath: "/ap-admin/services/community",\n});',
		providers: [
			{ name: "Discourse", href: "https://discourse.org", tag: "OSS" },
			{ name: "Flarum", href: "https://flarum.org", tag: "OSS" },
			{ name: "Discord", href: "https://discord.com", tag: "SaaS" },
		],
	},
	shop: {
		capability: "Shop",
		description:
			"Embed a commerce admin inside the shell. Configure a service URL to render an iframe panel.",
		configHint:
			'registerAstropressService({\n  provider: "shop",\n  label: "Snipcart",\n  proxyTarget: "https://app.snipcart.com",\n  adminPath: "/ap-admin/shop",\n});',
		providers: [
			{ name: "Snipcart", href: "https://snipcart.com", tag: "SaaS" },
			{ name: "Shopify", href: "https://shopify.com", tag: "SaaS" },
			{ name: "Lemon Squeezy", href: "https://lemonsqueezy.com", tag: "SaaS" },
			{
				name: "Stripe Payment Links",
				href: "https://stripe.com/payments/payment-links",
				tag: "SaaS",
			},
		],
	},
	socialSyndication: {
		capability: "Social Syndication",
		description:
			"Auto-post on publish to Bluesky and/or Mastodon. Declare the network here, then connect the posting credential on the admin page — it's sealed, never stored in config.",
		configHint:
			'registerCms({\n  socialSyndication: { bluesky: { handle: "you.bsky.social" } },\n});\n// Then connect the app password on the Social Syndication admin page.',
		providers: [
			{ name: "Bluesky", href: "https://bsky.app", tag: "Recommended" },
			{ name: "Mastodon", href: "https://joinmastodon.org", tag: "Recommended" },
			{
				name: "X / Twitter (not available — no free tier; ~$0.20 per post with a link as of 2026)",
				href: "https://x.com",
				tag: "SaaS",
			},
			{
				name: "LinkedIn (not available — posting on behalf of a page needs Marketing Developer Platform approval, weeks to months, no self-service path)",
				href: "https://linkedin.com",
				tag: "SaaS",
			},
		],
	},
	structuredData: {
		capability: "Structured Data / AEO",
		description:
			"Configure JSON-LD generation, llms.txt, and answer-engine optimization signals so AI assistants and search crawlers correctly attribute your content.",
		configHint:
			'registerCms({\n  structuredData: { llmsTxt: true, jsonLdDefaults: { orgName: "Acme" } },\n});',
		providers: [
			{ name: "JSON-LD (built-in)", tag: "Recommended" },
			{ name: "llms.txt (built-in)", tag: "Recommended" },
			{ name: "Schema.org docs", href: "https://schema.org" },
		],
	},
	sitemaps: {
		capability: "Sitemaps",
		description:
			"Generate and submit XML sitemaps to search engines. View sitemap coverage and last submission status.",
		configHint: 'registerCms({\n  sitemaps: { enabled: true, submit: ["google", "bing"] },\n});',
		providers: [
			{ name: "Built-in XML sitemap", tag: "Recommended" },
			{
				name: "Google Search Console",
				href: "https://search.google.com/search-console",
			},
			{ name: "Bing Webmaster Tools", href: "https://www.bing.com/webmasters" },
		],
	},
	mapsLocal: {
		capability: "Maps & Local",
		description:
			"LocalBusiness structured-data configuration — name, address, phone, opening hours, and geo coordinates, saved from /ap-admin/maps-local and rendered via <AstropressLocalBusinessJsonLd> in your own layout. No live sync with Google/Apple/Bing — those platforms are managed directly on their own dashboards.",
		configHint:
			'registerCms({\n  localBusiness: { name: "My Shop", streetAddress: "123 Main St", addressLocality: "Springfield", addressRegion: "IL", postalCode: "62701", addressCountry: "US" },\n});',
		providers: [
			{
				name: "Google Business Profile",
				href: "https://business.google.com",
				tag: "SaaS",
			},
			{
				name: "Apple Business Connect",
				href: "https://businessconnect.apple.com",
				tag: "SaaS",
			},
			{ name: "Bing Places", href: "https://www.bingplaces.com", tag: "SaaS" },
		],
	},
	analytics: {
		capability: "Analytics",
		description:
			"Site traffic and product analytics. Configure a provider to embed dashboards and snippets.",
		configHint:
			'registerCms({\n  analytics: { provider: "umami", url: process.env.UMAMI_URL },\n});',
		providers: [
			{ name: "Umami", href: "https://umami.is", tag: "Recommended" },
			{ name: "Plausible", href: "https://plausible.io", tag: "OSS" },
			{ name: "Matomo", href: "https://matomo.org", tag: "OSS" },
			{ name: "PostHog", href: "https://posthog.com", tag: "OSS" },
		],
	},
	heatmaps: {
		capability: "Heatmaps & Session Replay",
		description:
			"Configure a heatmaps/session-replay tracking snippet. Heatmaps are always viewed in the provider's own dashboard — Astropress only injects the tracking snippet, it never renders heatmaps itself.",
		configHint: 'registerCms({\n  heatmaps: { type: "clarity", projectId: "..." },\n});',
		providers: [
			{ name: "Microsoft Clarity", href: "https://clarity.microsoft.com", tag: "Recommended" },
			{ name: "Hotjar", href: "https://hotjar.com", tag: "SaaS" },
			{
				name: "OpenReplay (self-hosted, needs npm + a JS bundler — not a snippet)",
				href: "https://openreplay.com",
				tag: "OSS",
			},
			{
				name: "PostHog Session Replay (included with analytics — no extra config)",
				href: "https://posthog.com",
				tag: "OSS",
			},
		],
	},
	abTesting: {
		capability: "A/B Testing & Feature Flags",
		description:
			"Roll out features behind flags and split traffic between variants. Configure a provider to enable.",
		configHint:
			'registerCms({\n  abTesting: { provider: "growthbook", url: process.env.GROWTHBOOK_URL },\n});',
		providers: [
			{ name: "GrowthBook", href: "https://growthbook.io", tag: "Recommended" },
			{ name: "Unleash", href: "https://getunleash.io", tag: "OSS" },
			{
				name: "PostHog Feature Flags",
				href: "https://posthog.com",
				tag: "OSS",
			},
		],
	},
	email: {
		capability: "Email",
		description:
			"Transactional email — password resets, invitations, contact form notifications. Configure a provider to send mail.",
		configHint: "# .env\nEMAIL_DELIVERY_MODE=resend\nRESEND_API_KEY=re_...\nRESEND_FROM_EMAIL=...",
		providers: [
			{ name: "Resend", href: "https://resend.com", tag: "Recommended" },
			{ name: "SMTP (any server)", tag: "Self-hosted" },
			{ name: "Postmark", href: "https://postmarkapp.com", tag: "SaaS" },
			{ name: "SendGrid", href: "https://sendgrid.com", tag: "SaaS" },
		],
	},
	liveChat: {
		capability: "Live Chat",
		description:
			"Real-time customer chat embedded on the site. Configure a provider to render the widget.",
		configHint:
			'registerCms({\n  liveChat: { provider: "crisp", websiteId: process.env.CRISP_WEBSITE_ID },\n});',
		providers: [
			{ name: "Crisp", href: "https://crisp.chat", tag: "Recommended" },
			{ name: "Chatwoot", href: "https://chatwoot.com", tag: "OSS" },
			{ name: "Intercom", href: "https://intercom.com", tag: "SaaS" },
			{ name: "HelpScout", href: "https://helpscout.com", tag: "SaaS" },
		],
	},
	imageCdn: {
		capability: "Image CDN",
		description:
			"Offload image transforms and delivery to a CDN. Configure a provider to enable image-pipeline routing.",
		configHint:
			'registerCms({\n  imageCdn: { provider: "cloudinary", cloudName: process.env.CLOUDINARY_CLOUD },\n});',
		providers: [
			{
				name: "Cloudflare Images",
				href: "https://www.cloudflare.com/products/cloudflare-images/",
				tag: "Recommended",
			},
			{ name: "Bunny.net", href: "https://bunny.net", tag: "SaaS" },
			{ name: "Cloudinary", href: "https://cloudinary.com", tag: "SaaS" },
			{ name: "imgix", href: "https://imgix.com", tag: "SaaS" },
		],
	},
	search: {
		capability: "Search",
		description:
			"Site-wide content search. The built-in SQLite FTS5 index works out of the box; connect a hosted provider from /ap-admin/search for larger catalogs, then push content into it with a manual reindex.",
		configHint:
			'// Two different mechanisms:\n// 1. Built-in FTS5 (config-driven): registerCms({ search: { enabled: true } });\n// 2. Hosted provider (registry-driven, e.g. Typesense): import { registerTypesense } from "astropress"; registerTypesense();',
		providers: [
			{ name: "SQLite FTS5 (built-in)", tag: "Recommended" },
			{ name: "Pagefind", href: "https://pagefind.app", tag: "OSS" },
			{ name: "Typesense", href: "https://typesense.org", tag: "OSS" },
			{ name: "Meilisearch", href: "https://meilisearch.com", tag: "OSS" },
			{ name: "Algolia", href: "https://algolia.com", tag: "SaaS" },
		],
	},
	cdnPurge: {
		capability: "CDN Purge",
		description:
			"Invalidate CDN caches when content publishes. Configure a webhook URL or vendor API token to enable.",
		configHint:
			"# Either: registerCms({ cdnPurgeWebhook: process.env.NETLIFY_BUILD_HOOK_URL });\n# Or env vars: CLOUDFLARE_ZONE_ID + CLOUDFLARE_API_TOKEN",
		providers: [
			{
				name: "Cloudflare Cache API",
				href: "https://developers.cloudflare.com/cache/",
				tag: "Recommended",
			},
			{
				name: "Vercel Deploy Hook",
				href: "https://vercel.com/docs/deployments/deploy-hooks",
				tag: "SaaS",
			},
			{
				name: "Netlify Build Hook",
				href: "https://docs.netlify.com/configure-builds/build-hooks/",
				tag: "SaaS",
			},
		],
	},
	monitoring: {
		capability: "Monitoring",
		description:
			"Metrics, uptime, and alerting. Enable Prometheus to scrape /ap/metrics, or wire a SaaS uptime monitor.",
		configHint: "registerCms({\n  monitoring: { prometheusEnabled: true },\n});",
		providers: [
			{ name: "Prometheus (built-in)", tag: "Recommended" },
			{ name: "Grafana Cloud", href: "https://grafana.com", tag: "SaaS" },
			{ name: "Better Stack", href: "https://betterstack.com", tag: "SaaS" },
			{ name: "Sentry", href: "https://sentry.io", tag: "SaaS" },
		],
	},
	deployHooks: {
		capability: "Deploy Hooks",
		description:
			"Trigger production builds from CI or vendor webhooks. Configure URLs for the platforms you ship to.",
		configHint:
			"# Set deploy hook URLs as env vars; admin Publish action will POST on demand.\nCLOUDFLARE_PAGES_DEPLOY_HOOK=...\nVERCEL_DEPLOY_HOOK=...",
		providers: [
			{
				name: "Cloudflare Pages",
				href: "https://developers.cloudflare.com/pages/",
				tag: "SaaS",
			},
			{ name: "Vercel", href: "https://vercel.com", tag: "SaaS" },
			{ name: "Netlify", href: "https://netlify.com", tag: "SaaS" },
			{ name: "Render", href: "https://render.com", tag: "SaaS" },
			{
				name: "GitHub Actions",
				href: "https://docs.github.com/en/actions",
				tag: "SaaS",
			},
		],
	},
	plugins: {
		capability: "Plugins",
		description:
			"Inspect lifecycle plugins registered via registerCms({ plugins: [...] }). Plugins extend Astropress with hooks and admin nav contributions.",
		configHint:
			'import type { AstropressPlugin } from "@astropress-diy/astropress";\n\nconst myPlugin: AstropressPlugin = {\n  name: "my-plugin",\n  async onContentSave({ slug }) { /* … */ },\n};\n\nregisterCms({ plugins: [myPlugin] });',
		providers: [
			{
				name: "Plugin authoring guide",
				href: "https://github.com/Astropress/astropress",
			},
		],
	},
	data: {
		capability: "Data",
		description:
			"Backing data store. The admin UI (/ap-admin/data) detects and reports health for Cloudflare D1 or local SQLite only — the two backends its runtime dispatch can distinguish. Supabase, Neon, Turso, PocketBase, Appwrite, and Nhost ship adapter code but aren't wired into that detection; connect them via custom adapter code, not through this admin UI.",
		configHint:
			"# Configured by your deployment target; see deployment-matrix.ts.\n# Example: Cloudflare D1 binding name in wrangler.toml.",
		providers: [
			{
				name: "Cloudflare D1",
				href: "https://developers.cloudflare.com/d1/",
				tag: "Recommended",
			},
			{ name: "Supabase", href: "https://supabase.com", tag: "OSS" },
			{ name: "Neon", href: "https://neon.tech", tag: "SaaS" },
			{ name: "Turso (LibSQL)", href: "https://turso.tech", tag: "SaaS" },
			{ name: "PocketBase", href: "https://pocketbase.io", tag: "OSS" },
			{ name: "Appwrite", href: "https://appwrite.io", tag: "OSS" },
			{ name: "Nhost", href: "https://nhost.io", tag: "OSS" },
		],
	},
	backups: {
		capability: "Backups",
		description:
			"On-demand JSON export of your content, settings, users, media metadata, redirects, and comments — plus guidance on your active backend's own backup mechanism (e.g. Cloudflare D1 Time Travel). This is not a scheduled backup system: no scheduling, no run history, and no restore path from within Astropress.",
		configHint:
			"# No configuration needed — /ap-admin/backups is always available; it detects your active backend automatically.",
		providers: [
			{
				name: "Cloudflare D1 + R2",
				href: "https://developers.cloudflare.com/d1/",
				tag: "Recommended",
			},
			{
				name: "Supabase Backups",
				href: "https://supabase.com/docs/guides/platform/backups",
				tag: "SaaS",
			},
		],
	},
} as const satisfies Record<string, StubEntry>;

export type AdminStubKey = keyof typeof adminStubs;

/**
 * Per-route metadata for the admin stub pages rendered through the
 * dynamic `pages/ap-admin/[stub].astro` route. Each entry binds a URL
 * slug (the path segment) to:
 *
 *   - `stubKey`: which `adminStubs` entry holds the copy/providers.
 *   - `navKey`:  which `adminUi.navigation` label to render.
 *   - `action`:  the ABAC action enforced by `requiresAccess` before
 *                the page renders. Mirrors the per-page guard the
 *                old hand-written stubs each ran.
 *   - `variant`: optional. `"coming-soon"` makes RequiresIntegration
 *                drop env-var hints and surface the roadmap link;
 *                omitted for env-gated pages whose configHint is the
 *                whole point. Must agree with the integration manifest
 *                + `audit:integration-honesty` allowlist.
 *
 * Adding a new stub: append here and `audit:integration-honesty` will
 * verify the slug matches a real `adminStubs` entry. The dynamic route
 * 404s on unknown slugs so a typo never silently renders.
 */
export interface AdminStubPageEntry {
	readonly stubKey: AdminStubKey;
	readonly navKey: string;
	readonly action: string;
	readonly variant?: "coming-soon";
	readonly roadmapHref?: string;
}

const ROADMAP_ISSUE = "https://github.com/Astropress/astropress/issues/76";

export const ADMIN_STUB_PAGES = {
	// Coming-soon (status="coming-soon" in INTEGRATIONS or allowlist).
	// social-syndication was promoted to a real, env-gated page
	// (social-syndication.astro) — CmsConfig.socialSyndication and the
	// built-in auto-post handler now exist, hooking the existing
	// onContentPublish dispatch point (runtime-actions-content.ts) that
	// already fires on every real publish; "coming-soon" was wrong about
	// the underlying capability, not just the copy. adminStubs.socialSyndication
	// stays as an orphaned catalog entry per precedent.
	// referrals was promoted to a real, env-gated page (referrals.astro) —
	// CmsConfig.referrals + <AstropressReferralsEmbed> now exist, following
	// the exact config+emit pattern established by
	// resolveAnalyticsSnippet()/resolveHeatmapsSnippet()/
	// AstropressEventsEmbed/AstropressReviewsEmbed; "coming-soon" was wrong
	// about the underlying capability, not just the copy. Still gated on
	// services:manage — that was already the correct, legitimate shared
	// action here (unlike reviews' testimonials:manage mis-share), so no
	// new action was added. adminStubs.referrals stays as an orphaned
	// catalog entry per precedent.
	// events was promoted to a real, env-gated page (events.astro) —
	// CmsConfig.events + <AstropressEventsEmbed> now exist, following the
	// exact config+emit pattern resolveAnalyticsSnippet()/
	// resolveHeatmapsSnippet() already established; "coming-soon" was wrong
	// about the underlying capability, not just the copy. events:manage /
	// resourceKind:"event" existed before this build but were generic ABAC
	// boilerplate, not native event CRUD evidence. adminStubs.events stays
	// as an orphaned catalog entry per precedent.
	// reviews was promoted to a real, env-gated page (reviews.astro) —
	// CmsConfig.reviews + <AstropressReviewsEmbed> now exist, following the
	// exact config+emit pattern established by
	// resolveAnalyticsSnippet()/resolveHeatmapsSnippet()/AstropressEventsEmbed;
	// "coming-soon" was wrong about the underlying capability, not just the
	// copy. Also fixed a real ABAC bug here: this stub's `action` used to be
	// "testimonials:manage" (a mis-share — there was no reviews:manage
	// action), now reviews:manage. adminStubs.reviews stays as an orphaned
	// catalog entry per precedent.
	memberships: {
		stubKey: "memberships",
		navKey: "memberships",
		action: "services:manage",
		variant: "coming-soon",
		roadmapHref: ROADMAP_ISSUE,
	},
	// community was promoted to a real, standalone page (community.astro) —
	// unlike shop (which redirects to the generic Services hub), community
	// keeps its own nav leaf and embeds the registered service directly on
	// its own page, reusing services/[provider].astro's exact iframe-proxy
	// mechanism (getAstropressService + adminPath) rather than reinventing
	// embedding. adminStubs.community stays as an orphaned catalog entry.
	// plugins was promoted to a real page (plugins.astro) — CmsConfig.plugins,
	// AstropressPlugin, and plugin-dispatch.ts were already real and
	// dispatching hooks; "coming-soon" was wrong about the underlying
	// capability, not just the copy. adminStubs.plugins stays as an orphaned
	// catalog entry per precedent.
	// heatmaps was promoted to a real, env-gated page (heatmaps.astro) —
	// CmsConfig.heatmaps + resolveHeatmapsSnippet() (heatmaps.ts) now exist,
	// following the exact config+emit pattern resolveAnalyticsSnippet()
	// already established; "coming-soon" was wrong about the underlying
	// capability, not just the copy. adminStubs.heatmaps stays as an
	// orphaned catalog entry per precedent.
	// email was promoted to a real page (email.astro) — transactional-email.ts
	// + getTransactionalEmailConfig() were already real, tested, and
	// load-bearing (reset-password.ts/user-invite.ts send live mail through
	// them); "coming-soon" was wrong about the underlying capability, not
	// just the copy. adminStubs.email stays as an orphaned catalog entry.
	"live-chat": {
		stubKey: "liveChat",
		navKey: "liveChat",
		action: "services:manage",
		variant: "coming-soon",
		roadmapHref: ROADMAP_ISSUE,
	},
	"image-cdn": {
		stubKey: "imageCdn",
		navKey: "imageCdn",
		action: "services:manage",
		variant: "coming-soon",
		roadmapHref: ROADMAP_ISSUE,
	},
	// deploy-hooks was promoted to a real page (deploy-hooks.astro) since
	// providers/github-deploy.ts already implements registerDeployHooks(...).
	// adminStubs.deployHooks (capability/description copy) stays as an
	// orphaned catalog entry, matching the forms/newsletter/analytics/
	// search/cdnPurge precedent — those 5 also have real pages with no
	// ADMIN_STUB_PAGES routing entry.
	// Env-gated (manifest status="env-gated" or unconfigured allowlist).
	// data was promoted to a real page (data.astro) — see
	// src/data-backend-health.ts for why only D1/local-SQLite are detectable.
	// backups was promoted to a real page (backups.astro) — an on-demand
	// content export + backend backup-mechanism guidance, not a scheduled
	// backup/restore system. See admin-action-backup-export.ts.
	// maps-local was promoted to a real page (maps-local.astro) — LocalBusiness
	// JSON-LD config only, no live Google/Apple/Bing sync. See
	// AstropressLocalBusinessJsonLd.astro and config-service-types.ts.
	// structured-data, shop, monitoring, sitemaps, and ab-testing were
	// promoted to real pages (structured-data.astro, shop.astro,
	// monitoring.astro, sitemaps.astro, ab-testing.astro). Their adminStubs
	// entries (capability/description/configHint/providers copy) stay as
	// orphaned catalog entries — structured-data.astro/monitoring.astro
	// still reuse that copy directly — matching the deploy-hooks precedent.
} as const satisfies Record<string, AdminStubPageEntry>;

export type AdminStubPageSlug = keyof typeof ADMIN_STUB_PAGES;

export function getAdminStubPage(slug: string): AdminStubPageEntry | undefined {
	return (ADMIN_STUB_PAGES as Record<string, AdminStubPageEntry>)[slug];
}
