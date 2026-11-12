export const incrementalBuildEnabled: boolean =
	process.env.FIREFLY_INCREMENTAL_BUILD === "1" && !process.env.CF_WORKERS;

export const buildMetadataFile = "_firefly-build-metadata.json";

export function countSiteWords(posts: readonly { body?: string }[]): number {
	let total = 0;
	for (const { body } of posts) {
		if (!body) continue;
		const text = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
		total += (text.match(/[\u4e00-\u9fa5a-zA-Z]/g) || []).length;
	}
	return total;
}
