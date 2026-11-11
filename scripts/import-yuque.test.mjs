import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { importYuque, rewriteMarkdown } from "./import-yuque.mjs";

test("missing original images use an explicit placeholder without breaking Astro imports", async (t) => {
	const f = fixture(t);
	fs.appendFileSync(
		path.join(f.sourceRoot, "Java/章节/重复标题.md"),
		"\n![原图](../lost.png)\n",
	);
	const report = await importYuque(f);
	const post = fs.readFileSync(
		path.join(f.projectRoot, "src/content/posts/yuque/java/101.md"),
		"utf8",
	);
	assert.ok(post.includes("/images/yuque-missing.svg#..%2Flost.png"));
	assert.ok(
		fs.existsSync(path.join(f.projectRoot, "public/images/yuque-missing.svg")),
	);
	assert.ok(
		report.unresolved.some(
			(x) => x.url === "../lost.png" && x.kind === "image",
		),
	);
});

test("re-import reuses verified hosted images and does not copy them back into public", async (t) => {
	const f = fixture(t);
	const initial = await importYuque(f);
	const asset = initial.assets[0];
	const remote =
		"https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev/PicGo/" +
		path.basename(asset.relative);
	fs.writeFileSync(
		path.join(f.projectRoot, "docs/yuque-image-hosting.json"),
		JSON.stringify({
			version: 1,
			origin: "https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev",
			entries: {
				[asset.url]: {
					url: remote,
					sha256: asset.sha256,
					bytes: asset.bytes,
					verifiedAt: new Date().toISOString(),
				},
			},
		}),
	);
	fs.unlinkSync(path.join(f.projectRoot, asset.relative));
	await importYuque(f);
	const post = fs.readFileSync(
		path.join(f.projectRoot, initial.posts[0].relative),
		"utf8",
	);
	assert.ok(post.includes("![图片](" + remote + ")"));
	assert.equal(fs.existsSync(path.join(f.projectRoot, asset.relative)), false);
	await importYuque(f);
	assert.equal(
		fs.readFileSync(
			path.join(f.projectRoot, initial.posts[0].relative),
			"utf8",
		),
		post,
	);
	fs.appendFileSync(
		path.join(f.projectRoot, initial.posts[0].relative),
		"\n我的修改\n",
	);
	await assert.rejects(importYuque(f), /Locally edited destination conflict/);
});

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ztyoper-yuque-test-"));
	t.after(() => {
		assert.equal(path.dirname(root), os.tmpdir());
		assert.ok(path.basename(root).startsWith("ztyoper-yuque-test-"));
		fs.rmSync(root, { recursive: true, force: true });
	});
	const sourceRoot = path.join(root, "source");
	const projectRoot = path.join(root, "blog");
	fs.mkdirSync(sourceRoot, { recursive: true });
	fs.mkdirSync(path.join(projectRoot, "src/content/posts"), {
		recursive: true,
	});
	const books = ["Java", "中文库"].map((name, i) => {
		const dir = path.join(sourceRoot, name);
		fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
		fs.mkdirSync(path.join(dir, ".yuque-source"), { recursive: true });
		const id = 101 + i;
		const docPath = "章节/重复标题.md";
		fs.mkdirSync(path.join(dir, "章节"));
		fs.writeFileSync(
			path.join(dir, "assets/photo.png"),
			"same immutable image",
		);
		fs.writeFileSync(
			path.join(dir, docPath),
			'# 重复标题\n\n![图片](../assets/photo.png)\n\n```java\nString p = "../assets/photo.png";\n```\n\n$$x^2 + y^2$$\n',
		);
		fs.writeFileSync(
			path.join(dir, "00-知识库目录.md"),
			"# " + name + "\n\n[重复标题](章节/重复标题.md)\n",
		);
		fs.writeFileSync(
			path.join(dir, ".yuque-source", id + ".json"),
			JSON.stringify({
				title: "重复标题",
				created_at: "2024-03-12T20:20:00.000Z",
				content_updated_at: "2025-04-13T02:00:00.000Z",
			}),
		);
		fs.writeFileSync(
			path.join(dir, "导出报告.json"),
			JSON.stringify({
				name,
				expected_docs: 1,
				documents: [{ id, path: docPath, title: "重复标题" }],
			}),
		);
		return { name, expected_docs: 1 };
	});
	fs.writeFileSync(
		path.join(sourceRoot, "批量转换报告.json"),
		JSON.stringify({ books }),
	);
	return { sourceRoot, projectRoot, root };
}

