import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { createInlineScriptMinifier } from "../../scripts/inline-script-minifier";
import { buildMetadataFile } from "../utils/build-metadata";

export function incrementalStaticOutput(): AstroIntegration {
	return {
		name: "firefly:incremental-static-output",
		hooks: {
			"astro:config:setup": ({ config, injectRoute }) => {
				injectRoute({
					pattern: "/" + buildMetadataFile,
					entrypoint: fileURLToPath(
						new URL("./src/plugins/build-metadata-endpoint.ts", config.root),
					),
				});
			},
			"astro:build:start": ({ setPrerenderer, logger }) => {
				const minifier = createInlineScriptMinifier();
				let htmlPages = 0;
				setPrerenderer((prerenderer) => ({
					...prerenderer,
					async getStaticPaths() {
						const start = performance.now();
						const paths = await prerenderer.getStaticPaths();
						logger.info(
							`Resolved ${paths.length} static routes in ${Math.round(performance.now() - start)}ms`,
						);
						return paths;
					},
					async render(request, options) {
						const result = await prerenderer.render(request, options);
						const response =
							result instanceof Response ? result : result.response;
						if (
							options.routeData.type !== "page" ||
							!response.body ||
							(response.status >= 300 && response.status < 400) ||
							!response.headers.get("content-type")?.startsWith("text/html")
						) {
							return result;
						}

						// Astro writes this response to both dist and its page cache.
						const html = minifier.rewrite(
							await response.text(),
							new URL(request.url).pathname,
						);
						const headers = new Headers(response.headers);
						headers.delete("content-length");
						const minified = new Response(html, {
							status: response.status,
							statusText: response.statusText,
							headers,
						});
						htmlPages++;
						return result instanceof Response
							? minified
							: { ...result, response: minified };
					},
					async teardown() {
						await prerenderer.teardown?.();
						logger.info(minifier.summary(htmlPages));
					},
				}));
			},
		},
	};
}
