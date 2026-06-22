#!/usr/bin/env bun

/**
 * Bundle glibc runtime libraries from the build host into a directory.
 *
 * The bundled glibc is paired with a `gjc` binary at runtime so CentOS 7
 * (glibc 2.17) can run binaries that require glibc >= 2.31 — the kernel 3.10
 * on CentOS 7 is new enough; only the userspace libc is too old.
 *
 * Usage: bundle-glibc.ts <output-dir>
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LIBC_DIR = "/lib/x86_64-linux-gnu";

const REQUIRED_LIBS = [
	"ld-linux-x86-64.so.2",
	"libc.so.6",
	"libm.so.6",
	"libpthread.so.0",
	"libdl.so.2",
	// NSS modules — glibc dlopen()s these at runtime for DNS / host / passwd
	"libnss_dns.so.2",
	"libnss_files.so.2",
	"libresolv.so.2",
] as const;

function main(): void {
	const outDir = process.argv[2];
	if (!outDir) {
		throw new Error("Usage: bundle-glibc.ts <output-dir>");
	}

	fs.mkdirSync(outDir, { recursive: true });

	for (const lib of REQUIRED_LIBS) {
		const src = path.join(LIBC_DIR, lib);
		if (!fs.existsSync(src)) {
			throw new Error(`Library not found on build host: ${src}`);
		}
		fs.copyFileSync(src, path.join(outDir, lib));
		console.log(`Bundled ${lib}`);
	}

	// ld must be executable at runtime
	fs.chmodSync(path.join(outDir, "ld-linux-x86-64.so.2"), 0o755);

	const totalSize = REQUIRED_LIBS.reduce(
		(sum, lib) => sum + fs.statSync(path.join(outDir, lib)).size,
		0,
	);
	console.log(`Total glibc bundle: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
}

main();
