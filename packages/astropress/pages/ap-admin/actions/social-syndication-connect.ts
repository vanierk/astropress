import { withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { connectSocialSyndicationProvider } from "../../../src/social-syndication.js";

/**
 * POST /ap-admin/actions/social-syndication-connect
 *
 * Dedicated connect action for social-syndication — NOT the shared
 * integration-connect.ts flow, since this domain isn't in the
 * IntegrationDomain registry (see social-syndication.ts's module doc for
 * why). All store/repository access lives in connectSocialSyndicationProvider
 * (src/social-syndication.ts); this file only parses the form and redirects.
 */
export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/social-syndication", requireAction: "services:manage" },
		async ({ formData, locals, redirect, fail }) => {
			const provider = String(formData.get("provider") ?? "");
			if (provider !== "bluesky" && provider !== "mastodon") {
				return fail("Choose a network to connect.");
			}

			const result = await connectSocialSyndicationProvider(locals, provider, {
				handle: formData.get("handle"),
				appPassword: formData.get("appPassword"),
				instanceUrl: formData.get("instanceUrl"),
				accessToken: formData.get("accessToken"),
			});

			if (!result.ok) {
				return fail(result.error);
			}

			return redirect(`/ap-admin/social-syndication?connected=${provider}`);
		},
	);
