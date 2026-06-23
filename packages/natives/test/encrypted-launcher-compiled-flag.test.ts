import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("encrypted launcher compiled flag", () => {
	it("sets PI_COMPILED before loading the decrypted main bundle", async () => {
		const repoRoot = path.resolve(import.meta.dir, "../../..");
		const launcherPath = path.join(repoRoot, "packages/coding-agent/src/cli-launcher.ts");
		const source = await Bun.file(launcherPath).text();

		expect(source).toContain('process.env.PI_COMPILED = "true";');
		expect(source.indexOf('process.env.PI_DECRYPTED_BUNDLE_DIR = shmDir;')).toBeLessThan(
			source.indexOf('process.env.PI_COMPILED = "true";'),
		);
		expect(source.indexOf('process.env.PI_COMPILED = "true";')).toBeLessThan(
			source.indexOf('await import(`file://${shmDir}/bundle.mjs`);'),
		);
	});
});
