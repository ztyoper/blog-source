import fs from "node:fs";
import path from "node:path";

export const R2_ORIGIN = "https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev";
export const HOSTING_FILE = "docs/yuque-image-hosting.json";
const localPattern = /^\/images\/yuque\/([a-f0-9]{64})\.[a-z0-9]+$/;

export function validateHosting(data) {
	if (
		data?.version !== 1 ||
		data.origin !== R2_ORIGIN ||
		!data.entries ||
		typeof data.entries !== "object" ||
		Array.isArray(data.entries)
	)
		throw new Error("Invalid image hosting manifest");
	for (const [local, entry] of Object.entries(data.entries)) {
		const match = local.match(localPattern);
		if (
			!match ||
			entry?.sha256 !== match[1] ||
			!Number.isSafeInteger(entry.bytes) ||
			entry.bytes <= 0 ||
			!Number.isFinite(Date.parse(entry.verifiedAt)) ||
			entry.url !== `${R2_ORIGIN}/PicGo/${local.split("/").at(-1)}`
		)
			throw new Error("Invalid hosted image entry: " + local);
	}
	return data;
}

export function readImageHosting(projectRoot) {
	const file = path.join(projectRoot, HOSTING_FILE);
	return fs.existsSync(file)
		? validateHosting(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

export function hostedUrl(url, hosting) {
	if (!hosting || typeof url !== "string") return url;
	const split = url.search(/[?#]/);
	const pathname = split < 0 ? url : url.slice(0, split);
	const suffix = split < 0 ? "" : url.slice(split);
	return Object.hasOwn(hosting.entries, pathname)
		? hosting.entries[pathname].url + suffix
		: url;
}
