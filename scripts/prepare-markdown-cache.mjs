import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

export const markdownCacheStamp = "node_modules/.astro/firefly-content-key";
const contentStore = "node_modules/.astro/data-store.json";

function getFrontmatter(source) {
	const opening = /^\uFEFF?---(?!-)[^\r\n]*(?:\r?\n|$)/.exec(source);
	if (!opening) return "";
	const remaining = source.slice(opening[0].length);
	const closing = /(?:^|\n)---[^\r\n]*/.exec(remaining);
	return closing
		? opening[0] + remaining.slice(0, closing.index + closing[0].length)
		: source;
}

export async function prepareMarkdownCache(root = process.cwd()) {
	const hash = createHash("sha256");
	hash.update(
		JSON.stringify([
			"v1",
			process.version,
			process.platform,
			process.arch,
			process.env.TZ,
		]),
	);
	const sourceFiles = await glob(
		[
			"astro.config.mjs",
			"package.json",
			"pnpm-lock.yaml",
			"pnpm-workspace.yaml",
			"tsconfig.json",
			"src/**/*.{astro,css,html,js,json,mjs,mts,svelte,ts,yaml,yml}",
		],
		{ cwd: root, nodir: true },
	);
	for (const file of sourceFiles.sort()) {
		hash.update(
			JSON.stringify([file, await fs.readFile(path.join(root, file), "utf8")]),
		);
	}

	// Wiki cards also resolve relative cover files at Markdown compile time.
	const localFiles = await glob(["src/**/*", "public/**/*"], {
		cwd: root,
		nodir: true,
		dot: true,
	});
	hash.update(JSON.stringify(localFiles.sort()));

	// Wiki links can use another post's filename or frontmatter, including drafts.
	const posts = await glob("src/content/posts/**/*.{md,mdx,markdown}", {
		cwd: root,
		nodir: true,
		dot: true,
		nocase: true,
	});
	for (const file of posts.sort()) {
		const source = await fs.readFile(path.join(root, file), "utf8");
		hash.update(JSON.stringify([file, getFrontmatter(source)]));
	}

	const fingerprint = hash.digest("hex");
	let previous;
	try {
		previous = await fs.readFile(path.join(root, markdownCacheStamp), "utf8");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	if (previous !== fingerprint) {
		await fs.rm(path.join(root, markdownCacheStamp), { force: true });
		await fs.rm(path.join(root, contentStore), { force: true });
	}
	console.log(
		"[FIREFLY] Markdown cache inputs " +
			(previous === fingerprint ? "match" : "changed"),
	);
	return fingerprint;
}
