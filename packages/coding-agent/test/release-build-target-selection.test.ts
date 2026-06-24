import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("release build target selection", () => {
	const repoRoot = path.resolve(import.meta.dir, "../../..");
	const scriptPath = path.join(repoRoot, "scripts/ci-release-build-binaries.ts");

	it("defaults local runs to host targets while keeping CI on the full target set", async () => {
		const source = await Bun.file(scriptPath).text();
		expect(source).toContain("return Bun.env.CI ? targets : hostDefaultTargets();");
	});

	it("assigns the linux-arm64 Rust cross target explicitly", async () => {
		const source = await Bun.file(scriptPath).text();
		expect(source).toContain('rustTarget: "aarch64-unknown-linux-gnu"');
		expect(source).toContain("Missing Rust cross target(s):");
	});
});
