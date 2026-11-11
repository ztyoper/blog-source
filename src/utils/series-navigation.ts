import type { List } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

type SeriesPost = {
	id: string;
	body?: string;
	data: {
		title: string;
		published: Date;
		series: string;
		seriesOrder?: number;
	};
};

export type SeriesNode = { id: string; title: string; children: SeriesNode[] };
export type Series = { name: string; count: number; entries: SeriesNode[] };

function compareSeriesPosts(a: SeriesPost, b: SeriesPost): number {
	const aOrder = a.data.seriesOrder ?? Number.POSITIVE_INFINITY;
	const bOrder = b.data.seriesOrder ?? Number.POSITIVE_INFINITY;
	if (aOrder !== bOrder) return aOrder - bOrder;

	return (
		b.data.published.getTime() - a.data.published.getTime() ||
		a.data.title.localeCompare(b.data.title)
	);
}

function readOutline(
	list: List,
	remaining: Map<string, SeriesPost>,
): SeriesNode[] {
	return list.children.flatMap((item) => {
		const paragraph = item.children.find((child) => child.type === "paragraph");
		const link = paragraph?.children.find((child) => child.type === "link");
		const id = link?.url.match(/^\/posts\/(.+?)\/?$/)?.[1];
		const post = id ? remaining.get(id) : undefined;
		if (post) remaining.delete(post.id);

		const children = item.children.flatMap((child) =>
			child.type === "list" ? readOutline(child, remaining) : [],
		);
		// Keep published lessons accessible if their chapter article is missing or a draft.
		return post
			? [{ id: post.id, title: post.data.title, children }]
			: children;
	});
}

export function buildSeriesList(posts: readonly SeriesPost[]): Series[] {
	const groups = new Map<string, SeriesPost[]>();
	const overviews = new Map<string, string>();
	for (const post of posts) {
		const book = post.id.match(/^yuque\/([^/]+)\/overview$/)?.[1];
		if (book && post.body) overviews.set(book, post.body);
		const name = post.data.series.trim();
		if (!name) continue;
		const group = groups.get(name);
		if (group) group.push(post);
		else groups.set(name, [post]);
	}

	const seriesList = Array.from(groups, ([name, group]) => {
		const remaining = new Map(group.map((post) => [post.id, post]));
		const books = new Set(
			group.map(({ id }) => id.match(/^yuque\/([^/]+)\//)?.[1]),
		);
		const entries: SeriesNode[] = [];
		for (const book of books) {
			const overview = book ? overviews.get(book) : undefined;
			if (!overview) continue;
			for (const node of fromMarkdown(overview).children) {
				if (node.type === "list") entries.push(...readOutline(node, remaining));
			}
		}

		const unlisted = [...remaining.values()].sort(compareSeriesPosts);
		entries.push(
			...unlisted.map(({ id, data }) => ({
				id,
				title: data.title,
				children: [],
			})),
		);
		return { name, count: group.length, entries };
	});
	return seriesList.sort(
		(a, b) => b.count - a.count || a.name.localeCompare(b.name),
	);
}
