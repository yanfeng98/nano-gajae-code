#!/usr/bin/env bun

/**
 * Minimal launcher for encrypted-bundle builds.
 *
 * `bun build --compile` embeds four encrypted bundles via static file imports.
 * At runtime this launcher:
 * 1. Reads each encrypted bundle
 * 2. Calls the Rust native `decryptBundle()` to decrypt with the baked-in key
 * 3. Writes the plaintext JS files to a locked-down `/dev/shm` directory
 * 4. Dynamic-imports the main bundle, then immediately unlinks it (module
 *    already in memory — no other process can read it after unlink)
 * 5. Worker bundles are unlinked on exit
 *
 * This file is the ONLY plaintext JS in the compiled binary (~55 lines).
 */

import encMain from "../dist/enc-main.bin" with { type: "file" };
import encSyncWorker from "../dist/enc-sync-worker.bin" with { type: "file" };
import encTabWorker from "../dist/enc-tab-worker.bin" with { type: "file" };
import encEvalWorker from "../dist/enc-eval-worker.bin" with { type: "file" };
import * as fs from "node:fs";
import * as path from "node:path";

// ── Decrypt via Rust native addon ─────────────────────────────────────────

const { decryptBundle } = await import("../../natives/native/index.js");

// ── Write decrypted bundles to locked-down tmpfs ──────────────────────────

// Prefer /dev/shm (tmpfs, never on persistent disk). Fall back to /tmp on
// systems where /dev/shm is unavailable (rare, but possible in containers).
const tmpfsBase = fs.existsSync("/dev/shm") ? "/dev/shm" : "/tmp";
const shmDir = path.join(tmpfsBase, `gjc-${process.pid}`);
fs.mkdirSync(shmDir, { recursive: true, mode: 0o700 });

// Decrypt and write all four bundles
const encryptedFiles: Record<string, string> = {
	"bundle.mjs": encMain,
	"worker-sync.mjs": encSyncWorker,
	"worker-tab.mjs": encTabWorker,
	"worker-eval.mjs": encEvalWorker,
};

for (const [filename, encryptedPath] of Object.entries(encryptedFiles)) {
	const encrypted = fs.readFileSync(encryptedPath);
	const decrypted: string = decryptBundle(encrypted);
	const filePath = path.join(shmDir, filename);
	fs.writeFileSync(filePath, decrypted);
	fs.chmodSync(filePath, 0o600);
}

// Tell workers where to find the decrypted bundles
process.env.PI_DECRYPTED_BUNDLE_DIR = shmDir;
// The decrypted main bundle runs from a plain file:// URL, so the usual bunfs
// marker no longer exists. Preserve the compiled-binary signal explicitly so
// the natives loader still extracts and probes embedded addons.
process.env.PI_COMPILED = "true";

// ── Boot the application ──────────────────────────────────────────────────

try {
	await import(`file://${shmDir}/bundle.mjs`);

	// The main bundle is now loaded into V8's module cache. Unlink it
	// immediately — on Linux the inode stays alive as long as the module
	// holds a reference, but no other process can discover the plaintext.
	try { fs.rmSync(path.join(shmDir, "bundle.mjs"), { force: true }); } catch {}
} finally {
	// Clean up worker bundles (and the directory) on exit.
	process.on("exit", () => {
		try {
			fs.rmSync(shmDir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup
		}
	});
}
