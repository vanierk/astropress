import {
	getRuntimeSystemRoute,
	saveRuntimeSystemRoute,
	withAdminFormAction,
} from "@astropress-diy/astropress";
import type { APIRoute } from "astro";

function splitLines(value: FormDataEntryValue | null) {
	return String(value ?? "")
		.split(/\r?\n/g)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/system", requireAction: "routePages:edit" },
		async ({ actor, formData, locals, redirect, fail }) => {
			const path = String(formData.get("path") ?? "").trim();
			const title = String(formData.get("title") ?? "").trim();
			const summary = String(formData.get("summary") ?? "").trim();
			const bodyHtml = String(formData.get("bodyHtml") ?? "");
			const revisionNote = String(formData.get("revisionNote") ?? "").trim();

			if (!path || !title) {
				return fail("System route path and title are required");
			}

			let settings: Record<string, unknown> | null = null;
			if (path === "/500") {
				settings = {
					buttonLabel: String(formData.get("buttonLabel") ?? "").trim() || "Go to homepage",
					buttonHref: String(formData.get("buttonHref") ?? "").trim() || "/",
					contactHref: String(formData.get("contactHref") ?? "").trim() || "/en/contact",
				};
			} else if (path === "/sitemap.xml") {
				// Preserve the indexNow sub-object (last-submitted-at timestamp)
				// written by actions/sitemap-submit.ts — this form only ever
				// submits excludedPaths/extraUrls, and a wholesale settings
				// replacement here would silently wipe it on the next save.
				const existing = await getRuntimeSystemRoute(path, locals);
				const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
				settings = {
					...(existingSettings.indexNow ? { indexNow: existingSettings.indexNow } : {}),
					excludedPaths: splitLines(formData.get("excludedPaths")),
					extraUrls: splitLines(formData.get("extraUrls")),
				};
			}

			const result = await saveRuntimeSystemRoute(
				path,
				{
					title,
					summary,
					bodyHtml,
					settings,
					revisionNote,
				},
				actor,
				locals,
			);

			if (!result.ok) {
				return fail(result.error);
			}

			return redirect("/ap-admin/system?saved=1");
		},
	);
