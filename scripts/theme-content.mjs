import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = ".theme-content-manifest.json";
const inputs = [
	"src/content/posts",
	"src/content/spec/about.md",
	"public/images",
	"public/avatar.svg",
];
const hashBuffer = Buffer.allocUnsafe(64 * 1024);
const hashCache = new Map();

function digestFile(file) {
	const stat = fs.statSync(file, { bigint: true });
	const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
	const previous = hashCache.get(file);
	if (previous?.signature === signature) return previous.hash;
	const digest = createHash("sha256");
	const fd = fs.openSync(file, "r");
	try {
		let size;
		while ((size = fs.readSync(fd, hashBuffer, 0, hashBuffer.length, null)) > 0)
			digest.update(hashBuffer.subarray(0, size));
	} finally {
		fs.closeSync(fd);
	}
	const hash = digest.digest("hex");
	hashCache.set(file, { signature, hash });
	return hash;
}

function isManaged(relative) {
	if (
		typeof relative !== "string" ||
		relative.includes("\\") ||
		relative.includes(":")
	)
		return false;
	if (
		relative.split("/").some((part) => !part || part === "." || part === "..")
	)
		return false;
	return (
		relative === "src/content/spec/about.md" ||
		relative === "public/avatar.svg" ||
		relative.startsWith("src/content/posts/") ||
		relative.startsWith("public/images/")
	);
}

function ensureRegularPath(root, relative) {
	let current = root;
	for (const part of relative.split("/")) {
		current = path.join(current, part);
		const entry = fs.lstatSync(current, { throwIfNoEntry: false });
		if (entry?.isSymbolicLink()) {
			throw new Error(
				`Symbolic links are not supported in managed content: ${relative}`,
			);
		}
	}
	return current;
}

function collect(root, relative, files) {
	const file = ensureRegularPath(root, relative);
	if (!fs.existsSync(file)) return;
	const stat = fs.lstatSync(file);
	if (stat.isDirectory()) {
		for (const child of fs.readdirSync(file).sort())
			collect(root, `${relative}/${child}`, files);
	} else if (stat.isFile()) {
		if (!isManaged(relative))
			throw new Error(`Unmanaged source path: ${relative}`);
		files.set(relative, { file, hash: digestFile(file) });
	}
}

export function syncThemeContent({ sourceRoot, targetRoot }) {
	sourceRoot = path.resolve(sourceRoot);
	targetRoot = path.resolve(targetRoot);
	if (targetRoot !== path.resolve(sourceRoot, "themes/fuwari"))
		throw new Error("Invalid theme target path");
	const realSource = fs.realpathSync(sourceRoot);
	const realTarget = fs.realpathSync(targetRoot);
	if (!realTarget.startsWith(realSource + path.sep))
		throw new Error("Theme target is outside project");
	const manifestFile = ensureRegularPath(targetRoot, manifestName);
	let previous = { version: 1, files: {} };
	if (fs.existsSync(manifestFile))
		previous = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
	if (
		previous.version !== 1 ||
		!previous.files ||
		typeof previous.files !== "object" ||
		Array.isArray(previous.files)
	) {
		throw new Error("Invalid managed-content manifest");
	}
	for (const [relative, hash] of Object.entries(previous.files)) {
		if (!isManaged(relative) || !/^[a-f0-9]{64}$/.test(hash))
			throw new Error(`Invalid managed manifest path: ${relative}`);
	}
	const sourceFiles = new Map();
	for (const input of inputs) collect(sourceRoot, input, sourceFiles);
	const copies = [];
	const removals = [];
	const nextFiles = {};
	// Check every conflict before changing destination files.
	for (const [relative, source] of sourceFiles) {
		const target = ensureRegularPath(targetRoot, relative);
		const exists = fs.existsSync(target);
		const currentHash = exists ? digestFile(target) : null;
		if (
			exists &&
			currentHash !== source.hash &&
			currentHash !== previous.files[relative]
		) {
			throw new Error(
				`Destination modified or unmanaged conflict: ${relative}`,
			);
		}
		if (currentHash !== source.hash)
			copies.push({ relative, target, sourceFile: source.file, currentHash });
		nextFiles[relative] = source.hash;
	}
	for (const [relative, oldHash] of Object.entries(previous.files)) {
		if (sourceFiles.has(relative)) continue;
		const target = ensureRegularPath(targetRoot, relative);
		if (!fs.existsSync(target)) continue;
		if (digestFile(target) !== oldHash)
			throw new Error(`Destination modified; refusing deletion: ${relative}`);
		removals.push(target);
	}
	for (const { relative, target, sourceFile, currentHash } of copies) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const temporary = target + ".theme-sync-" + randomUUID();
		try {
			fs.copyFileSync(sourceFile, temporary, fs.constants.COPYFILE_EXCL);
			const copiedHash = digestFile(temporary);
			ensureRegularPath(targetRoot, relative);
			if ((fs.existsSync(target) ? digestFile(target) : null) !== currentHash) {
				throw new Error(`Destination modified during sync: ${relative}`);
			}
			fs.renameSync(temporary, target);
			nextFiles[relative] = copiedHash;
			hashCache.delete(target);
		} finally {
			hashCache.delete(temporary);
			if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
		}
	}
	for (const target of removals) {
		fs.unlinkSync(target);
		hashCache.delete(target);
	}
	if (
		!fs.existsSync(manifestFile) ||
		JSON.stringify(previous.files) !== JSON.stringify(nextFiles)
	) {
		fs.writeFileSync(
			manifestFile,
			JSON.stringify({ version: 1, files: nextFiles }, null, 2) + "\n",
		);
	}
	return { copied: copies.length, removed: removals.length };
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const sourceRoot = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
	);
	console.log(
		syncThemeContent({
			sourceRoot,
			targetRoot: path.join(sourceRoot, "themes/fuwari"),
		}),
	);
}
