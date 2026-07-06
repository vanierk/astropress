import type { D1DatabaseLike } from "./d1-database.js";

export interface AppliedMigration {
	name: string;
	appliedAt: string;
}

/**
 * Lightweight D1 reachability probe — the D1-native equivalent of
 * `adapters/sqlite.ts`'s `SELECT 1` health check.
 */
export async function checkD1Health(db: D1DatabaseLike): Promise<boolean> {
	try {
		await db.prepare("SELECT 1").first();
		return true;
	} catch {
		return false;
	}
}

/**
 * Reads applied-migration history from `schema_migrations`. Returns `null`
 * (not a thrown error) when the table doesn't exist yet — a fresh D1
 * instance before any migration has run is a legitimate, reachable state.
 */
export async function listD1AppliedMigrations(
	db: D1DatabaseLike,
): Promise<AppliedMigration[] | null> {
	try {
		const result = await db
			.prepare("SELECT name, applied_at FROM schema_migrations ORDER BY applied_at DESC")
			.all<{ name: string; applied_at: string }>();
		return result.results.map((row) => ({ name: row.name, appliedAt: row.applied_at }));
	} catch {
		return null;
	}
}
