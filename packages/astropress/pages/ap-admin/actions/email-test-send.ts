import { sendTransactionalEmail, withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";

/**
 * POST /ap-admin/actions/email-test-send
 *
 * Sends a test transactional email to a specified address, reusing the
 * exact same sendTransactionalEmail() function reset-password.ts /
 * user-invite.ts already call live — no separate delivery path.
 */
export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/email", requireAction: "services:manage" },
		async ({ formData, locals, redirect, fail }) => {
			const to = String(formData.get("to") ?? "").trim();
			if (!to || !to.includes("@")) {
				return fail("A valid email address is required.");
			}

			const result = await sendTransactionalEmail(
				{
					to,
					subject: "Astropress test email",
					text: "This is a test email sent from the Astropress admin.",
					html: "<p>This is a test email sent from the Astropress admin.</p>",
				},
				locals,
			);

			if (!result.ok) {
				return fail(result.error ?? "Failed to send test email.");
			}

			return redirect(`/ap-admin/email?tested=1&delivered=${result.delivered ? "1" : "0"}`);
		},
	);
