import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const tsx = fileURLToPath(
	new URL("../dist/cli.mjs", import.meta.resolve("tsx")),
);
const script = fileURLToPath(new URL("./run-pagefind.ts", import.meta.url));
const binDir = fileURLToPath(new URL("../node_modules/.bin/", import.meta.url));

function fixture(t) {
	const root = mkdtempSync(path.join(os.tmpdir(), "firefly-pagefind-test-"));
	t.after(() => {
		assert.equal(path.dirname(root), os.tmpdir());
		assert.ok(path.basename(root).startsWith("firefly-pagefind-test-"));
		rmSync(root, { recursive: true, force: true });
	});
	const site = path.join(root, "dist");
	const index = path.join(site, "pagefind");
	mkdirSync(site);
	const writePage = (name, body, marked = false) =>
		writeFileSync(
			path.join(site, name),
			'<html lang="en"><body' +
				(marked ? " data-pagefind-body" : "") +
				">" +
				body +
				"</body></html>",
		);
	function build() {
		const result = spawnSync(process.execPath, [tsx, script], {
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
				FIREFLY_INCREMENTAL_BUILD: "1",
				FIREFLY_FULL_REBUILD: "0",
			},
		});
		assert.equal(result.status, 0, result.stderr);
		return result.stdout;
	}
	const readEntry = () =>
		readFileSync(path.join(index, "pagefind-entry.json"), "utf8");
	const reset = () => rmSync(index, { recursive: true });
	return { writePage, build, readEntry, reset };
}

test("restores a search index after unrelated changes and refreshes it after a body edit", (t) => {
	const { writePage, build, readEntry, reset } = fixture(t);
	writePage("article.html", "An article about alpine glaciers.", true);
	writePage("index.html", "Build 1");
	build();
	const original = readEntry();

	reset();
	writePage("index.html", "Build 2");
	assert.match(build(), /Reused Pagefind search index/);
	assert.equal(readEntry(), original);

	reset();
	writePage("article.html", "An article about coastal tidepools.", true);
	assert.doesNotMatch(build(), /Reused Pagefind search index/);
	assert.notEqual(readEntry(), original);
});

test("uses all pages when a script mentions the marker but no element has it", (t) => {
	const { writePage, build, readEntry, reset } = fixture(t);
	writePage(
		"index.html",
		'<script>const sample = "<div data-pagefind-body>";</script>Home',
	);
	writePage("article.html", "An article about alpine glaciers.");
	build();
	const original = readEntry();

	reset();
	writePage("article.html", "An article about coastal tidepools.");
	assert.doesNotMatch(build(), /Reused Pagefind search index/);
	assert.notEqual(readEntry(), original);
});

test("reuses the index when only the music widgets outside the search body get new IDs", (t) => {
	const { writePage, build, readEntry, reset } = fixture(t);
	const about = (id) =>
		writePage(
			"about.html",
			[
				"<main data-pagefind-body>About this blog</main>",
				'<widget-layout data-id="music-widget-' + id + '-layout">',
				'<div id="music-widget-' + id + '-layout" class="collapse-wrapper">',
				'<div id="music-widget-' +
					id +
					'" class="music-player-widget"></div></div></widget-layout>',
			].join(""),
		);
	about("1234567");
	build();
	const original = readEntry();
	reset();
	about("abcdefg");
	assert.match(build(), /Reused Pagefind search index/);
	assert.equal(readEntry(), original);
});
