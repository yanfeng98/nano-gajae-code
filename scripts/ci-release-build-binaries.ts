#!/usr/bin/env bun

import * as fs from "node:fs/promises";
import * as path from "node:path";

interface BinaryTarget {
	id: string;
	platform: string;
	arch: string;
	target: string;
	outfile: string;
}

const repoRoot = path.join(import.meta.dir, "..");
const binariesDir = path.join(repoRoot, "packages", "coding-agent", "binaries");
const entrypoint = "./packages/coding-agent/src/cli.ts";
// Encrypted-build launcher entry point
const encryptedEntrypoint = "./packages/coding-agent/src/cli-launcher.ts";
// Worker entrypoints. Bun's `--compile` static analyzer discovers the
// literal in `new Worker("…", …)` at each spawn site, but only actually
// emits the worker into the bunfs root when it is also listed here as an
// explicit additional entry. Paths are repo-root-relative (matching
// `--root .` below) so the workers land at
// `/$bunfs/root/packages/<pkg>/src/<worker>.js`, which is exactly what the
// literals at the spawn sites resolve to. Keep this in sync with the dev
// script at `packages/coding-agent/scripts/build-binary.ts`; the
// `issue-1150-repro` test pins both halves of the contract.
const workerEntrypoints = [
	"./packages/stats/src/sync-worker.ts",
	"./packages/coding-agent/src/tools/browser/tab-worker-entry.ts",
	"./packages/coding-agent/src/eval/js/worker-entry.ts",
];
const isDryRun = process.argv.includes("--dry-run");
const isNoEncrypt = process.argv.includes("--no-encrypt");

const targets: BinaryTarget[] = [
	{
		id: "linux-x64",
		platform: "linux",
		arch: "x64",
		target: "bun-linux-x64-baseline",
		outfile: "packages/coding-agent/binaries/gjc-linux-x64",
	},
	{
		id: "linux-arm64",
		platform: "linux",
		arch: "arm64",
		target: "bun-linux-arm64",
		outfile: "packages/coding-agent/binaries/gjc-linux-arm64",
	},
];

function parseRequestedTargets(): Set<string> | null {
	const flagIndex = process.argv.findIndex(arg => arg === "--targets");
	const flagValue =
		flagIndex >= 0
			? process.argv[flagIndex + 1]
			: process.argv.find(arg => arg.startsWith("--targets="))?.split("=", 2)[1] ?? Bun.env.RELEASE_TARGETS;

	if (!flagValue) {
		return null;
	}

	return new Set(
		flagValue
			.split(",")
			.map(value => value.trim())
			.filter(Boolean),
	);
}

function hostDefaultTargets(): BinaryTarget[] {
	return targets.filter(target => target.platform === process.platform && target.arch === process.arch);
}

function isHostRunnableTarget(target: BinaryTarget): boolean {
	return hostDefaultTargets().some(hostTarget => hostTarget.id === target.id);
}

