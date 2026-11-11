import assert from "node:assert/strict";
import test from "node:test";
import { buildSeriesList } from "../src/utils/series-navigation.ts";

function post(id, title, seriesOrder, published = "2025-05-19") {
	return {
		id,
		data: { title, series: "IM", seriesOrder, published: new Date(published) },
	};
}

function child(id, title, seriesOrder, parent) {
	const entry = post(id, title, seriesOrder);
	entry.data.seriesParent = { collection: "posts", id: parent };
	return entry;
}

test("builds nested chapters and sorts each sibling group without an overview", () => {
	const [series] = buildSeriesList([
		child("im/second", "Second lesson", 2, "im/architecture"),
		child("im/example", "Example", 1, "im/first"),
		post("im/architecture", "Architecture", 2),
		child("im/first", "First lesson", 1, "im/architecture"),
		post("im/intro", "Introduction", 1),
	]);
	assert.equal(series.count, 5);
	assert.deepEqual(series.entries, [
		{ id: "im/intro", title: "Introduction", children: [] },
		{
			id: "im/architecture",
			title: "Architecture",
			children: [
				{
					id: "im/first",
					title: "First lesson",
					children: [{ id: "im/example", title: "Example", children: [] }],
				},
				{ id: "im/second", title: "Second lesson", children: [] },
			],
		},
	]);
});

test("keeps lessons accessible when a parent is missing, cross-series or cyclic", () => {
	const other = post("other", "Other series", 1);
	other.data.series = "Other";
	const [series] = buildSeriesList([
		child("standalone", "Standalone lesson", 1, "unpublished"),
		child("cross", "Cross-series lesson", 2, "other"),
		child("a", "Cycle start", 3, "b"),
		child("b", "Cycle end", 4, "a"),
		child("self", "Self reference", 5, "self"),
		other,
	]);
	assert.deepEqual(series.entries.map(({ id }) => id), [
		"standalone",
		"cross",
		"self",
		"a",
	]);
	assert.deepEqual(series.entries[3].children.map(({ id }) => id), ["b"]);
	assert.deepEqual(series.entries[3].children[0].children, []);
});

test("orders manual series by explicit position, then by publication date and title", () => {
	const [series] = buildSeriesList([
		post("alpha", "Alpha", undefined, "2025-05-21"),
		post("beta", "Beta", undefined, "2025-05-21"),
		post("intro", "Introduction", 0),
		post("old", "Older", undefined),
		post("next", "Next", 10),
	]);
	assert.deepEqual(
		series.entries.map(({ id }) => id),
		["intro", "next", "alpha", "beta", "old"],
	);
});
