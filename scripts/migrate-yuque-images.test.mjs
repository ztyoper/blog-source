import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hostedUrl, validateHosting } from "./yuque-image-hosting.mjs";
import {
	applyImages,
	archiveImages,
	rewriteHostedMarkdown,
	switchImageDomain,
	verifyRemote,
} from "./migrate-yuque-images.mjs";

const bytes = Buffer.from("test image bytes");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const local = `/images/yuque/${sha256}.png`;
const origin = "https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev";
const remote = `${origin}/PicGo/${sha256}.png`;
function mapping() {
	return {
		version: 1,
		origin,
		entries: {
			[local]: {
				url: remote,
				sha256,
				bytes: bytes.length,
				verifiedAt: new Date().toISOString(),
			},
		},
	};
}

test("switching image domains preserves notes, updates managed hashes and requires a working domain", async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "r2-migration-test-"));
	t.after(() => {
		assert.equal(path.dirname(root), os.tmpdir());
		assert.ok(path.basename(root).startsWith("r2-migration-test-"));
		fs.rmSync(root, { recursive: true, force: true });
	});
	execFileSync("git", ["init", "--quiet"], { cwd: root });
	const file = "src/content/posts/example.md";
	const manifest = "docs/yuque-import-manifest.json";
	const hosting = "docs/yuque-image-hosting.json";
	const source = `![说明](${remote}?v=1#part)\n[外站](${origin}.example/a.png)\n`;
	const newOrigin = "https://img.example.com";
	const digest = (value) =>
		crypto.createHash("sha256").update(value).digest("hex");
	fs.mkdirSync(path.join(root, "src/content/posts"), { recursive: true });
	fs.mkdirSync(path.join(root, "docs"));
	fs.writeFileSync(path.join(root, file), source);
	fs.writeFileSync(path.join(root, hosting), JSON.stringify(mapping()));
	fs.writeFileSync(
		path.join(root, manifest),
		JSON.stringify({ files: { [file]: digest(source) } }),
	);
	await assert.rejects(
		switchImageDomain(root, newOrigin, async () => new Response("wrong")),
		/mismatch/,
	);
	assert.equal(fs.readFileSync(path.join(root, file), "utf8"), source);
	const result = await switchImageDomain(root, newOrigin, async (url) => {
		assert.equal(url, remote.replace(origin, newOrigin));
		return new Response(bytes);
	});
	const expected = source.replace(remote, remote.replace(origin, newOrigin));
	assert.equal(fs.readFileSync(path.join(root, file), "utf8"), expected);
	assert.equal(
		fs.readFileSync(path.join(root, result.backup, file), "utf8"),
		source,
	);
	assert.equal(
		JSON.parse(fs.readFileSync(path.join(root, manifest))).files[file],
		digest(expected),
	);
	assert.equal(
		validateHosting(
			JSON.parse(fs.readFileSync(path.join(root, hosting))),
			newOrigin,
		).origin,
		newOrigin,
	);
});

test("only verified content-addressed images at the chosen origin are accepted", () => {
	assert.ok(validateHosting(mapping()));
	for (const mutate of [
		(m) => {
			m.entries[local].url = remote.replace(origin, "https://wrong.invalid");
		},
		(m) => {
			m.entries[local].sha256 = "0".repeat(64);
		},
		(m) => {
			m.entries[local].verifiedAt = "";
		},
		(m) => {
			m.entries["/images/yuque/../outside.png"] = m.entries[local];
		},
	]) {
		const m = mapping();
		mutate(m);
		assert.throws(() => validateHosting(m));
	}
});

test("replacement preserves suffixes and leaves missing images/external links alone", () => {
	assert.equal(
		hostedUrl(local + "?raw=1#part", mapping()),
		remote + "?raw=1#part",
	);
	for (const url of [
		"/images/yuque-missing.svg#lost",
		"https://example.com/a.png",
		"/posts/abc/",
		"constructor",
		"toString",
	])
		assert.equal(hostedUrl(url, mapping()), url);
});

test("rewrites rendered images, linked images, HTML and cover without altering examples or math", () => {
	const md = `---\ntitle: Sample\nimage: "${local}"\n---\n\n![图](${local}#x)\n[原图](${local})\n<img src="${local}">\n\n\`${local}\`\n\n\`\`\`md\n![示例](${local})\n\`\`\`\n\n$$a_{[x](${local})}$$\n`;
	const result = rewriteHostedMarkdown(md, mapping());
	assert.equal(result.rewritten, 4);
	assert.ok(result.markdown.includes(`image: "${remote}"`));
	assert.ok(result.markdown.includes(`![图](${remote}#x)`));
	assert.ok(result.markdown.includes(`![示例](${local})`));
	assert.ok(result.markdown.includes(`$$a_{[x](${local})}$$`));
	assert.equal(rewriteHostedMarkdown(result.markdown, mapping()).rewritten, 0);
});

