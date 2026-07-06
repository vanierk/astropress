/**
 * Data-backend health for the admin `data` page.
 *
 * The admin runtime (`admin-store-dispatch.ts`) only ever distinguishes two
 * backends: a D1 binding is present, or it falls back to local SQLite. There
 * is no generic "active adapter" registration anywhere in the framework, so
 * this is genuinely the full set of backends this page can honestly detect
 * — the six other shipped adapters (Supabase/Neon/Turso/PocketBase/
 * Appwrite/Nhost) are real code but are never wired into this dispatch.
 *
 * D1 reachability + migration history are read via `d1-data-health-ops.ts`
 * (SQL stays contained there per the `sql-containment` arch rule). Local
 * SQLite has no raw-query surface exposed through `LocalAdminStoreModule`
 * (it's a domain-method interface, not a generic SQL seam), so reachability
 * there is inferred from whether `withLocalStoreFallback`'s local branch
 * loads successfully — the same signal `safeLoadLocalAdminStore()` already
 * uses elsewhere for degraded-mode detection — and migration history isn't
 * shown at all for local dev (honest limitation, not a fabricated answer).
 * `withLocalStoreFallback` is the framework's single point of dispatch
 * (`dispatch-containment` arch rule), so it's used here rather than loading
 * the local admin store module directly.
 */
import { withLocalStoreFallback } from "./admin-store-dispatch.js";
import {
	type AppliedMigration,
	checkD1Health,
	listD1AppliedMigrations,
} from "./d1-data-health-ops.js";

export type DataBackend = "d1" | "local-sqlite";

export interface DataBackendStatus {
	backend: DataBackend;
	reachable: boolean;
	/**
	 * Applied-migration history, newest first. `null` means "not available"
	 * — either the backend is local SQLite (no raw-query seam to read
	 * `schema_migrations` through), or D1 is reachable but the migrations
	 * table doesn't exist yet (a fresh instance before any migration ran).
	 */
	appliedMigrations: AppliedMigration[] | null;
}

export async function checkDataBackendHealth(
	locals?: App.Locals | null,
): Promise<DataBackendStatus> {
	try {
		return await withLocalStoreFallback<DataBackendStatus>(
			locals,
			async (db) => {
				const reachable = await checkD1Health(db);
				if (!reachable) {
					return { backend: "d1", reachable: false, appliedMigrations: null };
				}
				const appliedMigrations = await listD1AppliedMigrations(db);
				return { backend: "d1", reachable: true, appliedMigrations };
			},
			() => ({ backend: "local-sqlite", reachable: true, appliedMigrations: null }),
		);
	} catch {
		// The D1 branch never throws (checkD1Health/listD1AppliedMigrations both
		// catch internally) — reaching here means the local admin store module
		// itself threw while loading inside withLocalStoreFallback, i.e. the
		// local backend failed to load.
		return { backend: "local-sqlite", reachable: false, appliedMigrations: null };
	}
}
