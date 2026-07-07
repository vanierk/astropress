/**
 * On-demand content export (not a scheduled backup or restore system).
 *
 * Composes a structured JSON snapshot from the same runtime read functions
 * (`runtime-page-store.ts`) every other admin listing page already uses —
 * these already dispatch D1 vs. local SQLite internally, so this module
 * needs no store-seam or SQL code of its own.
 *
 * This is export-only: nothing in the framework can import a snapshot back
 * in today, so it's a portability/audit artifact, not a restore path.
 */
import {
	getRuntimeAdminUsers,
	getRuntimeComments,
	getRuntimeMediaAssets,
	getRuntimeRedirectRules,
	getRuntimeSettings,
	listRuntimeContentStates,
} from "./runtime-page-store.js";

export interface BackupExportReport {
	note: string;
	exportedAt: string;
	content: Awaited<ReturnType<typeof listRuntimeContentStates>>;
	settings: Awaited<ReturnType<typeof getRuntimeSettings>>;
	users: Awaited<ReturnType<typeof getRuntimeAdminUsers>>;
	media: Awaited<ReturnType<typeof getRuntimeMediaAssets>>;
	redirects: Awaited<ReturnType<typeof getRuntimeRedirectRules>>;
	comments: Awaited<ReturnType<typeof getRuntimeComments>>;
}

export async function buildBackupExportReport(
	locals?: App.Locals | null,
): Promise<BackupExportReport> {
	const [content, settings, users, media, redirects, comments] = await Promise.all([
		listRuntimeContentStates(locals),
		getRuntimeSettings(locals),
		getRuntimeAdminUsers(locals),
		getRuntimeMediaAssets(locals),
		getRuntimeRedirectRules(locals),
		getRuntimeComments(locals),
	]);
	return {
		note: "On-demand content export — not a restorable backup. Astropress does not currently support importing this file back in.",
		exportedAt: new Date().toISOString(),
		content,
		settings,
		users,
		media,
		redirects,
		comments,
	};
}
