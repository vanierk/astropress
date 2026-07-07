import { escJs, requestOptedOutOfTracking } from "./analytics.js";
import type { HeatmapsConfig } from "./config";

/**
 * Resolves the heatmaps/session-replay tracking snippet for the configured
 * provider.
 *
 * Returns an HTML string (a `<script>` tag) that should be placed in the
 * `<head>` of the host layout. Returns an empty string if heatmaps is not
 * configured, or if required fields are missing.
 *
 * Heatmaps are always viewed in the provider's own dashboard (Clarity,
 * Hotjar) — this function only injects the tracking snippet; Astropress has
 * no local heatmap rendering.
 *
 * For the "custom" type, the snippet is passed through as-is.
 * For all other types, the snippet is built from the config fields.
 */
export function resolveHeatmapsSnippet(config?: HeatmapsConfig | null): string {
	if (!config) return "";

	switch (config.type) {
		case "clarity": {
			if (!config.projectId) return "";
			return [
				"<script>",
				"(function(c,l,a,r,i,t,y){",
				"    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};",
				'    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;',
				"    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);",
				`})(window, document, "clarity", "script", '${escJs(config.projectId)}');`,
				"</script>",
			].join("\n");
		}
		case "hotjar": {
			if (!config.hjid) return "";
			const hjsv = config.hjsv ?? "6";
			return [
				"<script>",
				"(function(h,o,t,j,a,r){",
				"    h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};",
				`    h._hjSettings={hjid:'${escJs(config.hjid)}',hjsv:'${escJs(hjsv)}'};`,
				"    a=o.getElementsByTagName('head')[0];",
				"    r=o.createElement('script');r.async=1;",
				"    r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;",
				"    a.appendChild(r);",
				"})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');",
				"</script>",
			].join("\n");
		}
		case "custom": {
			// Custom snippets are passed through as-is (host is responsible for sanitization)
			return config.snippetSrc ?? "";
		}
		default:
			return "";
	}
}

/**
 * Like `resolveHeatmapsSnippet`, but returns an empty string when the request
 * carries a `DNT: 1` or `Sec-GPC: 1` header — honoring the user's opt-out.
 *
 * @example
 * ```astro
 * ---
 * import { resolveHeatmapsSnippetConsentAware } from "@astropress-diy/astropress/heatmaps";
 * const snippet = resolveHeatmapsSnippetConsentAware(config.heatmaps, Astro.request);
 * ---
 * {snippet && <Fragment set:html={snippet} />}
 * ```
 */
export function resolveHeatmapsSnippetConsentAware(
	config: HeatmapsConfig | null | undefined,
	request: Request,
): string {
	if (requestOptedOutOfTracking(request)) return "";
	return resolveHeatmapsSnippet(config);
}
