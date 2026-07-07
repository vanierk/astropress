import type { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { makeDb, STANDARD_ACTOR, STANDARD_CMS_CONFIG } from "./helpers/make-db.js";
import { makeLocals } from "./helpers/make-locals.js";

// biome-ignore format: single-line typeof import required for esbuild/oxc compatibility
let saveRuntimeLocalBusinessConfig: typeof import("../src/runtime-actions-misc.js").saveRuntimeLocalBusinessConfig;
// biome-ignore format: single-line typeof import required for esbuild/oxc compatibility
let getRuntimeLocalBusinessConfig: typeof import("../src/runtime-page-store.js").getRuntimeLocalBusinessConfig;
let registerCms: typeof import("../src/config.js").registerCms;

const actor = STANDARD_ACTOR;

let db: DatabaseSync;
let locals: App.Locals;

const FULL_CONFIG = {
	name: "My Shop",
	streetAddress: "123 Main St",
	addressLocality: "Springfield",
	addressRegion: "IL",
	postalCode: "62701",
	addressCountry: "US",
	telephone: "+1-555-555-0100",
	openingHours: ["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"],
	geoLatitude: 39.7817,
	geoLongitude: -89.6501,
};

beforeEach(async () => {
	vi.resetModules();
	vi.doUnmock("../src/local-runtime-modules");
	vi.doUnmock("../src/local-runtime-modules.js");

	[{ saveRuntimeLocalBusinessConfig }, { getRuntimeLocalBusinessConfig }, { registerCms }] =
		await Promise.all([
			import("../src/runtime-actions-misc.js"),
			import("../src/runtime-page-store.js"),
			import("../src/config.js"),
		]);

	db = makeDb();
	locals = makeLocals(db);
	registerCms(STANDARD_CMS_CONFIG);
});

afterAll(() => {
	vi.resetModules();
});

describe("no-db fallback (null locals)", () => {
	it("saveRuntimeLocalBusinessConfig throws without runtime alias", async () => {
		await expect(saveRuntimeLocalBusinessConfig(FULL_CONFIG, actor, null)).rejects.toThrow(
			/only available when the host app provides them/,
		);
	});

	it("getRuntimeLocalBusinessConfig resolves to null (read side degrades to the static fallback, unlike the write side)", async () => {
		await expect(getRuntimeLocalBusinessConfig(null)).resolves.toBeNull();
	});
});

describe("getRuntimeLocalBusinessConfig", () => {
	it("returns null when no business has been configured yet", async () => {
		expect(await getRuntimeLocalBusinessConfig(locals)).toBeNull();
	});

	it("returns the saved config after saveRuntimeLocalBusinessConfig", async () => {
		await saveRuntimeLocalBusinessConfig(FULL_CONFIG, actor, locals);
		expect(await getRuntimeLocalBusinessConfig(locals)).toEqual(FULL_CONFIG);
	});
});

describe("saveRuntimeLocalBusinessConfig", () => {
	it("returns ok:true with the saved config", async () => {
		const result = await saveRuntimeLocalBusinessConfig(FULL_CONFIG, actor, locals);
		expect(result).toEqual({ ok: true, config: FULL_CONFIG });
	});

	it("upserts — a second save fully replaces the first", async () => {
		await saveRuntimeLocalBusinessConfig(FULL_CONFIG, actor, locals);
		const updated = { ...FULL_CONFIG, name: "New Name", telephone: undefined };
		await saveRuntimeLocalBusinessConfig(updated, actor, locals);
		const stored = await getRuntimeLocalBusinessConfig(locals);
		expect(stored?.name).toBe("New Name");
		expect(stored?.telephone).toBeUndefined();
	});

	it("persists without telephone/openingHours/geo when omitted", async () => {
		const minimal = {
			name: "Minimal Shop",
			streetAddress: "1 First Ave",
			addressLocality: "Town",
			addressRegion: "ST",
			postalCode: "00000",
			addressCountry: "US",
		};
		await saveRuntimeLocalBusinessConfig(minimal, actor, locals);
		const stored = await getRuntimeLocalBusinessConfig(locals);
		expect(stored?.telephone).toBeUndefined();
		expect(stored?.openingHours).toBeUndefined();
		expect(stored?.geoLatitude).toBeUndefined();
		expect(stored?.geoLongitude).toBeUndefined();
	});

	it("records an audit event on save", async () => {
		await saveRuntimeLocalBusinessConfig(FULL_CONFIG, actor, locals);
		const events = db
			.prepare(
				"SELECT action, resource_type, resource_id FROM audit_events ORDER BY id DESC LIMIT 1",
			)
			.get() as { action: string; resource_type: string; resource_id: string };
		expect(events.action).toBe("local-business.update");
		expect(events.resource_type).toBe("auth");
		expect(events.resource_id).toBe("local-business-config");
	});
});
