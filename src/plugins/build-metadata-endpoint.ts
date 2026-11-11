import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { countSiteWords } from "../utils/build-metadata";
import { formatDateI18nWithTime } from "../utils/date-utils";

export const GET: APIRoute = async () => {
	const posts = await getCollection("posts", ({ data }) => !data.draft);
	return Response.json({
		buildTime: formatDateI18nWithTime(new Date()),
		wordCount: countSiteWords(posts).toLocaleString(),
	});
};
