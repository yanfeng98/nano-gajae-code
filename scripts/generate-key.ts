#!/usr/bin/env bun

/**
 * Generate a per-build AES-256 master key for bundle encryption.
 *
 * The master key is later expanded into bundle-specific AES keys by
 * `scripts/bundle-crypto.ts` / `crates/pi-natives/src/decrypt.rs`, so swapping
 * encrypted bundles across roles no longer reuses the exact same key stream.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const REPO_ROOT = path.join(import.meta.dir, "..");
const NATIVES_DIR = path.join(REPO_ROOT, "crates", "pi-natives");
const KEY_TMP = path.join(NATIVES_DIR, "key.tmp");

function main(): void {
	const key = crypto.getRandomValues(new Uint8Array(32));
	fs.writeFileSync(KEY_TMP, Buffer.from(key).toString("hex"));
	console.log("Generated encryption key for native addon embedding.");
}

main();
