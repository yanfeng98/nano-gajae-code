import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("release build arm64 toolchain hint", () => {
	it("documents the required GNU ARM64 cross toolchain in build-native", async () => {
		const repoRoot = path.resolve(import.meta.dir, "../../..");
		const source = await Bun.file(path.join(repoRoot, "packages/natives/scripts/build-native.ts")).text();

		expect(source).toContain("Cross-compiling for ${crossTarget} requires the GNU ARM64 cross toolchain.");
		expect(source).toContain("gcc-aarch64-linux-gnu g++-aarch64-linux-gnu binutils-aarch64-linux-gnu libc6-dev-arm64-cross");
	});
});
