import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import { pinyin } from "pinyin-pro";
import remarkMath from "remark-math";
import { hostedUrl, readImageHosting } from "./yuque-image-hosting.mjs";

// remark-math registers its micromark/mdast extensions in processor.data().
// Reuse those extensions with fromMarkdown, without rendering the document.
const mathData = {};
remarkMath.call({ data: () => mathData });
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const slash = (value) => value.replaceAll("\\", "/");
const key = (value) => path.resolve(value).toLowerCase();

function assertInside(root, target) {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	if (
		relative === ".." ||
		relative.startsWith(".." + path.sep) ||
		path.isAbsolute(relative)
	) {
		throw new Error("Unsafe path outside import root: " + target);
	}
}

function assertNoLinks(root, target) {
	assertInside(root, target);
	const segments = path.relative(root, target).split(path.sep).filter(Boolean);
	let current = root;
	for (const segment of ["", ...segments]) {
		if (segment) current = path.join(current, segment);
		if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
			throw new Error("Symbolic link or junction in import path: " + current);
		}
	}
}

function sourcePath(root, relative) {
	if (
		typeof relative !== "string" ||
		path.isAbsolute(relative) ||
		relative
			.split(/[\\/]/)
			.some((s) => [".", "..", ".yuque-source", ".yuque-cache"].includes(s))
	) {
		throw new Error("Unsafe source path / traversal: " + relative);
	}
	const target = path.resolve(root, relative);
	assertNoLinks(root, target);
	return target;
}

function walkAssets(root) {
	if (!fs.existsSync(root)) return [];
	assertNoLinks(root, root);
	const files = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const file = path.join(root, entry.name);
		if (entry.isSymbolicLink()) throw new Error("Linked source asset: " + file);
		if (entry.name.startsWith(".")) continue;
		if (entry.isDirectory()) files.push(...walkAssets(file));
		else if (entry.isFile()) files.push(file);
	}
	return files;
}

