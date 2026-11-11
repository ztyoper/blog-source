import fs from "node:fs/promises";
import { glob } from "glob";
import { incrementalBuildEnabled } from "../src/utils/build-metadata";
import { createInlineScriptMinifier } from "./inline-script-minifier";
import { resolveSiteRoot } from "./site-root";

async function main() {
	// The incremental Astro build combines this with the metadata refresh.
	if (incrementalBuildEnabled) return;

	const minifier = createInlineScriptMinifier();
	const htmlFiles = await glob(resolveSiteRoot() + "/**/*.html");
	for (const file of htmlFiles) {
		const html = await fs.readFile(file, "utf8");
		const output = minifier.rewrite(html, file);
		if (output !== html) await fs.writeFile(file, output);
	}
	console.log(minifier.summary(htmlFiles.length));
}

main().catch((err) => {
	console.error("❌ Inline script minification failed:", err);
	process.exit(1);
});
