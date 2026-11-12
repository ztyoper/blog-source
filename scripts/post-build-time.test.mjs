import assert from "node:assert/strict";
import test from "node:test";
import { getPostBuildTimeKey } from "../src/utils/post-build-time.ts";

test("reuses article cache keys across calendar days", () => {
	const first = new Date(2026, 10, 12, 23, 59);
	const next = new Date(2026, 10, 13, 0, 1);
	assert.deepEqual(
		getPostBuildTimeKey(first, []),
		getPostBuildTimeKey(next, []),
	);
});

test("updates cached footers at the start of a new year", () => {
	assert.notDeepEqual(
		getPostBuildTimeKey(new Date(2026, 11, 31), []),
		getPostBuildTimeKey(new Date(2027, 0, 1), []),
	);
});

test("updates cached ads when an enabled ad expires, even within a day", () => {
	const expires = new Date(2026, 10, 12, 12);
	const ads = [expires.toISOString()];
	const after = new Date(expires.getTime() + 1);
	assert.notDeepEqual(
		getPostBuildTimeKey(expires, ads),
		getPostBuildTimeKey(after, ads),
	);
});
