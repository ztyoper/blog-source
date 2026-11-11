import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { watchSharedContent } from "./theme-watch.mjs";

test("shared-content watching batches edits, ignores unrelated files and stops cleanly", async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-theme-watch-"));
	for (const relative of [
		"src/content/posts",
		"src/content/spec",
		"public/images",
	])
		fs.mkdirSync(path.join(root, relative), { recursive: true });
	const calls = [];
	const close = watchSharedContent({
		sourceRoot: root,
		delayMs: 30,
		onChange: () => calls.push(Date.now()),
	});
	t.after(() => {
		close();
		assert.equal(path.dirname(root), os.tmpdir());
		assert.ok(path.basename(root).startsWith("blog-theme-watch-"));
		fs.rmSync(root, { recursive: true, force: true });
	});
	fs.writeFileSync(path.join(root, "public/unrelated.txt"), "ignore");
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(calls.length, 0);
	fs.writeFileSync(path.join(root, "src/content/posts/a.md"), "one");
	fs.writeFileSync(path.join(root, "public/images/a.png"), "two");
	const deadline = Date.now() + 5000;
	while (calls.length === 0 && Date.now() < deadline)
		await new Promise((resolve) => setTimeout(resolve, 10));
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(calls.length, 1);
	close();
	fs.writeFileSync(path.join(root, "src/content/posts/a.md"), "after close");
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(calls.length, 1);
});