test("rewrites inline, reference, nested-image and HTML URLs without editing code or formulas", () => {
	const input =
		'[文章](chapter.md#part)\n![图](assets/a.png)\n[![图](assets/a.png)](chapter.md)\n[参考][doc]\n\n[doc]: chapter.md "说明"\n\n<img src="assets/a.png" alt="图片">\n\n`[文章](chapter.md)`\n\n```md\n![图](assets/a.png)\n```\n\n$$a_{[x](chapter.md)}$$\n';
	const result = rewriteMarkdown(input, (u) =>
		u.startsWith("chapter.md")
			? u.replace("chapter.md", "/posts/yuque/java/101/")
			: u === "assets/a.png"
				? "/images/yuque/hash.png"
				: u,
	);
	assert.ok(result.markdown.includes("[文章](/posts/yuque/java/101/#part)"));
	assert.ok(
		result.markdown.includes(
			"[![图](/images/yuque/hash.png)](/posts/yuque/java/101/)",
		),
	);
	assert.ok(result.markdown.includes('[doc]: /posts/yuque/java/101/ "说明"'));
	assert.ok(result.markdown.includes('src="/images/yuque/hash.png"'));
	assert.ok(result.markdown.includes("`[文章](chapter.md)`"));
	assert.ok(result.markdown.includes("```md\n![图](assets/a.png)\n```"));
	assert.ok(result.markdown.includes("$$a_{[x](chapter.md)}$$"));
});

test("preserves encoded destinations, spaces in angle links, and external URLs", () => {
	const input =
		'[中文](%E7%AB%A0%E8%8A%82.md)\n![图](<assets/a b.png> "说明")\n[外链](https://example.com/a.md)\n';
	const result = rewriteMarkdown(input, (u) =>
		u === "%E7%AB%A0%E8%8A%82.md"
			? "/posts/yuque/1/"
			: u === "assets/a b.png"
				? "/images/yuque/a.png"
				: u,
	);
	assert.equal(
		result.markdown,
		'[中文](/posts/yuque/1/)\n![图](</images/yuque/a.png> "说明")\n[外链](https://example.com/a.md)\n',
	);
});

test("link titles containing destination-like text are preserved", () => {
	const input =
		'[x](chapter.md "title ](text")\n![nested [label]](assets/a.png "title ](example")';
	const result = rewriteMarkdown(input, (u) =>
		u === "chapter.md"
			? "/posts/changed/"
			: u === "assets/a.png"
				? "/images/a.png"
				: u,
	);
	assert.equal(
		result.markdown,
		'[x](/posts/changed/ "title ](text")\n![nested [label]](/images/a.png "title ](example")',
	);
});

test("imports every reported ID, dates, library navigation and deduplicated images", async (t) => {
	const f = fixture(t);
	fs.writeFileSync(
		path.join(f.sourceRoot, "Java/old-output.md"),
		"stale duplicate",
	);
	const report = await importYuque(f);
	assert.equal(report.sourceDocuments, 2);
	assert.equal(report.libraryCount, 2);
	assert.equal(report.posts.length, 5);
	assert.equal(report.assets.length, 1);
	const post = fs.readFileSync(
		path.join(f.projectRoot, "src/content/posts/yuque/java/101.md"),
		"utf8",
	);
	assert.match(post, /published: 2024-03-13/);
	assert.match(post, /updated: 2025-04-13/);
	assert.match(post, /category: "Java"/);
	assert.match(post, /!\[图片\]\(\/images\/yuque\/[^)]+\)/);
	assert.ok(post.includes('String p = "../assets/photo.png";'));
	assert.ok(post.includes("$$x^2 + y^2$$"));
	const overview = fs.readFileSync(
		path.join(f.projectRoot, "src/content/posts/yuque/java/overview.md"),
		"utf8",
	);
	assert.ok(overview.includes("/posts/yuque/java/101/"));
	assert.ok(!JSON.stringify(report.posts).includes("old-output"));
	assert.ok(!fs.existsSync(path.join(f.projectRoot, ".yuque-source")));
});