test("remote verification rejects incorrect bytes and HTTP failures", async () => {
	const asset = { sha256, bytes: bytes.length };
	await verifyRemote(remote, asset, async () => new Response(bytes));
	await assert.rejects(
		verifyRemote(remote, asset, async () => new Response("wrong")),
		/mismatch/,
	);
	await assert.rejects(
		verifyRemote(
			remote,
			asset,
			async () => new Response(null, { status: 404 }),
		),
		/HTTP 404/,
	);
});

test("apply requires complete verified mappings and preserves local edits and importer protection", (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "r2-migration-test-"));
	t.after(() => {
		assert.equal(path.dirname(root), os.tmpdir());
		assert.ok(path.basename(root).startsWith("r2-migration-test-"));
		fs.rmSync(root, { recursive: true, force: true });
	});
	const relative = "src/content/posts/yuque/book/1.md";
	fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
	fs.mkdirSync(path.join(root, "docs"));
	const original = `我的修改\n\n![图](${local})\n`;
	fs.writeFileSync(path.join(root, relative), original);
	fs.writeFileSync(
		path.join(root, "docs/yuque-import-report.json"),
		JSON.stringify({
			assets: [
				{ url: local, relative: "public" + local, bytes: bytes.length, sha256 },
			],
		}),
	);
	const oldHash = "0".repeat(64);
	fs.writeFileSync(
		path.join(root, "docs/yuque-import-manifest.json"),
		JSON.stringify({ version: 1, files: { [relative]: oldHash } }),
	);
	assert.throws(() => applyImages(root), /Not all source images/);
	assert.equal(fs.readFileSync(path.join(root, relative), "utf8"), original);
	fs.writeFileSync(
		path.join(root, "docs/yuque-image-hosting.json"),
		JSON.stringify(mapping()),
	);
	// Simulate an interrupted prior apply: an unedited post was rewritten,
	// but its importer manifest update had not yet been committed.
	const cleanRelative = "src/content/posts/yuque/book/2.md";
	const cleanBefore = `![图](${local})\n`;
	const cleanAfter = cleanBefore.replace(local, remote);
	const cleanHash = (value) =>
		crypto.createHash("sha256").update(value).digest("hex");
	fs.writeFileSync(path.join(root, cleanRelative), cleanAfter);
	const manifestPath = path.join(root, "docs/yuque-import-manifest.json");
	const stale = JSON.parse(fs.readFileSync(manifestPath));
	stale.files[cleanRelative] = cleanHash(cleanBefore);
	fs.writeFileSync(manifestPath, JSON.stringify(stale));
	fs.mkdirSync(path.join(root, ".tools/r2-migration"), { recursive: true });
	fs.writeFileSync(
		path.join(root, ".tools/r2-migration/apply-recovery.json"),
		JSON.stringify({
			version: 1,
			posts: [
				{
					relative: cleanRelative,
					before: cleanHash(cleanBefore),
					after: cleanHash(cleanAfter),
					managedBefore: true,
				},
			],
		}),
	);
	fs.mkdirSync(path.join(root, "public/images/yuque"), { recursive: true });
	fs.writeFileSync(path.join(root, "public" + local), bytes);
	assert.throws(() => archiveImages(root), /Local image reference remains/);
	const result = applyImages(root);
	assert.equal(result.changedPosts, 1);
	assert.equal(
		fs.readFileSync(path.join(root, relative), "utf8"),
		original.replace(local, remote),
	);
	assert.equal(
		fs.readFileSync(path.join(root, result.backup, relative), "utf8"),
		original,
	);
	assert.equal(
		JSON.parse(
			fs.readFileSync(path.join(root, "docs/yuque-import-manifest.json")),
		).files[relative],
		oldHash,
	);
	assert.equal(
		JSON.parse(fs.readFileSync(manifestPath)).files[cleanRelative],
		cleanHash(cleanAfter),
	);
	fs.writeFileSync(path.join(root, "public/images/yuque/new.png"), "user file");
	assert.throws(() => archiveImages(root), /unexpected or missing files/);
	fs.unlinkSync(path.join(root, "public/images/yuque/new.png"));
	const archived = archiveImages(root);
	assert.equal(fs.existsSync(path.join(root, "public" + local)), false);
	assert.deepEqual(
		fs.readFileSync(path.join(archived, path.basename(local))),
		bytes,
	);
	assert.equal(archiveImages(root), archived);
});
