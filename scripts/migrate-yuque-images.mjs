import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { rewriteMarkdown } from "./import-yuque.mjs";
import {
	HOSTING_FILE,
	R2_ORIGIN,
	hostedUrl,
	readImageHosting,
	validateHosting,
} from "./yuque-image-hosting.mjs";

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function atomicWrite(file, content) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temporary = file + ".tmp-" + crypto.randomUUID();
	fs.writeFileSync(temporary, content, { flag: "wx" });
	fs.renameSync(temporary, file);
}

function atomicJson(file, data) {
	atomicWrite(file, JSON.stringify(data, null, 2) + "\n");
}

function safeFile(projectRoot, relative) {
	const target = path.resolve(projectRoot, relative);
	const rel = path.relative(projectRoot, target);
	if (
		!rel ||
		rel === ".." ||
		rel.startsWith(".." + path.sep) ||
		path.isAbsolute(rel)
	)
		throw new Error("Unsafe migration path");
	let current = projectRoot;
	for (const part of ["", ...rel.split(path.sep)]) {
		if (part) current = path.join(current, part);
		if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
			throw new Error("Linked migration path");
	}
	return target;
}

export function rewriteHostedMarkdown(markdown, hosting) {
	const front =
		markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] || "";
	let covers = 0;
	const header = front.replace(
		/^(image:\s*)(["']?)(\/images\/yuque\/[a-f0-9]{64}\.[a-z0-9]+(?:[?#][^\s"']*)?)\2([ \t]*\r?)$/gm,
		(all, prefix, quote, url, tail) => {
			const next = hostedUrl(url, hosting);
			if (next === url) return all;
			covers++;
			return prefix + quote + next + quote + tail;
		},
	);
	const result = rewriteMarkdown(markdown.slice(front.length), (url) =>
		hostedUrl(url, hosting),
	);
	return {
		markdown: header + result.markdown,
		rewritten: covers + result.rewritten,
	};
}

export async function verifyRemote(url, asset, fetcher = fetch) {
	const response = await fetcher(url, {
		redirect: "error",
		signal: AbortSignal.timeout(120000),
	});
	if (!response.ok) throw new Error("Remote HTTP " + response.status);
	const digest = crypto.createHash("sha256");
	let bytes = 0;
	for await (const chunk of response.body) {
		bytes += chunk.length;
		digest.update(chunk);
		if (bytes > asset.bytes) throw new Error("Remote image size mismatch");
	}
	if (bytes !== asset.bytes || digest.digest("hex") !== asset.sha256)
		throw new Error("Remote image hash mismatch");
}

async function retry(action, label) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await action();
		} catch (error) {
			if (attempt >= 4) throw new Error(label + ": " + error.message);
			console.log(`${label}: retry ${attempt + 1}/4 (${error.message})`);
			await delay(1500 * 2 ** attempt);
		}
	}
}

function assetsFor(projectRoot) {
	const report = JSON.parse(
		fs.readFileSync(
			path.join(projectRoot, "docs/yuque-import-report.json"),
			"utf8",
		),
	);
	for (const asset of report.assets) {
		if (
			asset.relative !== "public" + asset.url ||
			!/^\/images\/yuque\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.url) ||
			!asset.url.includes(asset.sha256) ||
			!Number.isSafeInteger(asset.bytes)
		)
			throw new Error("Invalid source image report");
		safeFile(projectRoot, asset.relative);
	}
	return report.assets;
}

function assertSourceAssets(projectRoot, assets) {
	const collection = fs.existsSync(safeFile(projectRoot, "public/images/yuque"))
		? "public/images/yuque"
		: ".tools/backups/yuque-images";
	for (const asset of assets) {
		const file = safeFile(
			projectRoot,
			collection + "/" + path.basename(asset.relative),
		);
		if (
			fs.statSync(file).size !== asset.bytes ||
			hash(fs.readFileSync(file)) !== asset.sha256
		)
			throw new Error("Local source image changed: " + asset.url);
	}
}