function destinationSpan(raw, definition = false) {
	let labelDepth = 0;
	let closing = -1;
	for (let i = raw.indexOf("["); i >= 0 && i < raw.length; i++) {
		if (raw[i] === "\\") {
			i++;
			continue;
		}
		if (raw[i] === "`") {
			const marker = raw.slice(i).match(/^`+/)[0];
			const next = raw.indexOf(marker, i + marker.length);
			if (next >= 0) {
				i = next + marker.length - 1;
				continue;
			}
		}
		if (raw[i] === "[") labelDepth++;
		if (raw[i] === "]" && --labelDepth === 0) {
			closing = i;
			break;
		}
	}
	if (closing < 0 || raw[closing + 1] !== (definition ? ":" : "(")) return null;
	let start = closing + 2;
	while (/\s/.test(raw[start] || "") && start < raw.length) start++;
	if (raw[start] === "<") {
		const end = raw.indexOf(">", start + 1);
		return end < 0 ? null : { start: start + 1, end };
	}
	let depth = 0;
	let end = start;
	for (; end < raw.length; end++) {
		const char = raw[end];
		if (char === "\\") {
			end++;
			continue;
		}
		if (/\s/.test(char)) break;
		if (char === "(") depth++;
		if (char === ")") {
			if (depth === 0) break;
			depth--;
		}
	}
	return { start, end };
}

export function rewriteMarkdown(markdown, resolveUrl) {
	const tree = fromMarkdown(markdown, {
		extensions: mathData.micromarkExtensions,
		mdastExtensions: mathData.fromMarkdownExtensions,
	});
	const edits = [];
	function visit(node) {
		if (["code", "inlineCode", "math", "inlineMath"].includes(node.type))
			return;
		const offset = node.position?.start.offset;
		if (["link", "image", "definition"].includes(node.type)) {
			const next = resolveUrl(node.url, node.type);
			if (next !== node.url) {
				const raw = markdown.slice(offset, node.position.end.offset);
				const span = destinationSpan(raw, node.type === "definition");
				if (!span) throw new Error("Cannot locate Markdown URL destination");
				edits.push({
					start: offset + span.start,
					end: offset + span.end,
					text: next,
				});
			}
		}
		if (node.type === "html" && !node.value.trimStart().startsWith("<!--")) {
			for (const match of node.value.matchAll(
				/\b(?:src|href)\s*=\s*(["'])(.*?)\1/dg,
			)) {
				const next = resolveUrl(match[2], "html");
				if (next !== match[2])
					edits.push({
						start: offset + match.indices[2][0],
						end: offset + match.indices[2][1],
						text: next,
					});
			}
		}
		for (const child of node.children || []) visit(child);
	}
	visit(tree);
	let result = markdown;
	let previous = markdown.length;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		if (edit.end > previous) throw new Error("Overlapping Markdown URL edits");
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
		previous = edit.start;
	}
	return { markdown: result, rewritten: edits.length };
}

export function readYuqueSeriesPositions(markdown, postIdsByRoute) {
	const positions = new Map();
	const siblingCounts = new Map();
	function add(route, parent) {
		const order = (siblingCounts.get(parent) ?? 0) + 1;
		siblingCounts.set(parent, order);
		positions.set(route, { order, seriesParent: postIdsByRoute.get(parent) });
	}
	function visit(list, parent) {
		for (const item of list.children) {
			const paragraph = item.children.find((child) => child.type === "paragraph");
			const link = paragraph?.children.find((child) => child.type === "link");
			const route = link?.url;
			const listed = postIdsByRoute.has(route) && !positions.has(route);
			if (listed) add(route, parent);
			for (const node of item.children) {
				if (node.type === "list") visit(node, listed ? route : parent);
			}
		}
	}
	for (const node of fromMarkdown(markdown).children) {
		if (node.type === "list") visit(node, undefined);
	}
	// Export reports can include articles outside the outline.
	for (const route of postIdsByRoute.keys()) {
		if (!positions.has(route)) add(route, undefined);
	}
	return positions;
}

function bookSlug(name) {
	return name
		.replace(
			/[\u3400-\u9fff]+/g,
			(text) =>
				"-" + pinyin(text, { toneType: "none", type: "array" }).join("-") + "-",
		)
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function dateValue(value, fallback = "2026-11-10") {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return fallback;
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function header({
	title,
	published,
	updated,
	category,
	order,
	seriesParent,
	pinned = false,
	description,
}) {
	return [
		"---",
		"title: " + JSON.stringify(title),
		"published: " + published,
		...(updated ? ["updated: " + updated] : []),
		"description: " + JSON.stringify(description),
		'tags: ["语雀笔记"]',
		"category: " + JSON.stringify(category),
		"draft: false",
		...(order
			? ["series: " + JSON.stringify(category), "seriesOrder: " + order]
			: []),
		...(seriesParent ? ["seriesParent: " + JSON.stringify(seriesParent)] : []),
		...(pinned ? ["pinned: true"] : []),
		"---",
		"",
		"",
	].join("\n");
}

function validManagedPath(relative) {
	return (
		typeof relative === "string" &&
		!relative.split(/[\\/]/).includes("..") &&
		(relative === "public/images/yuque-missing.svg" ||
			["src/content/posts/yuque/", "public/images/yuque/"].some((prefix) =>
				relative.startsWith(prefix),
			))
	);
}

export async function importYuque({
	sourceRoot,
	projectRoot,
	onProgress = () => {},
}) {
	sourceRoot = path.resolve(sourceRoot);
	projectRoot = path.resolve(projectRoot);
	assertNoLinks(sourceRoot, sourceRoot);
	assertNoLinks(projectRoot, projectRoot);
	assertNoLinks(
		projectRoot,
		path.join(projectRoot, "docs/yuque-image-hosting.json"),
	);
	const imageHosting = readImageHosting(projectRoot);
	const batch = JSON.parse(
		fs.readFileSync(sourcePath(sourceRoot, "批量转换报告.json"), "utf8"),
	);
	const books = [];
	const documents = [];
	const routes = new Map();
	const assetsByPath = new Map();
	const assetsByTarget = new Map();
	const usedSlugs = new Set();
	for (const book of batch.books) {
		if (!book.name || /[/\\]/.test(book.name) || book.name.startsWith("."))
			throw new Error("Unsafe book name");
		const dir = sourcePath(sourceRoot, book.name);
		const report = JSON.parse(
			fs.readFileSync(sourcePath(dir, "导出报告.json"), "utf8"),
		);
		if (report.documents.length !== report.expected_docs)
			throw new Error("Document count mismatch: " + book.name);
		const slug = bookSlug(book.name);
		if (!slug || usedSlugs.has(slug))
			throw new Error("Duplicate library slug: " + slug);
		usedSlugs.add(slug);
		const current = {
			name: book.name,
			slug,
			source: dir,
			count: report.documents.length,
			postIdsByRoute: new Map(),
		};
		books.push(current);
		const ids = new Set();
		for (const doc of report.documents) {
			if (!/^\d+$/.test(String(doc.id)) || ids.has(String(doc.id)))
				throw new Error("Invalid or duplicate document ID");
			ids.add(String(doc.id));
			const source = sourcePath(dir, doc.path);
			if (!source.endsWith(".md"))
				throw new Error("Non-Markdown source document");
			if (routes.has(key(source)))
				throw new Error("Multiple document IDs share one file");
			const contentId = `yuque/${slug}/${doc.id}`;
			const relative = `src/content/posts/${contentId}.md`;
			const route = `/posts/${contentId}/`;
			routes.set(key(source), route);
			current.postIdsByRoute.set(route, contentId);
			const metadataPath = path.join(dir, ".yuque-source", doc.id + ".json");
			assertNoLinks(sourceRoot, metadataPath);
			const metadata = fs.existsSync(metadataPath)
				? JSON.parse(fs.readFileSync(metadataPath, "utf8"))
				: {};
			documents.push({
				id: doc.id,
				book: book.name,
				source,
				relative,
				route,
				title: doc.title || metadata.title || path.basename(doc.path, ".md"),
				published: dateValue(
					metadata.first_published_at ||
						metadata.published_at ||
						metadata.created_at,
				),
				updated: dateValue(
					metadata.content_updated_at || metadata.updated_at,
					"",
				),
			});
		}
		const tocSource = sourcePath(dir, "00-知识库目录.md");
		routes.set(key(tocSource), `/posts/yuque/${slug}/overview/`);
		documents.push({
			book: book.name,
			source: tocSource,
			title: book.name + " · 知识库目录",
			published: "2026-11-10",
			relative: `src/content/posts/yuque/${slug}/overview.md`,
			route: `/posts/yuque/${slug}/overview/`,
			navigation: true,
		});
		const assetsDir = path.join(dir, "assets");
		assertNoLinks(sourceRoot, assetsDir);
		for (const file of walkAssets(assetsDir)) {
			const sha256 = fileHash(file);
			const extension = path.extname(file).toLowerCase();
			if (!/^\.[a-z0-9]+$/.test(extension))
				throw new Error("Unsafe asset extension: " + file);
			const relative = `public/images/yuque/${sha256}${extension}`;
			const asset = {
				source: file,
				relative,
				url: `/images/yuque/${sha256}${extension}`,
				sha256,
				bytes: fs.statSync(file).size,
			};
			const hosted = imageHosting?.entries[asset.url];
			if (hosted && (hosted.sha256 !== sha256 || hosted.bytes !== asset.bytes))
				throw new Error("Hosted image differs from source: " + asset.url);
			assetsByPath.set(key(file), hostedUrl(asset.url, imageHosting));
			if (!assetsByTarget.has(relative)) assetsByTarget.set(relative, asset);
		}
		onProgress("Planned library: " + book.name);
	}
	const unresolved = [];
	const unresolvedKeys = new Set();
	let rewrittenLinks = 0;
	const rewrittenDocuments = documents.map((doc) => {
		const original = fs.readFileSync(doc.source, "utf8");
		const result = rewriteMarkdown(original, (url, kind) => {
			if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
			const split = url.search(/[?#]/);
			const pathname = split < 0 ? url : url.slice(0, split);
			const suffix = split < 0 ? "" : url.slice(split);
			let decoded;
			try {
				decoded = decodeURIComponent(pathname);
			} catch {
				return url;
			}
			const target = path.resolve(
				path.dirname(doc.source),
				decoded.replaceAll("/", path.sep),
			);
			const next = routes.get(key(target)) || assetsByPath.get(key(target));
			if (next) return next + suffix;
			const warningKey = doc.source + "\n" + url;
			if (!unresolvedKeys.has(warningKey)) {
				unresolvedKeys.add(warningKey);
				unresolved.push({
					source: slash(path.relative(sourceRoot, doc.source)),
					url,
					kind,
					existsInSource: fs.existsSync(target),
				});
			}
			return kind === "image"
				? "/images/yuque-missing.svg#" + encodeURIComponent(url)
				: url;
		});
		rewrittenLinks += result.rewritten;
		return {
			...doc,
			source: slash(path.relative(sourceRoot, doc.source)),
			sourceSha256: hash(original),
			markdown: result.markdown,
		};
	});
	const overviews = new Map(
		rewrittenDocuments
			.filter((doc) => doc.navigation)
			.map((doc) => [doc.book, doc.markdown]),
	);
	const seriesPositions = new Map(
		books.map(({ name, postIdsByRoute }) => [
			name,
			readYuqueSeriesPositions(overviews.get(name), postIdsByRoute),
		]),
	);
	const posts = rewrittenDocuments.map(({ markdown, ...doc }) => {
		const position = seriesPositions.get(doc.book).get(doc.route);
		const content =
			header({
				...doc,
				...position,
				category: doc.book,
				description: doc.navigation
					? `「${doc.book}」的文档目录。`
					: `来自「${doc.book}」的学习笔记。`,
			}) + markdown;
		return {
			...doc,
			...position,
			content,
			sha256: hash(content),
		};
	});
	const count = posts.filter((p) => p.id !== undefined).length;
	const navigation =
		"# 知识库导航\n\n共 " +
		books.length +
		" 个知识库、" +
		count +
		" 篇源文档。\n\n" +
		books
			.map(
				(b) =>
					`- [${b.name}](/posts/yuque/${b.slug}/overview/)（${b.count} 篇）`,
			)
			.join("\n") +
		"\n";
	const overview =
		header({
			title: "知识库导航",
			published: "2026-11-10",
			category: "知识库导航",
			description: `${books.length} 个知识库、${count} 篇学习笔记的分类导航。`,
			pinned: true,
		}) + navigation;
	posts.push({
		relative: "src/content/posts/yuque/overview.md",
		route: "/posts/yuque/overview/",
		title: "知识库导航",
		navigation: true,
		content: overview,
		sha256: hash(overview),
	});
	const assets = [...assetsByTarget.values()];
	const placeholder =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" role="img" aria-label="原笔记图片缺失"><rect width="720" height="160" rx="16" fill="#f1f5f9"/><text x="360" y="76" text-anchor="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="24">原笔记图片缺失</text><text x="360" y="112" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="16">原始引用已保留在导入报告中</text></svg>\n';
	const support = [
		{
			relative: "public/images/yuque-missing.svg",
			content: placeholder,
			sha256: hash(placeholder),
		},
	];
	const manifestPath = path.join(
		projectRoot,
		"docs/yuque-import-manifest.json",
	);
	const reportPath = path.join(projectRoot, "docs/yuque-import-report.json");
	for (const file of [manifestPath, reportPath])
		assertNoLinks(projectRoot, file);
	const old = fs.existsSync(manifestPath)
		? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
		: { version: 1, files: {} };
	if (old.version !== 1 || typeof old.files !== "object" || !old.files)
		throw new Error("Invalid import manifest");
	for (const [relative, sha256] of Object.entries(old.files)) {
		if (!validManagedPath(relative) || !/^[a-f0-9]{64}$/.test(sha256))
			throw new Error("Unsafe manifest path");
	}
	for (const entry of [...posts, ...assets, ...support]) {
		if (!validManagedPath(entry.relative))
			throw new Error("Unsafe destination path");
		const target = path.join(projectRoot, entry.relative);
		assertNoLinks(projectRoot, target);
		if (fs.existsSync(target)) {
			if (!old.files[entry.relative])
				throw new Error("Unmanaged destination conflict: " + entry.relative);
			if (fileHash(target) !== old.files[entry.relative])
				throw new Error(
					"Locally edited destination conflict: " + entry.relative,
				);
		}
	}
	// All conflicts are checked before the first output is created. Images retain
	// their exact bytes and use content hashes so copies can be shared safely.
	for (const asset of assets) {
		if (imageHosting?.entries[asset.url]) continue;
		const target = path.join(projectRoot, asset.relative);
		if (!fs.existsSync(target)) {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(asset.source, target, fs.constants.COPYFILE_EXCL);
		}
	}
	for (const post of [...posts, ...support]) {
		const target = path.join(projectRoot, post.relative);
		if (!fs.existsSync(target) || old.files[post.relative] !== post.sha256) {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, post.content, {
				flag: fs.existsSync(target) ? "w" : "wx",
			});
		}
	}
	const report = {
		version: 1,
		importedAt: new Date().toISOString(),
		sourceRoot,
		libraryCount: books.length,
		sourceDocuments: count,
		books: books.map(({ name, slug, count }) => ({ name, slug, count })),
		posts: posts.map(({ content, ...p }) => p),
		assets: assets.map(({ source, ...a }) => a),
		supportFiles: support.map(({ content, ...entry }) => entry),
		rewrittenLinks,
		unresolved,
		assetBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
	};
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
	const files = { ...old.files };
	for (const entry of [...posts, ...assets, ...support])
		files[entry.relative] = entry.sha256;
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({ version: 1, files }, null, 2) + "\n",
	);
	return report;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const report = await importYuque({
		sourceRoot: process.argv[2] || "D:/Desktop/语雀知识库转换",
		projectRoot: path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
		),
		onProgress: console.log,
	});
	console.log(
		JSON.stringify(
			{
				libraries: report.libraryCount,
				documents: report.sourceDocuments,
				posts: report.posts.length,
				images: report.assets.length,
				rewrittenLinks: report.rewrittenLinks,
				originalUnresolvedReferences: report.unresolved.length,
				imageMiB: Math.round(report.assetBytes / 1048576),
			},
			null,
			2,
		),
	);
}
