import assert from "node:assert/strict";
import test from "node:test";
import { fromHtml } from "hast-util-from-html";
import { visit } from "unist-util-visit";
import rehypeYuqueImages from "../src/plugins/rehype-yuque-images.mjs";

const origin = "https://images.example.com";

test("keeps the first hosted image eager and reserves space for lazy images", () => {
	const tree = fromHtml(
		`<img src="/local.png"><img src="${origin}/PicGo/first.png">
		<figure><img src="${origin}/PicGo/second.png?raw#example" alt="Diagram"></figure>
		<img src="${origin}/PicGo/unknown.png">`,
		{ fragment: true },
	);
	rehypeYuqueImages({ origin, dimensions: { "second.png": [1600, 900] } })(
		tree,
	);
	const images = [];
	visit(tree, "element", (node) => {
		if (node.tagName === "img") images.push(node.properties);
	});
	assert.equal(images[0].loading, undefined);
	assert.equal(images[1].loading, undefined);
	assert.deepEqual(images[2], {
		src: `${origin}/PicGo/second.png?raw#example`,
		alt: "Diagram",
		loading: "lazy",
		decoding: "async",
		width: 1600,
		height: 900,
	});
	assert.equal(images[3].loading, "lazy");
	assert.equal(images[3].width, undefined);
});

test("preserves explicit image priorities and author-supplied dimensions", () => {
	const tree = fromHtml(
		`<img src="${origin}/PicGo/first.png" loading="lazy">
		<img src="${origin}/PicGo/hero.png" fetchpriority="high" width="400" height="200">
		<img src="${origin}/PicGo/last.png" loading="eager" decoding="sync">
		<img src="https://other.example.com/PicGo/hero.png">`,
		{ fragment: true },
	);
	rehypeYuqueImages({ origin, dimensions: { "hero.png": [1600, 800] } })(tree);
	const images = tree.children
		.filter((node) => node.tagName === "img")
		.map((node) => node.properties);
	assert.equal(images[0].loading, "lazy");
	assert.equal(images[1].loading, undefined);
	assert.equal(images[1].width, 400);
	assert.equal(images[1].height, 200);
	assert.equal(images[2].loading, "eager");
	assert.equal(images[2].decoding, "sync");
	assert.equal(images[3].loading, undefined);
	assert.equal(images[3].width, undefined);
});

test("serves verified responsive previews while retaining the original image URL", () => {
	const original = `${origin}/PicGo/large.png`;
	const tree = fromHtml(
		`<img src="${original}"><img src="${original}" srcset="custom.png 320w">`,
		{ fragment: true },
	);
	rehypeYuqueImages({
		origin,
		dimensions: { "large.png": [1800, 1200] },
		previews: {
			"large.png": [
				["small.webp", 640],
				["large.webp", 1280],
			],
		},
	})(tree);
	const images = tree.children.map((node) => node.properties);
	assert.equal(images[0].src, original);
	assert.equal(
		images[0].srcSet,
		`${origin}/PicGo/small.webp 640w, ${origin}/PicGo/large.webp 1280w`,
	);
	assert.match(images[0].sizes, /100vw/);
	assert.equal(images[1].srcSet, "custom.png 320w");
});
