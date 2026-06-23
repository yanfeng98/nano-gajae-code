#!/usr/bin/env bun

/**
 * Wrap a `gjc` binary as a self-extracting shell archive that bundles glibc
 * and runs on CentOS 7.
 *
 * The output is a single file: a POSIX shell script concatenated with a
 * tar.gz payload. On execution the script extracts the payload to a unique
 * temp directory, invokes the real `gjc` via the bundled ld.so (which links
 * against the bundled glibc 2.35, bypassing the system glibc 2.17), and
 * cleans up on exit.
 *
 * Usage: make-portable.ts <gjc-binary> <glibc-dir> <output-file>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { $ } from "bun";

// Build the wrapper line-by-line to avoid template-literal indentation leaking
// into the shell script. The __ARCHIVE__ marker MUST start at column 0 or the
// sed regex won't find it.
const WRAPPER_SCRIPT = [
	"#!/bin/sh",
	"# gjc - self-extracting portable binary (CentOS 7 compatible)",
	"set -e",
	'TMPDIR=$(mktemp -d /tmp/gjc-XXXXXX)',
	'trap \'rm -rf "$TMPDIR"\' EXIT',
	'sed \'1,/^__ARCHIVE__$/d\' "$0" | tar xz -C "$TMPDIR"',
	'LD_LIBRARY_PATH="$TMPDIR/glibc" "$TMPDIR/glibc/ld-linux-x86-64.so.2" "$TMPDIR/gjc" "$@"',
	"exit $?",
].join("\n") + "\n__ARCHIVE__\n";

interface MakePortableOptions {
	gjcPath: string;
	glibcDir: string;
	outputPath: string;
}

async function makePortable(options: MakePortableOptions): Promise<void> {
	const { gjcPath, glibcDir, outputPath } = options;

	if (!fs.existsSync(gjcPath)) {
		throw new Error(`gjc binary not found: ${gjcPath}`);
	}
	if (!fs.existsSync(path.join(glibcDir, "ld-linux-x86-64.so.2"))) {
		throw new Error(`glibc bundle not found in: ${glibcDir}`);
	}

	// Create a tmpdir for staging the payload
	const stageDir = fs.mkdtempSync("/tmp/gjc-portable-");
	const payloadDir = path.join(stageDir, "payload");
	fs.mkdirSync(path.join(payloadDir, "glibc"), { recursive: true });

	// Copy gjc binary
	fs.copyFileSync(gjcPath, path.join(payloadDir, "gjc"));
	fs.chmodSync(path.join(payloadDir, "gjc"), 0o755);

	// Copy glibc bundle
	for (const entry of fs.readdirSync(glibcDir, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		fs.copyFileSync(
			path.join(glibcDir, entry.name),
			path.join(payloadDir, "glibc", entry.name),
		);
	}

	// Create tar.gz of the payload
	const tarPath = path.join(stageDir, "payload.tar.gz");
	await $`tar czf ${tarPath} -C ${payloadDir} gjc glibc`.quiet();

	// Concatenate: wrapper script + payload
	const wrapper = Buffer.from(WRAPPER_SCRIPT, "utf-8");
	const payload = fs.readFileSync(tarPath);

	const fd = fs.openSync(outputPath, "w");
	fs.writeSync(fd, wrapper);
	fs.writeSync(fd, payload);
	fs.closeSync(fd);

	fs.chmodSync(outputPath, 0o755);

	// Cleanup
	fs.rmSync(stageDir, { recursive: true, force: true });

	const totalSize = wrapper.length + payload.length;
	console.log(`Portable gjc: ${outputPath} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
}

const gjcPath = process.argv[2];
const glibcDir = process.argv[3];
const outputPath = process.argv[4];

if (!gjcPath || !glibcDir || !outputPath) {
	throw new Error("Usage: make-portable.ts <gjc-binary> <glibc-dir> <output-file>");
}

await makePortable({ gjcPath, glibcDir, outputPath });
