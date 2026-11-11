import type { CollectionEntry } from "astro:content";

type SeriesPost = Pick<CollectionEntry<"posts">, "id" | "data">;
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

function buildSeriesTree(posts: SeriesPost[]): SeriesNode[] {
	posts.sort(compareSeriesPosts);
	const ids = new Set(posts.map(({ id }) => id));
	const byParent = new Map<string | undefined, SeriesPost[]>();
	for (const post of posts) {
		const parentId = post.data.seriesParent?.id;
		const parent =
			parentId && parentId !== post.id && ids.has(parentId)
				? parentId
				: undefined;
		const siblings = byParent.get(parent);
		if (siblings) siblings.push(post);
		else byParent.set(parent, [post]);
	}

	const visited = new Set<string>();
	function visit({ id, data }: SeriesPost): SeriesNode[] {
		if (visited.has(id)) return [];
		visited.add(id);
		return [
			{ id, title: data.title, children: (byParent.get(id) ?? []).flatMap(visit) },
		];
	}

	const entries = (byParent.get(undefined) ?? []).flatMap(visit);
	// A cycle has no root. Keep its posts reachable and stop at the repeated edge.
	entries.push(...posts.flatMap(visit));
	return entries;
}

export function buildSeriesList(posts: readonly SeriesPost[]): Series[] {
	const groups = new Map<string, SeriesPost[]>();
	for (const post of posts) {
		const name = post.data.series.trim();
		if (!name) continue;
		const group = groups.get(name);
		if (group) group.push(post);
		else groups.set(name, [post]);
	}

	const seriesList = Array.from(groups, ([name, group]) => ({
		name,
		count: group.length,
		entries: buildSeriesTree(group),
	}));
	return seriesList.sort(
		(a, b) => b.count - a.count || a.name.localeCompare(b.name),
	);
}
