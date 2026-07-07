import { withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";
import { buildBackupExportReport } from "../../../src/admin-action-backup-export.js";

/**
 * POST /ap-admin/actions/backup-export
 *
 * On-demand content export — NOT a scheduled backup or restore system.
 * Admin-only. Returns a structured JSON snapshot of content, settings,
 * users, media metadata, redirects, and comments as a downloadable file.
 */
export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/backups", requireAction: "backups:manage" },
		async ({ locals }) => {
			const report = await buildBackupExportReport(locals);
			return new Response(JSON.stringify(report), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Content-Disposition": `attachment; filename="astropress-export-${Date.now()}.json"`,
				},
			});
		},
	);
