type BuildValues = { buildTime: string; wordCount: string };

export function initSiteBuildValues(): void {
	const url = document.body.dataset.fireflyBuildMetadata;
	if (!url) return;

	let pending: Promise<BuildValues | undefined> | undefined;
	const update = () => {
		const fields = document.querySelectorAll<HTMLElement>(
			"[data-firefly-build-value]",
		);
		if (!fields.length) return;

		pending ??= fetch(url, { cache: "no-cache" })
			.then(async (response) => {
				if (!response.ok) throw new Error("Build metadata is unavailable");
				const values = await response.json();
				if (
					typeof values?.buildTime !== "string" ||
					typeof values?.wordCount !== "string"
				) {
					throw new Error("Invalid build metadata");
				}
				return values;
			})
			.catch(() => {
				pending = undefined;
				return undefined;
			});

		void pending.then((values) => {
			if (!values) return;
			for (const field of fields) {
				const value =
					field.dataset.fireflyBuildValue === "time"
						? values.buildTime
						: values.wordCount;
				field.textContent = value;
				if (field.hasAttribute("title")) field.title = value;
			}
		});
	};

	update();
	document.addEventListener("swup:contentReplaced", update);
	document.addEventListener("astro:page-load", update);
}
