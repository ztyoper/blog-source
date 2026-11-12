import { visit } from "unist-util-visit";

/**
 * @param {{ origin: string, dimensions: Record<string, number[]>,
 *           previews?: Record<string, [string, number][]> }} options
 */
export default function rehypeYuqueImages({
	origin,
	dimensions,
	previews = {},
}) {
	const prefix = `${origin}/PicGo/`;
	/** @param {import('hast').Root} tree */
	return (tree) => {
		let seenHostedImage = false;
		visit(tree, "element", ({ tagName, properties }) => {
			const { src } = properties;
			if (
				tagName !== "img" ||
				typeof src !== "string" ||
				!src.startsWith(prefix)
			)
				return;

			const priority = properties.fetchPriority ?? properties.fetchpriority;
			if (seenHostedImage && priority !== "high") properties.loading ??= "lazy";
			seenHostedImage = true;
			if (properties.loading === "lazy") properties.decoding ??= "async";

			const filename = src.slice(prefix.length).split(/[?#]/, 1)[0];
			if (
				properties.width == null &&
				properties.height == null &&
				Object.hasOwn(dimensions, filename)
			) {
				[properties.width, properties.height] = dimensions[filename];
			}
			if (properties.srcSet == null && Object.hasOwn(previews, filename)) {
				properties.srcSet = previews[filename]
					.map(([name, width]) => `${prefix}${name} ${width}w`)
					.join(", ");
				properties.sizes ??= "(max-width: 768px) 100vw, 960px";
			}
		});
	};
}
