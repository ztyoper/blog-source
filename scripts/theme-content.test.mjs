import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { syncThemeContent } from "./theme-content.mjs";

function fixture(t) {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "blog-theme-sync-"));
	const sourceRoot = path.join(scratch, "博客");
	const targetRoot = path.join(sourceRoot, "themes", "fuwari");
	fs.mkdirSync(targetRoot, { recursive: true });
	t.after(() => {
		const absolute = path.resolve(scratch);
		assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep));
		assert.ok(path.basename(absolute).startsWith("blog-theme-sync-"));
		fs.rmSync(absolute, { recursive: true, force: true });
	});
	return { sourceRoot, targetRoot };
}

function write(root, relative, value) {
	const file = path.join(root, relative);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, value);
}

test("large image collections are copied without retaining all image buffers", (t) => {
	const roots = fixture(t);
	const buffer = Buffer.alloc(2 * 1024 * 1024, 42);
	for (let i = 0; i < 12; i++)
		write(roots.sourceRoot, `public/images/large-${i}.png`, buffer);
	const script = `import { syncThemeContent } from ${JSON.stringify(new URL("./theme-content.mjs", import.meta.url).href)};
		const before = process.memoryUsage().arrayBuffers;
		syncThemeContent(JSON.parse(process.argv[1]));
		console.log(process.memoryUsage().arrayBuffers - before);`;
	const usage = Number(
		execFileSync(
			process.execPath,
			["--input-type=module", "-e", script, JSON.stringify(roots)],
			{ encoding: "utf8" },
		).trim(),
	);
	assert.ok(usage < 8 * 1024 * 1024, `Image buffers retained ${usage} bytes`);
	assert.deepEqual(
		fs.readFileSync(path.join(roots.targetRoot, "public/images/large-0.png")),
		buffer,
	);
});

test("new and changed Markdown, about text and images reach the alternate theme", (t) => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/笔记/index.md", "第一版正文");
	write(roots.sourceRoot, "src/content/posts/笔记/cover.png", "image bytes");
	write(roots.sourceRoot, "src/content/spec/about.md", "关于我");
	write(roots.sourceRoot, "public/images/photo.png", "uploaded image");
	syncThemeContent(roots);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "src/content/posts/笔记/index.md"),
			"utf8",
		),
		"第一版正文",
	);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "src/content/spec/about.md"),
			"utf8",
		),
		"关于我",
	);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "public/images/photo.png"),
			"utf8",
		),
		"uploaded image",
	);
	write(roots.sourceRoot, "src/content/posts/笔记/index.md", "修改后的正文");
	syncThemeContent(roots);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "src/content/posts/笔记/index.md"),
			"utf8",
		),
		"修改后的正文",
	);
});

test("deleted managed content disappears while unrelated files survive", (t) => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/delete-me.md", "old article");
	write(roots.sourceRoot, "public/images/delete-me.png", "old image");
	syncThemeContent(roots);
	write(
		roots.targetRoot,
		"src/content/posts/local-only.md",
		"keep this local file",
	);
	fs.unlinkSync(path.join(roots.sourceRoot, "src/content/posts/delete-me.md"));
	fs.unlinkSync(path.join(roots.sourceRoot, "public/images/delete-me.png"));
	syncThemeContent(roots);
	assert.equal(
		fs.existsSync(
			path.join(roots.targetRoot, "src/content/posts/delete-me.md"),
		),
		false,
	);
	assert.equal(
		fs.existsSync(path.join(roots.targetRoot, "public/images/delete-me.png")),
		false,
	);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "src/content/posts/local-only.md"),
			"utf8",
		),
		"keep this local file",
	);
});

test("a locally edited destination is preserved instead of overwritten or deleted", (t) => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/note.md", "original");
	syncThemeContent(roots);
	write(
		roots.targetRoot,
		"src/content/posts/note.md",
		"edited in the wrong folder",
	);
	fs.unlinkSync(path.join(roots.sourceRoot, "src/content/posts/note.md"));
	assert.throws(() => syncThemeContent(roots), /modified|conflict/i);
	assert.equal(
		fs.readFileSync(
			path.join(roots.targetRoot, "src/content/posts/note.md"),
			"utf8",
		),
		"edited in the wrong folder",
	);
});

test("same-size edits with restored mtime still invalidate cached hashes", (t) => {
	const roots = fixture(t);
	const relative = "public/images/same-size.png";
	write(roots.sourceRoot, relative, "original");
	syncThemeContent(roots);
	syncThemeContent(roots);
	const target = path.join(roots.targetRoot, relative);
	const before = fs.statSync(target);
	write(roots.targetRoot, relative, "modified");
	fs.utimesSync(target, before.atime, before.mtime);
	assert.throws(() => syncThemeContent(roots), /modified|conflict/i);
	assert.equal(fs.readFileSync(target, "utf8"), "modified");
});

test("source saves during copying do not become false destination conflicts", (t) => {
	const roots = fixture(t);
	const relative = "src/content/posts/note.md";
	write(roots.sourceRoot, relative, "version A");
	syncThemeContent(roots);
	write(roots.sourceRoot, relative, "version B");
	const copy = fs.copyFileSync;
	try {
		fs.copyFileSync = (source, destination, ...args) => {
			if (source === path.join(roots.sourceRoot, relative))
				fs.writeFileSync(source, "version C");
			return copy(source, destination, ...args);
		};
		syncThemeContent(roots);
	} finally {
		fs.copyFileSync = copy;
	}
	write(roots.sourceRoot, relative, "version D");
	assert.doesNotThrow(() => syncThemeContent(roots));
	assert.equal(
		fs.readFileSync(path.join(roots.targetRoot, relative), "utf8"),
		"version D",
	);
});

test("manifest paths cannot remove files outside the managed content", (t) => {
	const roots = fixture(t);
	write(roots.sourceRoot, "outside.txt", "keep private file");
	write(
		roots.targetRoot,
		".theme-content-manifest.json",
		JSON.stringify({
			version: 1,
			files: { "../../outside.txt": "0".repeat(64) },
		}),
	);
	assert.throws(() => syncThemeContent(roots), /path|managed|outside/i);
	assert.equal(
		fs.readFileSync(path.join(roots.sourceRoot, "outside.txt"), "utf8"),
		"keep private file",
	);
});

test("sync refuses an unrelated target directory", (t) => {
	const roots = fixture(t);
	assert.throws(
		() => syncThemeContent({ ...roots, targetRoot: roots.sourceRoot }),
		/target|path/i,
	);
});

test("dangling destination junctions are rejected before writing content", (t) => {
	const roots = fixture(t);
	write(
		roots.sourceRoot,
		"src/content/posts/nested/note.md",
		"article content",
	);
	const destination = path.join(roots.targetRoot, "src/content/posts/nested");
	const escapedDirectory = path.join(roots.sourceRoot, "escaped-directory");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.mkdirSync(escapedDirectory);
	fs.symlinkSync(escapedDirectory, destination, "junction");
	fs.rmdirSync(escapedDirectory);
	assert.equal(fs.existsSync(destination), false);
	assert.throws(
		() => syncThemeContent(roots),
		/Symbolic links are not supported/,
	);
	assert.equal(fs.existsSync(escapedDirectory), false);
});
