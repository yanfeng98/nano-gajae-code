/** Open a URL or file path in the default browser/application. Best-effort, never throws. */
export function openPath(urlOrPath: string): void {
	try {
		Bun.spawn(["xdg-open", urlOrPath], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
	} catch {
		// Best-effort: browser opening is non-critical
	}
}
