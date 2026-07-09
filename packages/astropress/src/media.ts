import { peekCmsConfig } from "./config.js";
import type { ImageCdnConfig } from "./config-service-types.js";
import { stripTrailingSlashes } from "./path-helpers";
import { getCloudflareBindings, getStringRuntimeValue, isProductionRuntime } from "./runtime-env";

export interface MediaRecord {
	id: string;
	sourceUrl: string | null;
	localPath: string;
	r2Key: string | null;
}

interface MediaResolutionOptions {
	mode: "development" | "deployment";
	r2BaseUrl?: string;
	imageCdn?: ImageCdnConfig;
}

/**
 * Wraps an already-resolved, publicly-fetchable origin URL in an image
 * CDN's on-the-fly transform-proxy template. Pure and unit-testable in
 * isolation — never calls resolveMediaUrl or touches config itself.
 *
 * All three confirmed providers require the source/pull-zone/fetch
 * permission to already exist on the provider's own dashboard — this
 * function only supplies the resulting hostname/cloud name; it never
 * provisions anything.
 */
export function wrapImageCdnUrl(resolvedUrl: string, config: ImageCdnConfig): string {
	switch (config.provider) {
		case "cloudinary": {
			if (!config.cloudName) return resolvedUrl;
			const transformSegment = config.defaultParams ? `${config.defaultParams}/` : "";
			return `https://res.cloudinary.com/${config.cloudName}/image/fetch/${transformSegment}${resolvedUrl}`;
		}
		case "imgix": {
			if (!config.sourceHostname) return resolvedUrl;
			const query = config.defaultParams ? `?${config.defaultParams}` : "";
			return `https://${config.sourceHostname}/${encodeURIComponent(resolvedUrl)}${query}`;
		}
		case "bunny": {
			if (!config.pullZoneHostname) return resolvedUrl;
			let path: string;
			try {
				path = new URL(resolvedUrl).pathname;
			} catch {
				return resolvedUrl;
			}
			const query = config.defaultParams ? `?${config.defaultParams}` : "";
			return `https://${config.pullZoneHostname}${path}${query}`;
		}
		case "custom": {
			if (!config.urlTemplate) return resolvedUrl;
			return config.urlTemplate.replace("{url}", resolvedUrl);
		}
		default:
			return resolvedUrl;
	}
}

export function resolveMediaUrl(record: MediaRecord, options: MediaResolutionOptions) {
	if (options.mode === "development") {
		return record.localPath;
	}

	if (!options.r2BaseUrl || !record.r2Key) {
		return record.localPath;
	}

	const resolvedR2Url = `${stripTrailingSlashes(options.r2BaseUrl)}/${record.r2Key}`;

	// Only wrap a real, publicly-fetchable R2 URL — never the localPath
	// fallback above, and this branch is unreachable in development mode
	// (the function already returned above). If imageCdn is unconfigured,
	// this is a no-op and the function's output is unchanged from before
	// this option existed.
	if (options.imageCdn) {
		return wrapImageCdnUrl(resolvedR2Url, options.imageCdn);
	}

	return resolvedR2Url;
}

export function getRuntimeMediaResolutionOptions(
	locals?: App.Locals | null,
): MediaResolutionOptions {
	const bindings = getCloudflareBindings(locals);
	const r2BaseUrl = getStringRuntimeValue("PUBLIC_R2_BASE_URL", locals);
	const useDeploymentMode = Boolean(r2BaseUrl || bindings.MEDIA_BUCKET) || isProductionRuntime();
	return {
		mode: useDeploymentMode ? "deployment" : "development",
		r2BaseUrl,
		imageCdn: peekCmsConfig()?.imageCdn,
	};
}

export function resolveRuntimeMediaUrl(record: MediaRecord, locals?: App.Locals | null) {
	return resolveMediaUrl(record, getRuntimeMediaResolutionOptions(locals));
}
