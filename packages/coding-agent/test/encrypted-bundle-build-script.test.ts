import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("encrypted bundle build scripts", () => {
	const repoRoot = path.resolve(import.meta.dir, "../../..");
	const releaseScriptPath = path.join(repoRoot, "scripts/ci-release-build-binaries.ts");
	const devScriptPath = path.join(repoRoot, "packages/coding-agent/scripts/build-binary.ts");

	it("uses an outdir-based helper for release encrypted bundles", async () => {
		const source = await Bun.file(releaseScriptPath).text();
		expect(source).toContain("async function bundleEntrypointToFile");
		expect(source).toContain('"--outdir"');
		expect(source).toContain('await bundleEntrypointToFile({');
		expect(source.indexOf("await embedNative(target);")).toBeLessThan(source.indexOf("await buildAndEncryptBundles();"));
	});

	it("uses the same outdir-based helper for dev encrypted bundles", async () => {
		const source = await Bun.file(devScriptPath).text();
		expect(source).toContain("async function bundleEntrypointToFile");
		expect(source).toContain('"--outdir"');
		expect(source).toContain("await bundleEntrypointToFile(entry, bundlePath, \".\");");
		expect(source).toContain('path.join(os.tmpdir(), "gjc-bundle.")');
		expect(source.indexOf('run", "embed:native')).toBeLessThan(source.indexOf("await bundleEntrypointToFile(entry, bundlePath, \".\");"));
	});

	it("keeps temporary encrypted-bundle output under os.tmpdir in both scripts", async () => {
		const [releaseSource, devSource] = await Promise.all([
			Bun.file(releaseScriptPath).text(),
			Bun.file(devScriptPath).text(),
		]);
		expect(releaseSource).toContain('path.join(os.tmpdir(), "gjc-bundle.")');
		expect(devSource).toContain('path.join(os.tmpdir(), "gjc-bundle.")');
	});
});
