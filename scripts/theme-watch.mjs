import fs from "node:fs";
import path from "node:path";

export function watchSharedContent({
	sourceRoot,
	onChange,
	onError = console.error,
	delayMs = 1000,
}) {
	let timer;
	let closed = false;
	const watchers = [];
	const schedule = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (!closed) onChange();
		}, delayMs);
	};
	try {
		for (const [relative, matches] of [
			[
				"src/content",
				(name) =>
					name === "posts" ||
					name.startsWith("posts/") ||
					name === "spec" ||
					name === "spec/about.md",
			],
			[
				"public",
				(name) =>
					name === "images" ||
					name.startsWith("images/") ||
					name === "avatar.svg",
			],
		]) {
			const watcher = fs.watch(
				path.join(sourceRoot, relative),
				{ recursive: true },
				(_event, filename) => {
					const name = filename?.toString().replaceAll("\\", "/").toLowerCase();
					if (!name || matches(name)) schedule();
				},
			);
			watcher.on("error", onError);
			watchers.push(watcher);
		}
	} catch (error) {
		for (const watcher of watchers) watcher.close();
		throw error;
	}
	return () => {
		closed = true;
		clearTimeout(timer);
		for (const watcher of watchers) watcher.close();
	};
}
