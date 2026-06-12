import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	captureRenderGolden,
	captureTexts,
	RENDER_GOLDEN_FIXTURES,
	readRenderGolden,
	renderGoldenDir,
	writeRenderGolden,
} from "./render-goldens";

function lines(text: string): string[] {
	return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

async function expectGoldenHashesMatchFiles(fixtureName: string): Promise<void> {
	const dir = renderGoldenDir(fixtureName);
	const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as {
		artifacts: Record<string, { file: string; sha256: string }>;
	};
	for (const artifact of Object.values(meta.artifacts)) {
		const bytes = await readFile(join(dir, artifact.file));
		const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
		expect(digest).toBe(artifact.sha256);
	}
}

describe("TUI render goldens", () => {
	for (const fixture of RENDER_GOLDEN_FIXTURES) {
		it(`${fixture.name} matches viewport, scrollback, and terminal byte log`, async () => {
			const capture = await captureRenderGolden(fixture);
			const { viewportText, scrollbackText } = captureTexts(capture);

			if (Bun.env.UPDATE_GOLDENS === "1") {
				await writeRenderGolden(capture);
			}

			const golden = await readRenderGolden(fixture.name);
			expect(lines(viewportText)).toEqual(lines(golden.viewportText));
			expect(lines(scrollbackText)).toEqual(lines(golden.scrollbackText));
			expect(capture.writeLog).toEqual(golden.writeLog);
			expect(capture.meta).toEqual(golden.meta);
			await expectGoldenHashesMatchFiles(fixture.name);
		});
	}
});
