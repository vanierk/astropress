/**
 * Verifies the backup-export composition: gathers content/settings/users/
 * media/redirects/comments via the shared runtime-page-store functions
 * (already D1-vs-local aware), and always carries the honest "export, not
 * a restorable backup" note.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/runtime-page-store.js", () => ({
	listRuntimeContentStates: vi.fn().mockResolvedValue([]),
	getRuntimeSettings: vi.fn().mockResolvedValue({}),
	getRuntimeAdminUsers: vi.fn().mockResolvedValue([]),
	getRuntimeMediaAssets: vi.fn().mockResolvedValue([]),
	getRuntimeRedirectRules: vi.fn().mockResolvedValue([]),
	getRuntimeComments: vi.fn().mockResolvedValue([]),
}));

import { buildBackupExportReport } from "../src/admin-action-backup-export.js";
import {
	getRuntimeAdminUsers,
	getRuntimeComments,
	getRuntimeMediaAssets,
	getRuntimeRedirectRules,
	getRuntimeSettings,
	listRuntimeContentStates,
} from "../src/runtime-page-store.js";

const mocks = {
	content: listRuntimeContentStates as unknown as ReturnType<typeof vi.fn>,
	settings: getRuntimeSettings as unknown as ReturnType<typeof vi.fn>,
	users: getRuntimeAdminUsers as unknown as ReturnType<typeof vi.fn>,
	media: getRuntimeMediaAssets as unknown as ReturnType<typeof vi.fn>,
	redirects: getRuntimeRedirectRules as unknown as ReturnType<typeof vi.fn>,
	comments: getRuntimeComments as unknown as ReturnType<typeof vi.fn>,
};

afterEach(() => {
	vi.clearAllMocks();
	mocks.content.mockResolvedValue([]);
	mocks.settings.mockResolvedValue({});
	mocks.users.mockResolvedValue([]);
	mocks.media.mockResolvedValue([]);
	mocks.redirects.mockResolvedValue([]);
	mocks.comments.mockResolvedValue([]);
});

describe("buildBackupExportReport", () => {
	it("composes all six sections from the shared runtime read functions", async () => {
		mocks.content.mockResolvedValue([{ id: "1", kind: "post" }]);
		mocks.settings.mockResolvedValue({ siteTitle: "My Site" });
		mocks.users.mockResolvedValue([{ id: 1, email: "a@b.com" }]);
		mocks.media.mockResolvedValue([{ id: "m1" }]);
		mocks.redirects.mockResolvedValue([{ sourcePath: "/old", targetPath: "/new" }]);
		mocks.comments.mockResolvedValue([{ id: "c1" }]);

		const report = await buildBackupExportReport({});

		expect(report.content).toEqual([{ id: "1", kind: "post" }]);
		expect(report.settings).toEqual({ siteTitle: "My Site" });
		expect(report.users).toEqual([{ id: 1, email: "a@b.com" }]);
		expect(report.media).toEqual([{ id: "m1" }]);
		expect(report.redirects).toEqual([{ sourcePath: "/old", targetPath: "/new" }]);
		expect(report.comments).toEqual([{ id: "c1" }]);
	});

	it("always includes the honest export-not-a-backup note", async () => {
		const report = await buildBackupExportReport({});
		expect(report.note).toMatch(/export/i);
		expect(report.note).toMatch(/not.*restorable backup/i);
	});

	it("stamps exportedAt as a valid ISO timestamp", async () => {
		const report = await buildBackupExportReport({});
		expect(() => new Date(report.exportedAt).toISOString()).not.toThrow();
		expect(new Date(report.exportedAt).toISOString()).toBe(report.exportedAt);
	});

	it("passes locals through to every runtime read function", async () => {
		const locals = { runtime: { env: { DB: {} } } };
		await buildBackupExportReport(locals);
		expect(mocks.content).toHaveBeenCalledWith(locals);
		expect(mocks.settings).toHaveBeenCalledWith(locals);
		expect(mocks.users).toHaveBeenCalledWith(locals);
		expect(mocks.media).toHaveBeenCalledWith(locals);
		expect(mocks.redirects).toHaveBeenCalledWith(locals);
		expect(mocks.comments).toHaveBeenCalledWith(locals);
	});
});
