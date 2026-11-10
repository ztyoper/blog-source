import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncThemeContent } from "./theme-content.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const theme = process.argv[2] || "firefly";
const action = process.argv[3] || "dev";
if (!["firefly", "fuwari"].includes(theme) || !["dev", "build", "preview", "check", "type-check", "stop"].includes(action)) {
	throw new Error("Usage: node scripts/theme-preview.mjs <firefly|fuwari> <dev|build|preview|check|type-check|stop>");
}
if (theme === "fuwari" && action === "stop") throw new Error("Stop Fuwari with Ctrl+C in its terminal.");
const themeRoot = theme === "firefly" ? projectRoot : path.join(projectRoot, "themes/fuwari");
const packageName = theme === "firefly" ? "pnpm" : "pnpm9";
const packageManager = path.join(projectRoot, ".tools/package-managers/node_modules", packageName, "bin/pnpm.cjs");
const packageManagerBin = path.join(projectRoot, "scripts/package-managers", theme);
if (!fs.existsSync(packageManager)) throw new Error("Local package manager missing. See the local setup guide.");
let timer;
if (theme === "fuwari") {
	const sync = () => syncThemeContent({ sourceRoot: projectRoot, targetRoot: themeRoot });
	console.log("Shared content:", sync());
	if (action === "dev") {
		let lastError = "";
		timer = setInterval(() => {
			try {
				const result = sync();
				if (result.copied || result.removed) console.log("Content updated:", result);
				lastError = "";
			} catch (error) {
				if (error.message !== lastError) console.error(error.message);
				lastError = error.message;
			}
		}, 1000);
	}
}
const args = action === "stop" ? [packageManager, "dev", "stop"] : [packageManager, action];
if (action === "dev" || action === "preview") {
	const port = (theme === "firefly" ? 4321 : 4322) + (action === "preview" ? 2 : 0);
	args.push("--host", "127.0.0.1", "--port", String(port));
}
const child = spawn(process.execPath, args, {
	cwd: themeRoot,
	stdio: "inherit",
	env: {
		...process.env,
		ASTRO_TELEMETRY_DISABLED: "1",
		// Astro 7 uses these markers in its foreground server child. Keep the
		// launcher foreground even when an agent environment is detected.
		ASTRO_DEV_BACKGROUND: "1",
		ASTRO_PREVIEW_BACKGROUND: "1",
		PATH: packageManagerBin + path.delimiter + path.dirname(process.execPath) + path.delimiter + process.env.PATH,
	},
});
child.on("error", error => {
	clearInterval(timer);
	console.error(error.message);
	process.exitCode = 1;
});
child.on("exit", code => {
	clearInterval(timer);
	process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		clearInterval(timer);
		child.kill(signal);
	});
}
