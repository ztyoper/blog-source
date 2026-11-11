import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	markdownCacheStamp,
	prepareMarkdownCache,
} from "./prepare-markdown-cache.mjs";

const cli = fileURLToPath(
	new URL("./bin/astro.mjs", import.meta.resolve("astro/package.json")),
);
const incremental =
	process.env.FIREFLY_INCREMENTAL_BUILD === "1" && !process.env.CF_WORKERS;
const args = [cli, "build"];
if (!incremental || process.env.FIREFLY_FULL_REBUILD === "1")
	args.push("--force");

const markdownKey = incremental ? await prepareMarkdownCache() : undefined;
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status === 0 && markdownKey)
	await writeFile(markdownCacheStamp, markdownKey);
process.exitCode = result.status ?? 1;
