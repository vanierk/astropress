/**
 * Data-backend health — verifies the honest two-state detection (D1 or
 * local SQLite fallback), the D1 reachability probe + migration-history
 * read, and the local-SQLite reachability proxy (no raw-query seam exists
 * there, so migrations are never claimed for that backend).
 *
 * Mocks at the `withLocalStoreFallback` boundary (the framework's single
 * dispatch point) so this test exercises checkDataBackendHealth's own
 * composition logic, while the real checkD1Health/listD1AppliedMigrations
 * run for real against a fake D1DatabaseLike.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/admin-store-dispatch.js", () => ({
	withLocalStoreFallback: vi.fn(),
}));

import { withLocalStoreFallback } from "../src/admin-store-dispatch.js";
import { checkDataBackendHealth } from "../src/data-backend-health.js";

const mockWithLocalStoreFallback = withLocalStoreFallback as unknown as ReturnType<typeof vi.fn>;

function makeDb(overrides: {
	firstImpl?: () => Promise<unknown>;
	allImpl?: () => Promise<{ results: Array<{ name: string; applied_at: string }> }>;
}) {
	const calls: string[] = [];
	return {
		prepare: (sql: string) => {
			calls.push(sql);
			return {
				first: overrides.firstImpl ?? (async () => ({})),
				all: overrides.allImpl ?? (async () => ({ results: [] })),
			};
		},
		_calls: calls,
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("checkDataBackendHealth — D1 backend", () => {
	it("reports d1/reachable when SELECT 1 succeeds", async () => {
		const db = makeDb({});
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(db));
		const status = await checkDataBackendHealth({});
		expect(status.backend).toBe("d1");
		expect(status.reachable).toBe(true);
	});

	it("reports d1/unreachable when SELECT 1 throws, and never attempts the migrations query", async () => {
		const allSpy = vi.fn();
		const db = makeDb({
			firstImpl: async () => {
				throw new Error("connection refused");
			},
			allImpl: allSpy,
		});
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(db));
		const status = await checkDataBackendHealth({});
		expect(status.backend).toBe("d1");
		expect(status.reachable).toBe(false);
		expect(status.appliedMigrations).toBeNull();
		expect(allSpy).not.toHaveBeenCalled();
	});

	it("returns applied migrations newest-first as given by the query", async () => {
		const db = makeDb({
			allImpl: async () => ({
				results: [
					{ name: "0002_add_widgets", applied_at: "2026-02-01T00:00:00.000Z" },
					{ name: "0001_init", applied_at: "2026-01-01T00:00:00.000Z" },
				],
			}),
		});
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(db));
		const status = await checkDataBackendHealth({});
		expect(status.appliedMigrations).toEqual([
			{ name: "0002_add_widgets", appliedAt: "2026-02-01T00:00:00.000Z" },
			{ name: "0001_init", appliedAt: "2026-01-01T00:00:00.000Z" },
		]);
	});

	it("returns null migrations (not a crash) when the schema_migrations table doesn't exist yet", async () => {
		const db = makeDb({
			allImpl: async () => {
				throw new Error("no such table: schema_migrations");
			},
		});
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(db));
		const status = await checkDataBackendHealth({});
		expect(status.reachable).toBe(true);
		expect(status.appliedMigrations).toBeNull();
	});

	it("queries schema_migrations ordered newest-first", async () => {
		const db = makeDb({});
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(db));
		await checkDataBackendHealth({});
		expect(
			db._calls.some(
				(sql) => /schema_migrations/i.test(sql) && /ORDER BY applied_at DESC/i.test(sql),
			),
		).toBe(true);
	});
});

describe("checkDataBackendHealth — local SQLite fallback", () => {
	it("reports local-sqlite/reachable when the local branch loads successfully", async () => {
		mockWithLocalStoreFallback.mockImplementation(async (_locals, _onD1, onLocal) => onLocal({}));
		const status = await checkDataBackendHealth({});
		expect(status.backend).toBe("local-sqlite");
		expect(status.reachable).toBe(true);
	});

	it("reports local-sqlite/unreachable when withLocalStoreFallback rejects (loadLocalAdminStore threw)", async () => {
		mockWithLocalStoreFallback.mockRejectedValue(new Error("module load failed"));
		const status = await checkDataBackendHealth({});
		expect(status.backend).toBe("local-sqlite");
		expect(status.reachable).toBe(false);
	});

	it("never claims applied-migration history for local SQLite, reachable or not", async () => {
		mockWithLocalStoreFallback.mockImplementation(async (_locals, _onD1, onLocal) => onLocal({}));
		const reachable = await checkDataBackendHealth({});
		expect(reachable.appliedMigrations).toBeNull();

		mockWithLocalStoreFallback.mockRejectedValue(new Error("fail"));
		const unreachable = await checkDataBackendHealth({});
		expect(unreachable.appliedMigrations).toBeNull();
	});
});

describe("checkDataBackendHealth — locals passthrough", () => {
	it("passes locals through to withLocalStoreFallback", async () => {
		const locals = { runtime: { env: { DB: {} } } };
		mockWithLocalStoreFallback.mockImplementation(async (_locals, onD1) => onD1(makeDb({})));
		await checkDataBackendHealth(locals);
		expect(mockWithLocalStoreFallback).toHaveBeenCalledWith(
			locals,
			expect.any(Function),
			expect.any(Function),
		);
	});
});