export async function uploadImages(projectRoot = root, limit = Infinity) {
	const assets = assetsFor(projectRoot);
	assertSourceAssets(projectRoot, assets);
	const folder = safeFile(projectRoot, ".tools/r2-migration");
	fs.mkdirSync(folder, { recursive: true });
	const journal = safeFile(projectRoot, ".tools/r2-migration/verified.ndjson");
	const hosting = { version: 1, origin: R2_ORIGIN, entries: {} };
	if (fs.existsSync(journal)) {
		const lines = fs.readFileSync(journal, "utf8").trimEnd().split("\n");
		for (let i = 0; i < lines.length; i++) {
			try {
				const [url, entry] = JSON.parse(lines[i]);
				hosting.entries[url] = entry;
			} catch {
				throw new Error(
					"Damaged checkpoint at line " +
						(i + 1) +
						"; keep original and repair before resuming",
				);
			}
		}
		validateHosting(hosting);
	}
	let pending = assets
		.filter((asset) => {
			const entry = hosting.entries[asset.url];
			if (
				entry &&
				(entry.sha256 !== asset.sha256 || entry.bytes !== asset.bytes)
			)
				throw new Error("Stale checkpoint: " + asset.url);
			return !entry;
		})
		.slice(0, limit);
	async function verifyAndRecord(asset, url) {
		await verifyRemote(url, asset);
		const entry = {
			url,
			sha256: asset.sha256,
			bytes: asset.bytes,
			verifiedAt: new Date().toISOString(),
		};
		fs.appendFileSync(journal, JSON.stringify([asset.url, entry]) + "\n");
		hosting.entries[asset.url] = entry;
	}
	// PicGo can finish a request after the local uploader is stopped. Reuse
	// objects in that batch only after checking their actual bytes.
	if (Object.keys(hosting.entries).length > 0) {
		const interruptedBatch = pending.slice(0, 256);
		for (let i = 0; i < interruptedBatch.length; i += 32) {
			await Promise.allSettled(
				interruptedBatch
					.slice(i, i + 32)
					.map((asset) =>
						verifyAndRecord(
							asset,
							`${R2_ORIGIN}/PicGo/${path.basename(asset.relative)}`,
						),
					),
			);
		}
		const remaining = pending.filter((asset) => !hosting.entries[asset.url]);
		if (remaining.length !== pending.length)
			console.log(
				`Recovered ${pending.length - remaining.length} uploaded images`,
			);
		pending = remaining;
	}
	console.log(
		`Images: ${assets.length}; already verified: ${assets.length - assets.filter((a) => !hosting.entries[a.url]).length}; pending this run: ${pending.length}`,
	);
	const start = Date.now();
	let processed = 0;
	const maxBatchBytes = 64 * 1024 * 1024;
	for (let offset = 0; offset < pending.length; ) {
		const batch = [];
		let batchBytes = 0;
		while (offset < pending.length && batch.length < 256) {
			const asset = pending[offset];
			if (batch.length && batchBytes + asset.bytes > maxBatchBytes) break;
			batch.push(asset);
			batchBytes += asset.bytes;
			offset++;
		}
		const batchStart = Date.now();
		const list = batch.map((asset) => {
			const file = safeFile(projectRoot, asset.relative);
			if (
				fs.statSync(file).size !== asset.bytes ||
				hash(fs.readFileSync(file)) !== asset.sha256
			)
				throw new Error("Local image changed: " + asset.relative);
			return file;
		});
		const uploaded = await retry(async () => {
			const res = await fetch("http://127.0.0.1:36677/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ list }),
				signal: AbortSignal.timeout(240000),
			});
			if (!res.ok) throw new Error("PicGo HTTP " + res.status);
			const data = await res.json();
			if (!data.success || data.items?.length !== batch.length)
				throw new Error("PicGo did not return all uploaded items");
			return data.items;
		}, "PicGo batch starting at " + processed);
		const uploadedAt = Date.now();
		for (let i = 0; i < batch.length; i += 32) {
			await Promise.all(
				batch.slice(i, i + 32).map(async (asset) => {
					const file = safeFile(projectRoot, asset.relative);
					const item = uploaded.find(
						(item) => path.resolve(item.origin) === file,
					);
					const url = `${R2_ORIGIN}/PicGo/${path.basename(file)}`;
					if (item?.imgUrl !== url)
						throw new Error("Unexpected PicGo image URL for " + asset.url);
					await retry(
						() => verifyAndRecord(asset, url),
						"Verify " + path.basename(file),
					);
				}),
			);
		}
		processed += batch.length;
		console.log(
			`Verified ${Object.keys(hosting.entries).length}/${assets.length}; this run ${processed}; upload ${Math.round((uploadedAt - batchStart) / 1000)}s; verify ${Math.round((Date.now() - uploadedAt) / 1000)}s; elapsed ${Math.round((Date.now() - start) / 1000)}s`,
		);
	}
	if (assets.every((asset) => hosting.entries[asset.url])) {
		validateHosting(hosting);
		atomicJson(safeFile(projectRoot, HOSTING_FILE), hosting);
		console.log("ALL UPLOADED AND HASH-VERIFIED: " + HOSTING_FILE);
	}
	return hosting;
}

function markdownFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isSymbolicLink()) throw new Error("Linked content path");
		const file = path.join(directory, entry.name);
		return entry.isDirectory()
			? markdownFiles(file)
			: /\.mdx?$/.test(entry.name)
				? [file]
				: [];
	});
}

export function applyImages(projectRoot = root) {
	const assets = assetsFor(projectRoot);
	const hosting = readImageHosting(projectRoot);
	if (
		!hosting ||
		assets.some(
			(a) =>
				hosting.entries[a.url]?.sha256 !== a.sha256 ||
				hosting.entries[a.url]?.bytes !== a.bytes,
		)
	)
		throw new Error("Not all source images have verified hosted copies");
	assertSourceAssets(projectRoot, assets);
	const manifestFile = safeFile(projectRoot, "docs/yuque-import-manifest.json");
	const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
	const recoveryFile = safeFile(
		projectRoot,
		".tools/r2-migration/apply-recovery.json",
	);
	if (fs.existsSync(recoveryFile)) {
		const recovery = JSON.parse(fs.readFileSync(recoveryFile, "utf8"));
		if (recovery.version !== 1 || !Array.isArray(recovery.posts))
			throw new Error("Invalid apply recovery record");
		for (const post of recovery.posts) {
			if (
				!/^src\/content\/posts\/.+\.mdx?$/.test(post.relative) ||
				!/^[a-f0-9]{64}$/.test(post.before) ||
				!/^[a-f0-9]{64}$/.test(post.after) ||
				typeof post.managedBefore !== "boolean"
			)
				throw new Error("Unsafe apply recovery entry");
			const file = safeFile(projectRoot, post.relative);
			if (
				post.managedBefore &&
				manifest.files[post.relative] === post.before &&
				fs.existsSync(file) &&
				hash(fs.readFileSync(file)) === post.after
			)
				manifest.files[post.relative] = post.after;
		}
		atomicJson(manifestFile, manifest);
	}
	const planned = markdownFiles(path.join(projectRoot, "src/content/posts"))
		.map((file) => {
			safeFile(projectRoot, path.relative(projectRoot, file));
			const original = fs.readFileSync(file, "utf8");
			return { file, original, ...rewriteHostedMarkdown(original, hosting) };
		})
		.filter((p) => p.rewritten);
	const backup = safeFile(
		projectRoot,
		".tools/backups/r2-migration-" +
			new Date().toISOString().replace(/[:.]/g, "-"),
	);
	fs.mkdirSync(backup, { recursive: true });
	fs.copyFileSync(
		manifestFile,
		path.join(backup, "yuque-import-manifest.json"),
		fs.constants.COPYFILE_EXCL,
	);
	for (const post of planned) {
		const relative = path
			.relative(projectRoot, post.file)
			.replaceAll("\\", "/");
		const target = path.join(backup, relative);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, post.original, { flag: "wx" });
	}
	atomicJson(recoveryFile, {
		version: 1,
		posts: planned.map((post) => {
			const relative = path
				.relative(projectRoot, post.file)
				.replaceAll("\\", "/");
			const before = hash(post.original);
			return {
				relative,
				before,
				after: hash(post.markdown),
				managedBefore: manifest.files[relative] === before,
			};
		}),
	});
	for (const post of planned) {
		if (fs.readFileSync(post.file, "utf8") !== post.original)
			throw new Error("Article edited during migration: " + post.file);
		const relative = path
			.relative(projectRoot, post.file)
			.replaceAll("\\", "/");
		// Preserve the existing importer conflict guard for user-edited posts.
		if (manifest.files[relative] === hash(post.original))
			manifest.files[relative] = hash(post.markdown);
		atomicWrite(post.file, post.markdown);
	}
	atomicJson(manifestFile, manifest);
	const result = {
		version: 1,
		migratedAt: new Date().toISOString(),
		images: assets.length,
		imageBytes: assets.reduce((n, a) => n + a.bytes, 0),
		changedPosts: planned.length,
		replacedReferences: planned.reduce((n, p) => n + p.rewritten, 0),
		backup: path.relative(projectRoot, backup).replaceAll("\\", "/"),
		origin: R2_ORIGIN,
	};
	atomicJson(
		safeFile(projectRoot, "docs/yuque-image-migration-report.json"),
		result,
	);
	console.log(JSON.stringify(result, null, 2));
	return result;
}

