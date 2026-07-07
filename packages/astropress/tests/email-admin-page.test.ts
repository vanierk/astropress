/**
 * Verifies email.astro is wired to the real, already-live transactional
 * email system (getTransactionalEmailConfig / sendTransactionalEmail)
 * rather than a new subsystem, gates on services:manage, never exposes
 * secret values (presence only), and is clearly labeled transactional
 * (distinct from Newsletter). Astro components in this repo are verified
 * by source assertions (no render harness set up for unit tests) — same
 * convention as aeo-metadata.test.ts / plugins-admin-page.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagesRoot = path.resolve(import.meta.dirname, "../pages/ap-admin");
const emailPagePath = path.join(pagesRoot, "email.astro");
const emailPageSrc = readFileSync(emailPagePath, "utf8");
const emailActionPath = path.join(pagesRoot, "actions/email-test-send.ts");
const emailActionSrc = readFileSync(emailActionPath, "utf8");

describe("email.astro — wired to the real transactional-email system", () => {
	it("exists at the real entrypoint", () => {
		expect(existsSync(emailPagePath)).toBe(true);
	});

	it("gates on services:manage", () => {
		expect(emailPageSrc).toContain('requiresAccess(Astro, "services:manage")');
	});

	it("reads the live config via getTransactionalEmailConfig, not a new store", () => {
		expect(emailPageSrc).toContain("getTransactionalEmailConfig(Astro.locals)");
	});

	it("never renders the raw resendApiKey or smtpPassword values", () => {
		// Presence-only: these secret fields must only ever be passed through
		// the presence() helper, never interpolated directly into markup.
		expect(emailPageSrc).not.toMatch(/\{config\.resendApiKey\}/);
		expect(emailPageSrc).not.toMatch(/\{config\.smtpPassword\}/);
		expect(emailPageSrc).toContain("presence(config.resendApiKey)");
		expect(emailPageSrc).toContain("presence(config.smtpPassword)");
		expect(emailPageSrc).toContain("presence(config.smtpUsername)");
	});

	it("shows non-secret operational values directly (host/port/from-address are not secrets)", () => {
		expect(emailPageSrc).toContain("config.smtpHost");
		expect(emailPageSrc).toContain("config.smtpPort");
		expect(emailPageSrc).toContain("config.resendFrom");
		expect(emailPageSrc).toContain("config.smtpFrom");
		expect(emailPageSrc).toContain("config.contactDestination");
	});

	it("distinguishes transactional email from Newsletter in its own copy", () => {
		expect(emailPageSrc).toContain("email.description");
	});

	it("has a test-send form posting to the email-test-send action with CSRF", () => {
		expect(emailPageSrc).toContain('action="/ap-admin/actions/email-test-send"');
		expect(emailPageSrc).toContain("CsrfInput");
	});

	it("uses getPageT for i18n rather than hardcoded English", () => {
		expect(emailPageSrc).toContain("getPageT(adminLocale)");
	});
});

describe("actions/email-test-send.ts — reuses sendTransactionalEmail, does not reimplement delivery", () => {
	it("exists", () => {
		expect(existsSync(emailActionPath)).toBe(true);
	});

	it("is wrapped in withAdminFormAction gated on services:manage", () => {
		expect(emailActionSrc).toContain("withAdminFormAction");
		expect(emailActionSrc).toContain('requireAction: "services:manage"');
	});

	it("calls the existing sendTransactionalEmail rather than a new send path", () => {
		expect(emailActionSrc).toContain("sendTransactionalEmail(");
		expect(emailActionSrc).not.toContain('fetch("https://api.resend.com');
		expect(emailActionSrc).not.toContain("nodemailer");
	});
});

describe("promotion out of the stub", () => {
	const routesDefinitionsSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/admin-routes-definitions.ts"),
		"utf8",
	);
	const stubCatalogSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/admin-stub-catalog.ts"),
		"utf8",
	);
	const manifestSrc = readFileSync(
		path.resolve(import.meta.dirname, "../src/integration-manifest-data.ts"),
		"utf8",
	);

	it("admin-routes-definitions.ts points /ap-admin/email at the real page", () => {
		expect(routesDefinitionsSrc).toMatch(
			/pattern: "\/ap-admin\/email", entrypoint: "email\.astro"/,
		);
	});

	it("registers the new email-test-send action route", () => {
		expect(routesDefinitionsSrc).toMatch(/pattern: "\/ap-admin\/actions\/email-test-send"/);
	});

	it("is no longer routed through ADMIN_STUB_PAGES", () => {
		const stubPagesBlock = stubCatalogSrc.slice(
			stubCatalogSrc.indexOf("export const ADMIN_STUB_PAGES"),
		);
		expect(stubPagesBlock).not.toMatch(/^\temail: \{/m);
	});

	it("integration-manifest-data.ts marks the email entry status: real (not coming-soon)", () => {
		const emailEntry = manifestSrc.match(/\{\s*href: "\/ap-admin\/email",[\s\S]*?\n\t\},/)?.[0];
		expect(emailEntry).toBeDefined();
		expect(emailEntry).toContain('status: "real"');
		expect(emailEntry).not.toContain("coming-soon");
		expect(emailEntry).not.toContain("roadmapHref");
	});

	it("adminStubs.email's orphaned configHint references the real EMAIL_DELIVERY_MODE env var, not the old wrong name", () => {
		expect(stubCatalogSrc).toContain("EMAIL_DELIVERY_MODE=resend");
		expect(stubCatalogSrc).not.toContain("EMAIL_PROVIDER=resend");
	});
});
