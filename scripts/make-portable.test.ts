import { describe, expect, it } from "bun:test";
import * as path from "node:path";

describe("make-portable wrapper script", () => {
	it("exits after launching the extracted binary instead of parsing the archive payload", async () => {
		const scriptPath = path.join(import.meta.dir, "make-portable.ts");
		const source = await Bun.file(scriptPath).text();

		expect(source).toContain('"exit $?"');
		expect(source.indexOf('LD_LIBRARY_PATH="$TMPDIR/glibc" "$TMPDIR/glibc/ld-linux-x86-64.so.2" "$TMPDIR/gjc" "$@"')).toBeLessThan(
			source.indexOf('"exit $?"'),
		);
	});
});
