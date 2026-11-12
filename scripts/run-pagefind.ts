// 在 astro build 之后运行 Pagefind。
// 之前直接在 package.json 里写 `pagefind --site dist`，在 Cloudflare Pages（产物在
// dist/client）上会索引出 /client/... 的假路径，并且索引输出到 dist/pagefind，
// 根本不会随站点部署 —— 线上搜索一直是 404。这里对准真正的站点根目录再跑，
// 索引会输出到 <root>/pagefind，随站点一起上传。

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { fromHtml } from "hast-util-from-html";
import { EXIT, SKIP, visit } from "unist-util-visit";
import { incrementalBuildEnabled } from "../src/utils/build-metadata";
import { resolveSiteRoot } from "./site-root";

const cacheRoot = "node_modules/.astro/firefly-pagefind";
const cachedIndex = path.join(cacheRoot, "index");
const cacheStamp = path.join(cacheRoot, "key");
const pagefindBody = /\sdata-pagefind-body(?=[\s=>/])/i;
const musicWidgetId = /^music-widget-[a-z0-9]+(-layout)?$/;

function hasIndexedBody(root: ReturnType<typeof fromHtml>): boolean {
	const document = root.children.find(
		(node) =>
			node.type === "element" && node.tagName === "html" && node.position,
	);
	if (!document) return false;

	let found = false;
	visit(document, "element", (node) => {
		if (Object.hasOwn(node.properties, "dataPagefindIgnore")) return SKIP;
		if (Object.hasOwn(node.properties, "dataPagefindBody")) {
			found = true;
			return EXIT;
		}
	});
	return found;
}

function normalizeMusicWidgetIds(
	root: ReturnType<typeof fromHtml>,
): string | undefined {
	let changed = false;
	visit(root, "element", (node) => {
		const { properties } = node;
		if (Object.hasOwn(properties, "dataPagefindBody")) return SKIP;
		if (Object.keys(properties).some((name) => name.startsWith("dataPagefind")))
			return;

		const classes = properties.className;
		const attribute =
			node.tagName === "widget-layout"
				? "dataId"
				: node.tagName === "div" &&
						Array.isArray(classes) &&
						(classes.includes("music-player-widget") ||
							classes.includes("collapse-wrapper"))
					? "id"
					: undefined;
		if (!attribute) return;
		const id = properties[attribute];
		const match = typeof id === "string" ? musicWidgetId.exec(id) : undefined;
		if (!match) return;

		properties[attribute] = match[1] ? "music-widget-layout" : "music-widget";
		changed = true;
	});
	return changed
		? JSON.stringify(root, (key, value) =>
				key === "position" ? undefined : value,
			)
		: undefined;
}

function buildIndex(siteRoot: string): boolean {
	const result = spawnSync("pagefind", ["--site", siteRoot], {
		stdio: "inherit",
		// Windows 下 .bin 里是 .cmd 包装，需要 shell 才能解析到
		shell: process.platform === "win32",
	});
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
	return result.status === 0;
}

async function getIndexKey(siteRoot: string): Promise<string | undefined> {
	const configFiles = (await glob("pagefind.{yml,yaml,json,toml}")).sort();
	const config = await Promise.all(
		configFiles.map((file) => readFile(file, "utf8")),
	);
	// Custom input or output paths use the CLI directly.
	if (
		Object.keys(process.env).some((key) => key.startsWith("PAGEFIND_")) ||
		config.some((source) =>
			/\b(?:glob|root_selector|output_path|output_subdir)\b/i.test(source),
		)
	) {
		return undefined;
	}

	const files = (
		await glob("**/*.html", { cwd: siteRoot, nodir: true, dot: true, posix: true })
	).sort();
	const pagefindPackage = new URL(
		"../package.json",
		import.meta.resolve("pagefind"),
	);
	const options = JSON.stringify([
		"v3",
		process.platform,
		process.arch,
		await readFile(pagefindPackage, "utf8"),
		configFiles,
		config,
	]);
	const allPages = createHash("sha256").update(options);
	const bodyPages = createHash("sha256").update(options);
	let hasBody = false;
	for (let start = 0; start < files.length; start += 16) {
		const batch = await Promise.all(
			files.slice(start, start + 16).map(async (file) => {
				const html = await readFile(path.join(siteRoot, file));
				const source = html.toString();
				return {
					file,
					digest: createHash("sha256").update(html).digest("hex"),
					marked: pagefindBody.test(source),
					// Astro restores post HTML byte-for-byte. Only other routes need normalization.
					source: !hasBody || !file.startsWith("posts/") ? source : undefined,
				};
			}),
		);
		for (const page of batch) {
			const input = JSON.stringify([page.file, page.digest]);
			allPages.update(input);
			if (page.marked) {
				const tree = page.source ? fromHtml(page.source) : undefined;
				if (!hasBody && tree) hasBody = hasIndexedBody(tree);
				const normalized =
					tree && !page.file.startsWith("posts/")
						? normalizeMusicWidgetIds(tree)
						: undefined;
				bodyPages.update(
					normalized
						? JSON.stringify([
								page.file,
								createHash("sha256").update(normalized).digest("hex"),
							])
						: input,
				);
			}
		}
	}
	// Pagefind indexes only marked pages when the site has a data-pagefind-body.
	return (hasBody ? bodyPages : allPages).digest("hex");
}

async function main() {
	const siteRoot = resolveSiteRoot();
	const key = incrementalBuildEnabled ? await getIndexKey(siteRoot) : undefined;
	const index = path.join(siteRoot, "pagefind");
	if (
		key &&
		process.env.FIREFLY_FULL_REBUILD !== "1" &&
		existsSync(path.join(cachedIndex, "pagefind-entry.json")) &&
		existsSync(cacheStamp) &&
		(await readFile(cacheStamp, "utf8")) === key
	) {
		await cp(cachedIndex, index, { recursive: true });
		console.log("[FIREFLY] Reused Pagefind search index");
		return;
	}

	if (
		buildIndex(siteRoot) &&
		key &&
		existsSync(path.join(index, "pagefind-entry.json"))
	) {
		await rm(cacheStamp, { force: true });
		await rm(cachedIndex, { recursive: true, force: true });
		await cp(index, cachedIndex, { recursive: true });
		await writeFile(cacheStamp, key);
	}
}

main().catch((error) => {
	console.error("Pagefind build failed:", error);
	process.exitCode = 1;
});