test("imports sibling order and parent references from the knowledge-base outline", async (t) => {
	const f = fixture(t);
	const book = path.join(f.sourceRoot, "Java");
	const reportFile = path.join(book, "导出报告.json");
	const source = JSON.parse(fs.readFileSync(reportFile, "utf8"));
	source.expected_docs = 5;
	for (const [id, name] of [
		[102, "第一章"],
		[103, "第一节"],
		[104, "第二节"],
		[105, "目录外的文章"],
	]) {
		const file = `${name}.md`;
		fs.writeFileSync(path.join(book, file), `# ${name}\n`);
		source.documents.unshift({ id, path: file, title: name });
	}
	fs.writeFileSync(reportFile, JSON.stringify(source));
	fs.writeFileSync(
		path.join(book, "00-知识库目录.md"),
		[
			"# Java",
			"",
			"- [第一章](第一章.md)",
			"  - [第一节](第一节.md)",
			"  - [第二节](第二节.md)",
			"- [重复标题](章节/重复标题.md)",
			"",
		].join("\n"),
	);
	await importYuque(f);
	const post = (id) =>
		fs.readFileSync(
			path.join(f.projectRoot, `src/content/posts/yuque/java/${id}.md`),
			"utf8",
		);
	assert.match(post(102), /^seriesOrder: 1$/m);
	assert.doesNotMatch(post(102), /^seriesParent:/m);
	assert.match(post(103), /^seriesOrder: 1$/m);
	assert.match(post(103), /^seriesParent: "yuque\/java\/102"$/m);
	assert.match(post(104), /^seriesOrder: 2$/m);
	assert.match(post(104), /^seriesParent: "yuque\/java\/102"$/m);
	assert.match(post(101), /^seriesOrder: 2$/m);
	assert.match(post(105), /^seriesOrder: 3$/m);
});

test("idempotent reruns preserve local article edits and fail before copying other outputs", async (t) => {
	const f = fixture(t);
	await importYuque(f);
	await importYuque(f);
	const target = path.join(
		f.projectRoot,
		"src/content/posts/yuque/java/101.md",
	);
	fs.appendFileSync(target, "\nMy local edits\n");
	await assert.rejects(importYuque(f), /conflict|locally edited/i);
	assert.ok(fs.readFileSync(target, "utf8").endsWith("My local edits\n"));
});

test("unmanaged existing files are never overwritten", async (t) => {
	const f = fixture(t);
	const target = path.join(
		f.projectRoot,
		"src/content/posts/yuque/java/101.md",
	);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, "existing user article");
	await assert.rejects(importYuque(f), /conflict|unmanaged/i);
	assert.equal(fs.readFileSync(target, "utf8"), "existing user article");
	assert.ok(!fs.existsSync(path.join(f.projectRoot, "public/images/yuque")));
});

test("missing managed articles are restored on an explicit reimport", async (t) => {
	const f = fixture(t);
	await importYuque(f);
	const target = path.join(
		f.projectRoot,
		"src/content/posts/yuque/java/101.md",
	);
	fs.unlinkSync(target);
	await importYuque(f);
	assert.ok(fs.existsSync(target));
});

test("dot-prefixed article titles are allowed without importing hidden source metadata", async (t) => {
	const f = fixture(t);
	const reportPath = path.join(f.sourceRoot, "Java/导出报告.json");
	const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
	const targetSource = "章节/.vscode文件.md";
	fs.renameSync(
		path.join(f.sourceRoot, "Java", report.documents[0].path),
		path.join(f.sourceRoot, "Java", targetSource),
	);
	report.documents[0].path = targetSource;
	fs.writeFileSync(reportPath, JSON.stringify(report));
	const result = await importYuque(f);
	assert.equal(result.sourceDocuments, 2);
	assert.ok(
		fs.existsSync(
			path.join(f.projectRoot, "src/content/posts/yuque/java/101.md"),
		),
	);
});

test("source report traversal and destination junctions are rejected", async (t) => {
	const f = fixture(t);
	const reportPath = path.join(f.sourceRoot, "Java/导出报告.json");
	const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
	report.documents[0].path = "../../outside.md";
	fs.writeFileSync(reportPath, JSON.stringify(report));
	await assert.rejects(importYuque(f), /outside|traversal|unsafe/i);
	assert.ok(!fs.existsSync(path.join(f.projectRoot, "public/images/yuque")));
	report.documents[0].path = "章节/重复标题.md";
	fs.writeFileSync(reportPath, JSON.stringify(report));
	const outside = path.join(f.root, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(
		outside,
		path.join(f.projectRoot, "src/content/posts/yuque"),
		"junction",
	);
	await assert.rejects(importYuque(f), /link|junction/i);
	assert.deepEqual(fs.readdirSync(outside), []);
});
