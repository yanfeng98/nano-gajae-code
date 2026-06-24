import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("release build all-targets flag", () => {
	const repoRoot = path.resolve(import.meta.dir, "../../..");
	const scriptPath = path.join(repoRoot, "scripts/ci-release-build-binaries.ts");
	const packageJsonPath = path.join(repoRoot, "package.json");

	it("supports an explicit --all-targets switch", async () => {
		const source = await Bun.file(scriptPath).text();
		expect(source).toContain('const isAllTargets = process.argv.includes("--all-targets");');
		expect(source).toContain("if (isAllTargets) {");
		expect(source).toContain("return targets;");
	});

	it("exposes a package script for all-platform release builds", async () => {
		const pkg = await Bun.file(packageJsonPath).json();
		expect((pkg as { scripts?: Record<string, string> }).scripts?.["ci:release:build-binaries:all"]).toBe(
			"bun scripts/ci-release-build-binaries.ts --all-targets",
		);
	});
});
