import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	markdownCacheStamp,
	prepareMarkdownCache,
} from "./prepare-markdown-cache.mjs";

test("reuses compiled Markdown for body-only edits and clears it for shared inputs", async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-markdown-"));
	t.after(async () => {
		// Delete the individual fixture files and then their empty directories.
		for (const file of [
			"src/content/posts/target.md",
			"src/content/posts/cover.png",
			"src/constants/github-card-data.json",
			markdownCacheStamp,
			"node_modules/.astro/data-store.json",
		]) {
			await fs.rm(path.join(root, file), { force: true });
		}
		for (const dir of [
			"src/content/posts",
			"src/content",
			"src/constants",
			"src",
			"node_modules/.astro",
			"node_modules",
			".",
		]) {
			await fs.rmdir(path.join(root, dir));
		}
	});
	const post = path.join(root, "src/content/posts/target.md");
	const cover = path.join(root, "src/content/posts/cover.png");
	const cardData = path.join(root, "src/constants/github-card-data.json");
	const store = path.join(root, "node_modules/.astro/data-store.json");
	const stamp = path.join(root, markdownCacheStamp);
	for (const file of [post, cardData, store]) {
		await fs.mkdir(path.dirname(file), { recursive: true });
	}
	await fs.writeFile(post, "---\ntitle: Original\nimage: ./cover.png\n---\nBody\n");
	await fs.writeFile(cardData, "{}\n");
	await fs.writeFile(store, "old store");
	const initial = await prepareMarkdownCache(root);
	await assert.rejects(fs.access(store), { code: "ENOENT" });
	await fs.writeFile(stamp, initial);
	await fs.writeFile(store, "compiled");
	await fs.writeFile(post, "---\ntitle: Original\nimage: ./cover.png\n---\nNew body\n");
	assert.equal(await prepareMarkdownCache(root), initial);
	assert.equal(await fs.readFile(store, "utf8"), "compiled");

	await fs.writeFile(post, "---\ntitle: Renamed\nimage: ./cover.png\n---\nNew body\n");
	const renamed = await prepareMarkdownCache(root);
	assert.notEqual(renamed, initial);
	await assert.rejects(fs.access(store), { code: "ENOENT" });

	await fs.writeFile(stamp, renamed);
	await fs.writeFile(store, "compiled");
	await fs.writeFile(cardData, '{"new":"metadata"}\n');
	const changedCard = await prepareMarkdownCache(root);
	assert.notEqual(changedCard, renamed);
	await assert.rejects(fs.access(store), { code: "ENOENT" });

	await fs.writeFile(stamp, changedCard);
	await fs.writeFile(store, "compiled");
	await fs.writeFile(cover, "local image");
	const addedCover = await prepareMarkdownCache(root);
	assert.notEqual(addedCover, changedCard);
	await assert.rejects(fs.access(store), { code: "ENOENT" });
	await assert.rejects(fs.access(stamp), { code: "ENOENT" });

	// A failed build can write a store before its wrapper records a stamp.
	await fs.writeFile(store, "database from failed build");
	await fs.rm(cover);
	assert.equal(await prepareMarkdownCache(root), changedCard);
	await assert.rejects(fs.access(store), { code: "ENOENT" });
});
