import assert from "node:assert/strict";
import test from "node:test";
import { buildSeriesList } from "../src/utils/series-navigation.ts";

function post(id, title, seriesOrder, published = "2025-05-19") {
	return {
		id,
		data: { title, series: "IM", seriesOrder, published: new Date(published) },
	};
}

test("reuses the knowledge-base outline for chapters, lessons, and introductory posts", () => {
	const base = "yuque/im/";
	const [series] = buildSeriesList([
		post(`${base}2`, "First lesson", 60),
		post(`${base}3`, "Second lesson", 1),
		post(`${base}1`, "Architecture", 70),
		post(`${base}0`, "Introduction", 99),
		post(`${base}4`, "New note", 0),
		{
			...post(`${base}overview`, "Outline"),
			body: `# IM

- [Introduction](/posts/yuque/im/0/)
- [Architecture](/posts/yuque/im/1/)
  - [First lesson](/posts/yuque/im/2/)
  - [Second lesson](/posts/yuque/im/3/)
  - [Draft lesson](/posts/yuque/im/5/)
- [Duplicate link](/posts/yuque/im/2/)
`,
			data: { ...post("", "Outline").data, series: "" },
		},
	]);
	assert.equal(series.count, 5);
	assert.deepEqual(series.entries, [
		{ id: `${base}0`, title: "Introduction", children: [] },
		{
			id: `${base}1`,
			title: "Architecture",
			children: [
				{ id: `${base}2`, title: "First lesson", children: [] },
				{ id: `${base}3`, title: "Second lesson", children: [] },
			],
		},
		{ id: `${base}4`, title: "New note", children: [] },
	]);
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
