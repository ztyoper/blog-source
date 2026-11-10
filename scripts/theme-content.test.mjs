import assert from "node:assert/strict";
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

test("new and changed Markdown, about text and images reach the alternate theme", t => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/笔记/index.md", "第一版正文");
	write(roots.sourceRoot, "src/content/posts/笔记/cover.png", "image bytes");
	write(roots.sourceRoot, "src/content/spec/about.md", "关于我");
	write(roots.sourceRoot, "public/images/photo.png", "uploaded image");
	syncThemeContent(roots);
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "src/content/posts/笔记/index.md"), "utf8"), "第一版正文");
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "src/content/spec/about.md"), "utf8"), "关于我");
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "public/images/photo.png"), "utf8"), "uploaded image");
	write(roots.sourceRoot, "src/content/posts/笔记/index.md", "修改后的正文");
	syncThemeContent(roots);
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "src/content/posts/笔记/index.md"), "utf8"), "修改后的正文");
});

test("deleted managed content disappears while unrelated files survive", t => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/delete-me.md", "old article");
	write(roots.sourceRoot, "public/images/delete-me.png", "old image");
	syncThemeContent(roots);
	write(roots.targetRoot, "src/content/posts/local-only.md", "keep this local file");
	fs.unlinkSync(path.join(roots.sourceRoot, "src/content/posts/delete-me.md"));
	fs.unlinkSync(path.join(roots.sourceRoot, "public/images/delete-me.png"));
	syncThemeContent(roots);
	assert.equal(fs.existsSync(path.join(roots.targetRoot, "src/content/posts/delete-me.md")), false);
	assert.equal(fs.existsSync(path.join(roots.targetRoot, "public/images/delete-me.png")), false);
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "src/content/posts/local-only.md"), "utf8"), "keep this local file");
});

test("a locally edited destination is preserved instead of overwritten or deleted", t => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/note.md", "original");
	syncThemeContent(roots);
	write(roots.targetRoot, "src/content/posts/note.md", "edited in the wrong folder");
	fs.unlinkSync(path.join(roots.sourceRoot, "src/content/posts/note.md"));
	assert.throws(() => syncThemeContent(roots), /modified|conflict/i);
	assert.equal(fs.readFileSync(path.join(roots.targetRoot, "src/content/posts/note.md"), "utf8"), "edited in the wrong folder");
});

test("manifest paths cannot remove files outside the managed content", t => {
	const roots = fixture(t);
	write(roots.sourceRoot, "outside.txt", "keep private file");
	write(roots.targetRoot, ".theme-content-manifest.json", JSON.stringify({
		version: 1,
		files: { "../../outside.txt": "0".repeat(64) },
	}));
	assert.throws(() => syncThemeContent(roots), /path|managed|outside/i);
	assert.equal(fs.readFileSync(path.join(roots.sourceRoot, "outside.txt"), "utf8"), "keep private file");
});

test("sync refuses an unrelated target directory", t => {
	const roots = fixture(t);
	assert.throws(() => syncThemeContent({ ...roots, targetRoot: roots.sourceRoot }), /target|path/i);
});

test("dangling destination junctions are rejected before writing content", t => {
	const roots = fixture(t);
	write(roots.sourceRoot, "src/content/posts/nested/note.md", "article content");
	const destination = path.join(roots.targetRoot, "src/content/posts/nested");
	const escapedDirectory = path.join(roots.sourceRoot, "escaped-directory");
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.mkdirSync(escapedDirectory);
	fs.symlinkSync(escapedDirectory, destination, "junction");
	fs.rmdirSync(escapedDirectory);
	assert.equal(fs.existsSync(destination), false);
	assert.throws(() => syncThemeContent(roots), /Symbolic links are not supported/);
	assert.equal(fs.existsSync(escapedDirectory), false);
});