export function archiveImages(projectRoot = root) {
	const assets = assetsFor(projectRoot);
	const hosting = readImageHosting(projectRoot);
	if (
		!hosting ||
		assets.some(
			(a) =>
				hosting.entries[a.url]?.sha256 !== a.sha256 ||
				hosting.entries[a.url]?.bytes !== a.bytes,
		)
	)
		throw new Error("Not all source images have verified hosted copies");
	for (const file of markdownFiles(
		path.join(projectRoot, "src/content/posts"),
	)) {
		if (rewriteHostedMarkdown(fs.readFileSync(file, "utf8"), hosting).rewritten)
			throw new Error("Local image reference remains: " + file);
	}
	const source = safeFile(projectRoot, "public/images/yuque");
	const backup = safeFile(projectRoot, ".tools/backups/yuque-images");
	if (fs.existsSync(source) && fs.existsSync(backup))
		throw new Error("Both source and archive exist; inspect before archiving");
	const collection = fs.existsSync(source) ? source : backup;
	const expected = new Set(assets.map((a) => path.basename(a.relative)));
	const actual = fs.readdirSync(collection);
	if (
		actual.length !== expected.size ||
		actual.some((name) => !expected.has(name))
	)
		throw new Error("Image collection has unexpected or missing files");
	for (const asset of assets) {
		const file = safeFile(
			projectRoot,
			path.relative(
				projectRoot,
				path.join(collection, path.basename(asset.relative)),
			),
		);
		if (
			fs.statSync(file).size !== asset.bytes ||
			hash(fs.readFileSync(file)) !== asset.sha256
		)
			throw new Error("Archive image changed: " + asset.url);
	}
	if (collection === source) {
		fs.mkdirSync(path.dirname(backup), { recursive: true });
		// Same-volume directory rename preserves bytes without another 1.6 GB copy.
		fs.renameSync(source, backup);
	}
	console.log("Original images preserved outside public: " + backup);
	return backup;
}

