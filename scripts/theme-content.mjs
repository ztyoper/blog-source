import { createHash } from "node:crypto";
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
const digest = buffer => createHash("sha256").update(buffer).digest("hex");

function isManaged(relative) {
	if (typeof relative !== "string" || relative.includes("\\") || relative.includes(":")) return false;
	if (relative.split("/").some(part => !part || part === "." || part === "..")) return false;
	return relative === "src/content/spec/about.md" || relative === "public/avatar.svg"
		|| relative.startsWith("src/content/posts/") || relative.startsWith("public/images/");
}

function ensureRegularPath(root, relative) {
	let current = root;
	for (const part of relative.split("/")) {
		current = path.join(current, part);
		const entry = fs.lstatSync(current, { throwIfNoEntry: false });
		if (entry?.isSymbolicLink()) {
			throw new Error(`Symbolic links are not supported in managed content: ${relative}`);
		}
	}
	return current;
}

function collect(root, relative, files) {
	const file = ensureRegularPath(root, relative);
	if (!fs.existsSync(file)) return;
	const stat = fs.lstatSync(file);
	if (stat.isDirectory()) {
		for (const child of fs.readdirSync(file).sort()) collect(root, `${relative}/${child}`, files);
	} else if (stat.isFile()) {
		if (!isManaged(relative)) throw new Error(`Unmanaged source path: ${relative}`);
		const buffer = fs.readFileSync(file);
		files.set(relative, { buffer, hash: digest(buffer) });
	}
}

export function syncThemeContent({ sourceRoot, targetRoot }) {
	sourceRoot = path.resolve(sourceRoot);
	targetRoot = path.resolve(targetRoot);
	if (targetRoot !== path.resolve(sourceRoot, "themes/fuwari")) throw new Error("Invalid theme target path");
	const realSource = fs.realpathSync(sourceRoot);
	const realTarget = fs.realpathSync(targetRoot);
	if (!realTarget.startsWith(realSource + path.sep)) throw new Error("Theme target is outside project");
	const manifestFile = ensureRegularPath(targetRoot, manifestName);
	let previous = { version: 1, files: {} };
	if (fs.existsSync(manifestFile)) previous = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
	if (previous.version !== 1 || !previous.files || typeof previous.files !== "object" || Array.isArray(previous.files)) {
		throw new Error("Invalid managed-content manifest");
	}
	for (const [relative, hash] of Object.entries(previous.files)) {
		if (!isManaged(relative) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid managed manifest path: ${relative}`);
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
		const currentHash = exists ? digest(fs.readFileSync(target)) : null;
		if (exists && currentHash !== source.hash && currentHash !== previous.files[relative]) {
			throw new Error(`Destination modified or unmanaged conflict: ${relative}`);
		}
		if (currentHash !== source.hash) copies.push({ target, buffer: source.buffer });
		nextFiles[relative] = source.hash;
	}
	for (const [relative, oldHash] of Object.entries(previous.files)) {
		if (sourceFiles.has(relative)) continue;
		const target = ensureRegularPath(targetRoot, relative);
		if (!fs.existsSync(target)) continue;
		if (digest(fs.readFileSync(target)) !== oldHash) throw new Error(`Destination modified; refusing deletion: ${relative}`);
		removals.push(target);
	}
	for (const { target, buffer } of copies) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, buffer);
	}
	for (const target of removals) fs.unlinkSync(target);
	if (!fs.existsSync(manifestFile) || JSON.stringify(previous.files) !== JSON.stringify(nextFiles)) {
		fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, files: nextFiles }, null, 2) + "\n");
	}
	return { copied: copies.length, removed: removals.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	console.log(syncThemeContent({ sourceRoot, targetRoot: path.join(sourceRoot, "themes/fuwari") }));
}
