import { getAccessContext, withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { logAccessDeny } from "../../../src/access/audit-deny";
import { isRestorableTable, restoreRuntimeRecord } from "../../../src/runtime-actions-restore";

// One restore action covers four different resources, so a single static
// requireAction can't be right for all of them — restoring an author must
// require authors:manage, not whatever generic action the caller happens to
// hold. withAdminFormAction's own requireAction is evaluated before formData
// is parsed, so it can't see `table` yet; the per-resource check below runs
// after `table` is validated, mirroring the wrapper's own allow/deny/audit
// logic (getAccessContext + logAccessDeny) for the resolved action.
const RESTORE_ACTION_BY_TABLE: Record<string, string> = {
	authors: "authors:manage",
	categories: "taxonomies:manage",
	tags: "taxonomies:manage",
	media_assets: "media:delete",
};

export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin" },
		async ({ actor, formData, locals, redirect, fail }) => {
			const table = String(formData.get("table") ?? "");
			const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
			const returnTo = String(formData.get("return_to") ?? "/ap-admin");

			if (!isRestorableTable(table)) {
				return fail("Invalid table");
			}

			const requiredAction = RESTORE_ACTION_BY_TABLE[table];
			const access = await getAccessContext({ locals });
			const decision = access?.can(requiredAction);
			if (!decision || decision.decision === "deny") {
				if (decision) {
					await logAccessDeny(locals, {
						subjectEmail: access?.subject.email ?? actor.email,
						action: requiredAction,
						decision,
					});
				}
				return fail(decision?.reason ?? "You do not have permission to perform this action.");
			}

			if (!Number.isFinite(id) || id <= 0) {
				return fail("Invalid id");
			}

			const result = await restoreRuntimeRecord(table, id, actor, locals);
			if (!result.ok) {
				return fail(result.error);
			}

			return redirect(`${returnTo}?restored=1`);
		},
	);
