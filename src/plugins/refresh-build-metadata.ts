import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { createInlineScriptMinifier } from "../../scripts/inline-script-minifier";
import {
	buildMetadataFile,
	buildTimePlaceholder,
	wordCountPlaceholder,
} from "../utils/build-metadata";

const buildValueSpan =
	/<span\b[^>]*\bdata-firefly-build-value=["']?(?:time|words)["']?[^>]*>[^<]*<\/span>/g;

export function refreshBuildMetadata(): AstroIntegration {
	return {
		name: "firefly:build-metadata",
		hooks: {
			"astro:config:setup": ({ config, injectRoute }) => {
				injectRoute({
					pattern: "/" + buildMetadataFile,
					entrypoint: fileURLToPath(
						new URL("./src/plugins/build-metadata-endpoint.ts", config.root),
					),
				});
			},
			"astro:build:done": async ({ dir, logger }) => {
				const metadataPath = new URL(buildMetadataFile, dir);
				const { buildTime, wordCount } = JSON.parse(
					await readFile(metadataPath, "utf8"),
				);
				if (typeof buildTime !== "string" || typeof wordCount !== "string") {
					throw new Error("Invalid Firefly build metadata");
				}

				// Astro caches the HTML before this hook. Refresh shared values
				// in both newly rendered and restored pages before indexing.
				const entries = await readdir(fileURLToPath(dir), {
					recursive: true,
					withFileTypes: true,
				});
				const minifier = createInlineScriptMinifier();
				let updated = 0;
				let pages = 0;
				for (const entry of entries) {
					if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
					pages++;
					const file = path.join(entry.parentPath, entry.name);
					const html = await readFile(file, "utf8");
					const refreshed = html.replace(buildValueSpan, (span) =>
						span
							.replaceAll(buildTimePlaceholder, () => buildTime)
							.replaceAll(wordCountPlaceholder, () => wordCount),
					);
					const output = minifier.rewrite(refreshed, file);
					if (output !== html) await writeFile(file, output);
					if (refreshed !== html) updated++;
				}
				await unlink(metadataPath);
				logger.info("Refreshed build metadata in " + updated + " HTML pages.");
				logger.info(minifier.summary(pages));
			},
		},
	};
}
