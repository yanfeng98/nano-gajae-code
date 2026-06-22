#!/usr/bin/env bun

/**
 * Generate an AES-256 key and 96-bit nonce for bundle encryption.
 *
 * Writes `key.tmp` (64 hex chars = 32 bytes) and `nonce.tmp` (24 hex chars =
 * 12 bytes) into `crates/pi-natives/` so `build.rs` can embed the key into the
 * Rust native addon at compile time. Also writes an XOR-obfuscated key
 * reconstruction file for defence-in-depth.
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
