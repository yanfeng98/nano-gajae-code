import { describe, expect, it } from "bun:test";
import * as path from "node:path";
/** Regression coverage for issue #264 dogfood failures. */
describe("issue #264 — dogfood build and telemetry boundaries", () => {
	it("stages workspace native addons next to the compiled dev binary", async () => {
		const repoRoot = path.resolve(import.meta.dir, "../../..");
		const buildScriptPath = path.join(repoRoot, "packages/coding-agent/scripts/build-binary.ts");
		const source = await Bun.file(buildScriptPath).text();

		expect(source).toContain('new Bun.Glob("pi_natives.*.node")');
		expect(source).toContain('path.join(packageDir, "dist", filename)');
		expect(source.indexOf("await stageWorkspaceNativeAddons();")).toBeGreaterThan(source.indexOf('"dist/gjc"'));
	});
});
