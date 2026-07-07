import { withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { runSearchReindex } from "../../../src/admin-action-search-reindex.js";

/**
 * POST /ap-admin/actions/search-reindex
 *
 * Manual-only reindex — pushes published content into the connected search
 * provider's index. No automatic on-publish sync (host responsibility via
 * the AstropressPlugin.onContentSave hook). Admin-only, same gate as
 * search.astro itself.
 */
export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/search", requireAction: "services:manage" },
		async ({ locals, redirect, fail }) => {
			const result = await runSearchReindex(locals);
			if (!result.ok) {
				return fail(result.error);
			}
			return redirect(
				`/ap-admin/search?reindexed=1&indexed=${result.indexed}&failed=${result.failed}&total=${result.total}`,
			);
		},
	);
