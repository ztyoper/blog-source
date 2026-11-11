import { transformSync } from "esbuild";

// <script ...>...</script>，惰性匹配内容，属性里不允许出现 >
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

// 只碰这几种 type（空 type 就是普通 JS）
const JS_TYPES = new Set([
	"",
	"text/javascript",
	"application/javascript",
	"module",
]);

/**
 * 判断某段 <script> 是否该压缩：
 * 外链的没有内容可压；type 不是 JS 的（application/ld+json、text/template、
 * Pagefind 的数据块之类）一律不碰。
 */
function shouldMinify(attrs: string): boolean {
	if (/\ssrc\s*=/i.test(attrs)) return false;
	const typeMatch = attrs.match(/\stype\s*=\s*["']?([^"'\s>]*)/i);
	const type = (typeMatch?.[1] ?? "").toLowerCase();
	return JS_TYPES.has(type);
}

function minifyInline(code: string, file: string): string {
	try {
		const result = transformSync(code, {
			loader: "js",
			target: "es2018",
			minifyWhitespace: true,
			minifySyntax: true,
			// 标识符不能改名：这些脚本处在全局作用域、彼此靠全局函数名互相调用
			// （如 MainGridLayout 的 setRandomSubtitle），改名会静默炸掉。
			minifyIdentifiers: false,
		});
		// 压完不能出现 </script，否则会提前闭合标签
		if (/<\/script/i.test(result.code)) return code;
		return result.code;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`   ⚠ Skipped a script in ${file}: ${message}`);
		return code;
	}
}

type InlineScriptMinifier = {
	rewrite(html: string, file: string): string;
	summary(fileCount: number): string;
};

export function createInlineScriptMinifier(): InlineScriptMinifier {
	let savedBytes = 0;
	let touchedFiles = 0;
	let scriptCount = 0;
	let transforms = 0;
	let cachedChars = 0;
	const minifiedScripts = new Map<string, string>();
	const maxCacheChars = 8_000_000;

	return {
		rewrite(html, file) {
			const output = html.replace(
				SCRIPT_RE,
				(whole, attrs: string, code: string) => {
					if (!shouldMinify(attrs) || !code.trim()) return whole;
					let minified = minifiedScripts.get(code);
					if (minified === undefined) {
						minified = minifyInline(code, file);
						transforms++;
						const size = code.length + minified.length;
						if (cachedChars + size <= maxCacheChars) {
							minifiedScripts.set(code, minified);
							cachedChars += size;
						}
					}
					if (minified === code) return whole;
					scriptCount++;
					savedBytes +=
						Buffer.byteLength(code, "utf8") -
						Buffer.byteLength(minified, "utf8");
					return `<script${attrs}>${minified}</script>`;
				},
			);
			if (output !== html) touchedFiles++;
			return output;
		},
		summary(fileCount) {
			const savedKiB = (savedBytes / 1024).toFixed(1);
			return `✨ Minified ${scriptCount} inline scripts in ${touchedFiles}/${fileCount} HTML files with ${transforms} compression attempts, saved ${savedKiB} KiB`;
		},
	};
}