async function runCommand(command: string[], cwd: string, env: NodeJS.ProcessEnv = Bun.env): Promise<void> {
	const proc = Bun.spawn(command, {
		cwd,
		env,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
	}
}

async function embedNative(target: BinaryTarget): Promise<void> {
	if (isDryRun) {
		console.log(`DRY RUN bun --cwd=packages/natives run embed:native [${target.platform}/${target.arch}]`);
		return;
	}

	await runCommand(["bun", "--cwd=packages/natives", "run", "embed:native"], repoRoot, {
		...Bun.env,
		TARGET_PLATFORM: target.platform,
		TARGET_ARCH: target.arch,
	});
}

async function buildBinary(target: BinaryTarget): Promise<void> {
	console.log(`Building ${target.outfile}...`);
	await embedNative(target);
	if (isDryRun) {
		console.log(`DRY RUN bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv --no-compile-autoload-tsconfig --no-compile-autoload-package-json --keep-names --define process.env.PI_COMPILED="true" --root . --external mupdf --target=${target.target} ${entrypoint} ${workerEntrypoints.join(" ")} --outfile ${target.outfile}`);
		return;
	}

	await runCommand(
		[
			"bun",
			"build",
			"--compile",
			"--no-compile-autoload-bunfig",
			"--no-compile-autoload-dotenv",
			"--no-compile-autoload-tsconfig",
			"--no-compile-autoload-package-json",
			"--keep-names",
			"--define",
			'process.env.PI_COMPILED="true"',
			"--root",
			".",
			"--external",
			"mupdf",
			"--target",
			target.target,
			entrypoint,
			...workerEntrypoints,
			"--outfile",
			target.outfile,
		],
		repoRoot,
		Bun.env,
	);
}

// ── Encrypted build steps ─────────────────────────────────────────────────

async function generateKey(): Promise<void> {
	if (isDryRun) {
		console.log("DRY RUN bun scripts/generate-key.ts");
		return;
	}
	console.log("Generating AES-256 encryption key...");
	await runCommand(["bun", "scripts/generate-key.ts"], repoRoot);
}

async function buildNativeWithKey(target: BinaryTarget): Promise<void> {
	if (isDryRun) {
		console.log(`DRY RUN bun run build:native [${target.platform}/${target.arch}]`);
		return;
	}
	console.log("Building native addon with embedded decryption key...");
	await runCommand(["bun", "run", "build:native"], repoRoot, {
		...Bun.env,
		TARGET_PLATFORM: target.platform,
		TARGET_ARCH: target.arch,
	});
}

/** Bundle definitions: output filename → entry point */
const ENCRYPTED_BUNDLES: Record<string, string> = {
	"enc-main.bin": "./packages/coding-agent/src/cli.ts",
	"enc-sync-worker.bin": "./packages/stats/src/sync-worker.ts",
	"enc-tab-worker.bin": "./packages/coding-agent/src/tools/browser/tab-worker-entry.ts",
	"enc-eval-worker.bin": "./packages/coding-agent/src/eval/js/worker-entry.ts",
};

async function buildAndEncryptBundles(): Promise<void> {
	const distDir = path.join(repoRoot, "packages", "coding-agent", "dist");
	await fs.mkdir(distDir, { recursive: true });

	for (const [encName, entry] of Object.entries(ENCRYPTED_BUNDLES)) {
		const bundlePath = path.join(distDir, `${encName}.mjs`);
		const encPath = path.join(distDir, encName);

			if (isDryRun) {
				console.log(`DRY RUN bun build ${entry} --outfile ${bundlePath}`);
				console.log(`DRY RUN bun scripts/encrypt-bundle.ts ${bundlePath} ${encPath} ${encName}`);
				continue;
			}

		console.log(`Bundling ${entry} → ${bundlePath}...`);
		await runCommand(
			[
				"bun",
				"build",
				"--minify",
				"--target",
				"bun",
				"--format",
				"esm",
				"--root",
				".",
				"--external",
				"mupdf",
				entry,
				"--outfile",
				bundlePath,
			],
			repoRoot,
			Bun.env,
		);

			console.log(`Encrypting ${bundlePath} → ${encPath}...`);
			await runCommand(
				["bun", "scripts/encrypt-bundle.ts", bundlePath, encPath, encName],
				repoRoot,
			);

		// Remove the intermediate plaintext bundle
		await fs.rm(bundlePath, { force: true });
	}
}

async function buildEncryptedBinary(target: BinaryTarget): Promise<void> {
	console.log(`Building encrypted ${target.outfile}...`);

	// Embed native addon (contains decrypt logic)
	await embedNative(target);

	if (isDryRun) {
		console.log(
			`DRY RUN bun build --compile --minify --no-compile-autoload-bunfig --no-compile-autoload-dotenv --no-compile-autoload-tsconfig --no-compile-autoload-package-json --keep-names --define process.env.PI_COMPILED="true" --define process.env.PI_ENCRYPTED="true" --root . --external mupdf --target=${target.target} ${encryptedEntrypoint} --outfile ${target.outfile}`,
		);
		return;
	}

	await runCommand(
		[
			"bun",
			"build",
			"--compile",
			"--minify",
			"--no-compile-autoload-bunfig",
			"--no-compile-autoload-dotenv",
			"--no-compile-autoload-tsconfig",
			"--no-compile-autoload-package-json",
			"--keep-names",
			"--define",
			'process.env.PI_COMPILED="true"',
			"--define",
			'process.env.PI_ENCRYPTED="true"',
			"--root",
			".",
			"--external",
			"mupdf",
			"--target",
			target.target,
			encryptedEntrypoint,
			"--outfile",
			target.outfile,
		],
		repoRoot,
		Bun.env,
	);
}

async function generateBundle(): Promise<void> {
	if (isDryRun) {
		console.log("DRY RUN bun --cwd=packages/stats scripts/generate-client-bundle.ts --generate");
		return;
	}
	await runCommand(["bun", "--cwd=packages/stats", "scripts/generate-client-bundle.ts", "--generate"], repoRoot);
}

async function resetArtifacts(): Promise<void> {
	if (isDryRun) {
		console.log("DRY RUN bun --cwd=packages/natives run embed:native --reset");
		console.log("DRY RUN bun --cwd=packages/stats scripts/generate-client-bundle.ts --reset");
		return;
	}
	await runCommand(["bun", "--cwd=packages/natives", "run", "embed:native", "--reset"], repoRoot);
	await runCommand(["bun", "--cwd=packages/stats", "scripts/generate-client-bundle.ts", "--reset"], repoRoot);
}

async function cleanupEncryptArtifacts(): Promise<void> {
	const keyTmp = path.join(repoRoot, "crates", "pi-natives", "key.tmp");
	const distDir = path.join(repoRoot, "packages", "coding-agent", "dist");
	const encryptedFiles = Object.keys(ENCRYPTED_BUNDLES).map(f => path.join(distDir, f));
	// Also clean up any stray plaintext .mjs bundles
	const mjsFiles = Object.keys(ENCRYPTED_BUNDLES).map(f => path.join(distDir, `${f}.mjs`));

	if (isDryRun) {
		console.log(`DRY RUN rm ${keyTmp}`);
		for (const f of [...encryptedFiles, ...mjsFiles]) {
			console.log(`DRY RUN rm ${f}`);
		}
		return;
	}
	await fs.rm(keyTmp, { force: true });
	for (const f of [...encryptedFiles, ...mjsFiles]) {
		await fs.rm(f, { force: true });
	}
}

async function makePortableBinary(target: BinaryTarget): Promise<void> {
	// CentOS 7 portability only applies to linux-x64
	if (target.id !== "linux-x64") return;

	const gjcBinary = path.join(repoRoot, target.outfile);
	if (isDryRun) {
		console.log(`DRY RUN bun scripts/bundle-glibc.ts ${path.join(repoRoot, "packages", "coding-agent", "dist", "glibc-bundled")}`);
		console.log(`DRY RUN bun scripts/make-portable.ts ${gjcBinary} <glibc-dir> ${gjcBinary}`);
		return;
	}
	if (!(await fs.stat(gjcBinary).catch(() => null))) {
		throw new Error(`Binary not found: ${gjcBinary}`);
	}

	// Bundle glibc from the build host
	const glibcDir = path.join(repoRoot, "packages", "coding-agent", "dist", "glibc-bundled");
	await fs.mkdir(glibcDir, { recursive: true });
	await runCommand(["bun", "scripts/bundle-glibc.ts", glibcDir], repoRoot);

	// Wrap as self-extracting shell archive
	await runCommand(
		["bun", "scripts/make-portable.ts", gjcBinary, glibcDir, gjcBinary],
		repoRoot,
	);

	// Cleanup glibc staging dir
	await fs.rm(glibcDir, { recursive: true, force: true });
}

async function validateBuiltBinary(target: BinaryTarget): Promise<void> {
	if (isDryRun) {
		console.log(`DRY RUN validate ${target.outfile} with --version/--help/stats --help/--smoke-test`);
		return;
	}
	if (!isHostRunnableTarget(target)) {
		console.log(`Skipping runtime validation for ${target.id} (host is ${process.platform}-${process.arch})`);
		return;
	}

	const binaryPath = path.join(repoRoot, target.outfile);
	const runtimeRoot = await fs.mkdtemp("/tmp/gjc-release-smoke.");
	const homeDir = path.join(runtimeRoot, "home");
	const xdgDir = path.join(runtimeRoot, "xdg");
	await fs.mkdir(homeDir, { recursive: true });
	await fs.mkdir(xdgDir, { recursive: true });

	const runtimeEnv: NodeJS.ProcessEnv = {
		...Bun.env,
		HOME: homeDir,
		XDG_DATA_HOME: xdgDir,
	};

	try {
		console.log(`Validating ${target.outfile}...`);
		await runCommand([binaryPath, "--version"], repoRoot, runtimeEnv);
		await runCommand([binaryPath, "--help"], repoRoot, runtimeEnv);
		await runCommand([binaryPath, "stats", "--help"], repoRoot, runtimeEnv);
		await runCommand([binaryPath, "--smoke-test"], repoRoot, runtimeEnv);
	} finally {
		await fs.rm(runtimeRoot, { recursive: true, force: true });
	}
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	// --list-targets: print target IDs and exit
	if (process.argv.includes("--list-targets")) {
		for (const t of targets) {
			console.log(`${t.id} (${t.platform}-${t.arch}, ${t.target}) -> ${t.outfile}`);
		}
		return;
	}

	const requestedTargets = parseRequestedTargets();
	const selectedTargets = requestedTargets
		? targets.filter(target => requestedTargets.has(target.id))
		: targets; // Default: build all targets

	if (requestedTargets) {
		const unknownTargets = [...requestedTargets].filter(
			requestedTarget => !targets.some(target => target.id === requestedTarget),
		);
		if (unknownTargets.length > 0) {
			throw new Error(`Unknown release target(s): ${unknownTargets.join(", ")}`);
		}
	}

	if (selectedTargets.length === 0) {
		throw new Error("No release targets selected.");
	}

	await fs.mkdir(binariesDir, { recursive: true });
	await generateBundle();

	try {
		if (!isNoEncrypt) {
			// ── Encrypted build pipeline ─────────────────────────────────
			await generateKey();

			// Bundle + encrypt happens once (same JS bundles for all targets)
			await buildAndEncryptBundles();

				for (const target of selectedTargets) {
					// Build native addon with key baked in (per-target arch/variant)
					await buildNativeWithKey(target);

					// Compile with launcher entry point (encrypted files embedded as assets)
					await buildEncryptedBinary(target);

					// Wrap as self-extracting portable binary (CentOS 7 glibc 2.17 compat)
					await makePortableBinary(target);
					await validateBuiltBinary(target);
				}

			await cleanupEncryptArtifacts();
			} else {
				// ── Standard (non-encrypted) build pipeline ──────────────────
				for (const target of selectedTargets) {
					await buildBinary(target);
					await validateBuiltBinary(target);
				}
			}
	} finally {
		await resetArtifacts();
	}
}

await main();
