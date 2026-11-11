import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const theme = process.argv[2] || "firefly";
const action = process.argv[3] || "dev";
if (
	theme !== "firefly" ||
	!["dev", "build", "preview", "check", "type-check", "stop"].includes(action)
) {
	throw new Error(
		"Usage: node scripts/theme-preview.mjs firefly <dev|build|preview|check|type-check|stop>",
	);
}
const packageManager = path.join(
	projectRoot,
	".tools/package-managers/node_modules/pnpm/bin/pnpm.cjs",
);
const packageManagerBin = path.join(
	projectRoot,
	"scripts/package-managers/firefly",
);
if (!fs.existsSync(packageManager))
	throw new Error("Local package manager missing. See the local setup guide.");
const args =
	action === "stop"
		? [packageManager, "dev", "stop"]
		: [packageManager, action];
if (action === "dev" || action === "preview") {
	args.push(
		"--host",
		"127.0.0.1",
		"--port",
		action === "preview" ? "4323" : "4321",
	);
}
const child = spawn(process.execPath, args, {
	cwd: projectRoot,
	stdio: "inherit",
	env: {
		...process.env,
		ASTRO_TELEMETRY_DISABLED: "1",
		// Astro 7 uses these markers in its foreground server child. Keep the
		// launcher foreground even when an agent environment is detected.
		ASTRO_DEV_BACKGROUND: "1",
		ASTRO_PREVIEW_BACKGROUND: "1",
		PATH:
			packageManagerBin +
			path.delimiter +
			path.dirname(process.execPath) +
			path.delimiter +
			process.env.PATH,
	},
});
child.on("error", (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on("exit", (code) => {
	process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		child.kill(signal);
	});
}
