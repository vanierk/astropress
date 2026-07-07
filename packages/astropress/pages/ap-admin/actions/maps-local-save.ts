import { saveRuntimeLocalBusinessConfig, withAdminFormAction } from "@astropress-diy/astropress";
import type { APIRoute } from "astro";

export const POST: APIRoute = async (context) =>
	withAdminFormAction(
		context,
		{ failurePath: "/ap-admin/maps-local", requireAction: "seo:edit" },
		async ({ actor, formData, locals, redirect, fail }) => {
			const name = formData.get("name") as string | null;
			const streetAddress = formData.get("streetAddress") as string | null;
			const addressLocality = formData.get("addressLocality") as string | null;
			const addressRegion = formData.get("addressRegion") as string | null;
			const postalCode = formData.get("postalCode") as string | null;
			const addressCountry = formData.get("addressCountry") as string | null;
			const telephone = formData.get("telephone") as string | null;
			const openingHoursRaw = formData.get("openingHours") as string | null;
			const geoLatitudeRaw = formData.get("geoLatitude") as string | null;
			const geoLongitudeRaw = formData.get("geoLongitude") as string | null;

			if (
				!name?.trim() ||
				!streetAddress?.trim() ||
				!addressLocality?.trim() ||
				!addressRegion?.trim() ||
				!postalCode?.trim() ||
				!addressCountry?.trim()
			) {
				return fail("Name, street address, city, region, postal code, and country are required");
			}

			const openingHours = openingHoursRaw
				?.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

			const geoLatitude = geoLatitudeRaw?.trim() ? Number(geoLatitudeRaw) : undefined;
			if (geoLatitude !== undefined && Number.isNaN(geoLatitude)) {
				return fail("Latitude must be a number");
			}
			const geoLongitude = geoLongitudeRaw?.trim() ? Number(geoLongitudeRaw) : undefined;
			if (geoLongitude !== undefined && Number.isNaN(geoLongitude)) {
				return fail("Longitude must be a number");
			}

			const result = await saveRuntimeLocalBusinessConfig(
				{
					name: name.trim(),
					streetAddress: streetAddress.trim(),
					addressLocality: addressLocality.trim(),
					addressRegion: addressRegion.trim(),
					postalCode: postalCode.trim(),
					addressCountry: addressCountry.trim(),
					telephone: telephone?.trim() || undefined,
					openingHours: openingHours && openingHours.length > 0 ? openingHours : undefined,
					geoLatitude,
					geoLongitude,
				},
				actor,
				locals,
			);

			if (!result.ok) {
				return fail(result.error);
			}

			return redirect("/ap-admin/maps-local?saved=1");
		},
	);
