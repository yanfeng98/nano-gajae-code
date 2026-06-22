#!/usr/bin/env bun

import * as path from "node:path";
import * as fs from "node:fs";

const repoRoot = path.join(import.meta.dir, "..", "..", "..");
const packageDir = path.join(repoRoot, "packages", "coding-agent");
const outputPath = path.join(packageDir, "dist", "gjc");
const nativeDir = path.join(repoRoot, "packages", "natives", "native");
const isEncrypt = process.argv.includes("--encrypt");

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

async function stageWorkspaceNativeAddons(): Promise<void> {
	await Array.fromAsync(new Bun.Glob("pi_natives.*.node").scan({ cwd: nativeDir }), async filename => {
		await Bun.write(path.join(packageDir, "dist", filename), Bun.file(path.join(nativeDir, filename)));
	});
}

// ── Encrypted build ──────────────────────────────────────────────────────

const ENCRYPTED_BUNDLES: Record<string, string> = {
	"enc-main.bin": "./packages/coding-agent/src/cli.ts",
	"enc-sync-worker.bin": "./packages/stats/src/sync-worker.ts",
	"enc-tab-worker.bin": "./packages/coding-agent/src/tools/browser/tab-worker-entry.ts",
	"enc-eval-worker.bin": "./packages/coding-agent/src/eval/js/worker-entry.ts",
};

async function buildEncrypted(): Promise<void> {
	console.log("Building encrypted binary...");

	// 1. Generate encryption key
	await runCommand(["bun", "scripts/generate-key.ts"], repoRoot);

	// 2. Build native addon with key baked in
	await runCommand(["bun", "run", "build:native"], repoRoot);

	try {
		// 3. Build and encrypt each bundle
		const distDir = path.join(packageDir, "dist");
		fs.mkdirSync(distDir, { recursive: true });

		for (const [encName, entry] of Object.entries(ENCRYPTED_BUNDLES)) {
			const bundlePath = path.join(distDir, `${encName}.mjs`);
			const encPath = path.join(distDir, encName);

			console.log(`Bundling ${entry}...`);
			await runCommand(
				["bun", "build", "--minify", "--target", "bun", "--format", "esm", "--root", ".", "--external", "mupdf", entry, "--outfile", bundlePath],
				repoRoot,
			);

			console.log(`Encrypting ${bundlePath}...`);
			await runCommand(["bun", "scripts/encrypt-bundle.ts", bundlePath, encPath], repoRoot);

			// Remove intermediate plaintext bundle
			fs.rmSync(bundlePath, { force: true });
		}

		// 4. Embed native addon
		await runCommand(["bun", "--cwd=packages/natives", "run", "embed:native"], repoRoot);

		try {
			// 5. Compile with launcher entry point
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
					"./packages/coding-agent/src/cli-launcher.ts",
					"--outfile",
					"packages/coding-agent/dist/gjc",
				],
				repoRoot,
				Bun.env,
			);

			await stageWorkspaceNativeAddons();

				// 6. Wrap as self-extracting portable binary (CentOS 7 glibc 2.17 compat)
				const gjcBinary = path.join(repoRoot, "packages", "coding-agent", "dist", "gjc");
				const glibcDir = path.join(repoRoot, "packages", "coding-agent", "dist", "glibc-bundled");
				fs.mkdirSync(glibcDir, { recursive: true });
				await runCommand(["bun", "scripts/bundle-glibc.ts", glibcDir], repoRoot);
				await runCommand(["bun", "scripts/make-portable.ts", gjcBinary, glibcDir, gjcBinary], repoRoot);
				fs.rmSync(glibcDir, { recursive: true, force: true });
		} finally {
			await runCommand(["bun", "--cwd=packages/natives", "run", "embed:native", "--reset"], repoRoot);
		}
	} finally {
		// Cleanup
		const keyTmp = path.join(repoRoot, "crates", "pi-natives", "key.tmp");
		fs.rmSync(keyTmp, { force: true });
		for (const encName of Object.keys(ENCRYPTED_BUNDLES)) {
			fs.rmSync(path.join(packageDir, "dist", encName), { force: true });
			fs.rmSync(path.join(packageDir, "dist", `${encName}.mjs`), { force: true });
		}
	}
}

// ── Standard (non-encrypted) build ────────────────────────────────────────

async function main(): Promise<void> {
	if (isEncrypt) {
		await buildEncrypted();
		return;
	}

	// Original non-encrypted dev build
	await runCommand(["bun", "--cwd=../stats", "scripts/generate-client-bundle.ts", "--generate"]);
	try {
		await runCommand(["bun", "--cwd=../natives", "run", "embed:native"]);
		try {
			const buildEnv = Bun.env;
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
					"--external",
					"mupdf",
					"--root",
					"../..",
					"./src/cli.ts",
					"../stats/src/sync-worker.ts",
					"./src/tools/browser/tab-worker-entry.ts",
					"./src/eval/js/worker-entry.ts",
					"--outfile",
					"dist/gjc",
				],
				buildEnv,
			);

			await stageWorkspaceNativeAddons();

				// 6. Wrap as self-extracting portable binary (CentOS 7 glibc 2.17 compat)
				const gjcBinary = path.join(repoRoot, "packages", "coding-agent", "dist", "gjc");
				const glibcDir = path.join(repoRoot, "packages", "coding-agent", "dist", "glibc-bundled");
				fs.mkdirSync(glibcDir, { recursive: true });
				await runCommand(["bun", "scripts/bundle-glibc.ts", glibcDir], repoRoot);
				await runCommand(["bun", "scripts/make-portable.ts", gjcBinary, glibcDir, gjcBinary], repoRoot);
				fs.rmSync(glibcDir, { recursive: true, force: true });
		} finally {
			await runCommand(["bun", "--cwd=../natives", "run", "embed:native", "--reset"]);
		}
	} finally {
		await runCommand(["bun", "--cwd=../stats", "scripts/generate-client-bundle.ts", "--reset"]);
	}
}

await main();
