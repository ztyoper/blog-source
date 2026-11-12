export function getPostBuildTimeKey(
	now: Date,
	adExpiryDates: readonly string[],
): [number, boolean[]] {
	return [
		now.getFullYear(),
		adExpiryDates.map((expiry) => now.getTime() > Date.parse(expiry)),
	];
}
