import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
	new URL("./bin/astro.mjs", import.meta.resolve("astro/package.json")),
);
const incremental =
	process.env.FIREFLY_INCREMENTAL_BUILD === "1" && !process.env.CF_WORKERS;
const args = [cli, "build"];
if (!incremental || process.env.FIREFLY_FULL_REBUILD === "1") args.push("--force");

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
