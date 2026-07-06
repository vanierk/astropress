import {
	getAstropressRootSecretCandidates,
	resolveCanonicalOrigin,
	withAdminFormAction,
} from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { computeSitemapEntries } from "../../../src/sitemap-entries.js";
import {
	deriveIndexNowKey,
	recordIndexNowSubmission,
	submitIndexNow,
} from "../../../src/sitemap-indexnow.js";

// No dedicated sitemaps:manage ABAC action exists — sitemaps:view is the only
// registered action for this domain (action-registry-data.ts), and other
// single-permission admin screens in this codebase (services, webhooks)
// likewise reuse one action for both viewing and operating the page's
// controls, so this reuses sitemaps:view rather than introducing new policy
// surface for a single button.
export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/sitemaps", requireAction: "sitemaps:view" },
		async ({ actor, locals, redirect, fail }) => {
			const origin = resolveCanonicalOrigin(context.request);
			const rootSecret = getAstropressRootSecretCandidates(locals)[0];
			if (!rootSecret) {
				return fail("Root secret is unavailable; cannot derive an IndexNow key.");
			}

			const key = deriveIndexNowKey(origin, rootSecret);
			const entries = await computeSitemapEntries(origin, locals);
			const urls = entries.map((entry) => entry.loc);

			const result = await submitIndexNow(origin, key, urls);
			if (!result.ok) {
				return fail(result.error);
			}

			const recorded = await recordIndexNowSubmission(actor, locals);
			if (!recorded.ok) {
				return fail(recorded.error);
			}

			return redirect("/ap-admin/sitemaps?submitted=1");
		},
	);