export async function switchImageDomain(projectRoot, value, fetcher = fetch) {
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("Enter the HTTPS image domain without a path or query");
	const nextOrigin = url.origin;
	if (nextOrigin === R2_ORIGIN) return { files: 0, origin: nextOrigin };
	const hosting = readImageHosting(projectRoot);
	const entries = Object.values(hosting?.entries ?? {});
	if (!entries.length) throw new Error("No verified R2 image map found");
	const escapedOrigin = R2_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`${escapedOrigin}(?=$|[/#?\\s"'\x60<>()\\]])`,
		"g",
	);
	const paths = execFileSync(
		"git",
		[
			"grep",
			"-l",
			"-z",
			"-I",
			"-F",
			"--untracked",
			"--exclude-standard",
			"-e",
			R2_ORIGIN,
			"--",
			"src",
			"docs",
			"scripts",
			"本地使用指南.md",
		],
		{ cwd: projectRoot, encoding: "utf8" },
	)
		.split("\0")
		.filter(Boolean);
	const journal = ".tools/r2-migration/verified.ndjson";
	if (fs.existsSync(safeFile(projectRoot, journal))) paths.push(journal);
	const changes = [];
	for (const relative of paths) {
		const file = safeFile(projectRoot, relative);
		const before = fs.readFileSync(file, "utf8");
		const after = before.replace(pattern, nextOrigin);
		if (after !== before) changes.push({ relative, file, before, after });
	}
	const nextHosting = changes.find(
		(change) => change.relative === HOSTING_FILE,
	);
	if (!nextHosting)
		throw new Error("The image map was not included in the migration");
	validateHosting(JSON.parse(nextHosting.after), nextOrigin);

	const manifestPath = "docs/yuque-import-manifest.json";
	const manifestFile = safeFile(projectRoot, manifestPath);
	const manifestText = fs.readFileSync(manifestFile, "utf8");
	const manifest = JSON.parse(manifestText);
	let manifestChanged = false;
	for (const { relative, before, after } of changes) {
		if (manifest.files[relative] === hash(before)) {
			manifest.files[relative] = hash(after);
			manifestChanged = true;
		}
	}
	if (manifestChanged)
		changes.push({
			relative: manifestPath,
			file: manifestFile,
			before: manifestText,
			after: JSON.stringify(manifest, null, 2) + "\n",
		});

	// Confirm the new address serves the same objects before touching local files.
	for (const index of new Set([
		0,
		Math.floor(entries.length / 2),
		entries.length - 1,
	])) {
		const entry = entries[index];
		await verifyRemote(entry.url.replace(pattern, nextOrigin), entry, fetcher);
	}
	const backup = `.tools/backups/r2-domain-${crypto.randomUUID()}`;
	for (const { relative, before } of changes) {
		const saved = safeFile(projectRoot, `${backup}/${relative}`);
		fs.mkdirSync(path.dirname(saved), { recursive: true });
		fs.writeFileSync(saved, before, { flag: "wx" });
	}
	const written = [];
	try {
		for (const change of changes) {
			if (fs.readFileSync(change.file, "utf8") !== change.before)
				throw new Error("File changed during migration: " + change.relative);
			atomicWrite(change.file, change.after);
			written.push(change);
		}
	} catch (error) {
		for (const { file, before, after } of written.reverse()) {
			if (fs.readFileSync(file, "utf8") === after) atomicWrite(file, before);
		}
		throw new Error(`${error.message}. Backup: ${backup}`, { cause: error });
	}
	return { files: changes.length, origin: nextOrigin, backup };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		if (process.argv[2] === "upload")
			await uploadImages(root, Number(process.argv[3]) || Infinity);
		else if (process.argv[2] === "apply") applyImages();
		else if (process.argv[2] === "archive") archiveImages();
		else if (process.argv[2] === "domain")
			console.log(await switchImageDomain(root, process.argv[3]));
		else
			throw new Error(
				"Usage: node scripts/migrate-yuque-images.mjs upload [limit] | apply | archive | domain <https://img.example.com>",
			);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
