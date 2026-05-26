#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";

type PackageInventory = {
	bins: string[];
	name: string;
	path: string;
	version?: string;
};

type VisibleDefinition = {
	name: string;
	path: string;
	type: "agent" | "command" | "rule" | "skill";
};

type LegacyHit = {
	allowlist?: string;
	line: number;
	path: string;
	token: string;
};

const repoRoot = process.cwd();

const expectedVisibleDefinitions = ["deep-interview", "ralplan", "team", "ultragoal"] as const;
const expectedPackageScope = "@gajae-code/";
const expectedCliBins = ["gjc", "gjc-stats", "gjc-swarm"] as const;

const ignoredDirs = new Set([".git", "node_modules", "dist", "build", "coverage", ".turbo"]);
const ignoredFiles = new Set(["bun.lock", "Cargo.lock"]);

const legacyTokenPatterns = [
	{ token: "@oh-my-pi", pattern: /@oh-my-pi\b/gi },
	{ token: "oh-my-pi", pattern: /\boh-my-pi\b/gi },
	{ token: "omp", pattern: /\bomp\b/gi },
];

const legacyAllowlist = [
	{
		name: "attribution-and-license",
		path: /(^LICENSE$|(^|\/)(CHANGELOG|NOTICE|AUTHORS)\.md$)/,
		rationale: "Historical attribution may mention upstream OMP/Pi names.",
	},
	{
		name: "compatibility-docs",
		path: /^docs\/(environment-variables|python-repl|task-agent-discovery)\.md$/,
		rationale: "Compatibility docs may describe retained legacy env/protocol names.",
	},
	{
		name: "runtime-compatibility-internals",
		path: /^packages\/(coding-agent|agent|ai|tui|utils|stats|swarm-extension|natives)\//,
		rationale: "Runtime internals may retain legacy aliases while user-facing copy is rebranded.",
	},
	{
		name: "repo-shipped-skill-provider-path",
		path: /^\.omp\/skills\/(deep-interview|ralplan|team|ultragoal)\/SKILL\.md$/,
		rationale: "The .omp provider path is retained as a private compatibility container for the four visible skills.",
	},
] as const;

function readJson(file: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function relative(file: string): string {
	return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function walk(dir: string, files: string[] = []): string[] {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
			continue;
		}
		if (entry.isFile() && !ignoredFiles.has(entry.name)) files.push(path.join(dir, entry.name));
	}
	return files;
}

function listPackages(): PackageInventory[] {
	const packagesDir = path.join(repoRoot, "packages");
	if (!fs.existsSync(packagesDir)) return [];

	return fs
		.readdirSync(packagesDir, { withFileTypes: true })
		.filter(entry => entry.isDirectory())
		.map(entry => path.join(packagesDir, entry.name, "package.json"))
		.filter(file => fs.existsSync(file))
		.map(file => {
			const json = readJson(file);
			const bin = json.bin;
			const bins =
				typeof bin === "string"
					? [path.basename(String(json.name ?? ""))]
					: bin && typeof bin === "object"
						? Object.keys(bin as Record<string, unknown>)
						: [];
			return {
				bins,
				name: String(json.name ?? ""),
				path: relative(file),
				version: typeof json.version === "string" ? json.version : undefined,
			};
		});
}

function listDefinitionFiles(dir: string, type: VisibleDefinition["type"], extensions: readonly string[]) {
	const full = path.join(repoRoot, dir);
	if (!fs.existsSync(full)) return [];
	return fs
		.readdirSync(full, { withFileTypes: true })
		.filter(entry => entry.isFile() && extensions.some(extension => entry.name.endsWith(extension)))
		.map(entry => {
			const extension = extensions.find(candidate => entry.name.endsWith(candidate));
			return {
				name: extension ? entry.name.slice(0, -extension.length) : entry.name,
				path: `${dir}/${entry.name}`,
				type,
			};
		});
}

function listSkillDirs(dir: string): VisibleDefinition[] {
	const full = path.join(repoRoot, dir);
	if (!fs.existsSync(full)) return [];
	return fs
		.readdirSync(full, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && fs.existsSync(path.join(full, entry.name, "SKILL.md")))
		.map(entry => ({ name: entry.name, path: `${dir}/${entry.name}/SKILL.md`, type: "skill" }));
}

function listVisibleDefinitions(): VisibleDefinition[] {
	return [
		...listSkillDirs(".omp/skills"),
		...listSkillDirs(".codex/skills"),
		...listDefinitionFiles(".omp/agents", "agent", [".md", ".toml"]),
		...listDefinitionFiles(".codex/agents", "agent", [".md", ".toml"]),
		...listDefinitionFiles(".omp/commands", "command", [".md"]),
		...listDefinitionFiles(".codex/commands", "command", [".md"]),
		...listDefinitionFiles(".omp/rules", "rule", [".md"]),
		...listDefinitionFiles(".codex/rules", "rule", [".md"]),
	].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

function allowlistFor(filePath: string): string | undefined {
	return legacyAllowlist.find(entry => entry.path.test(filePath))?.name;
}

function scanLegacyHits(): LegacyHit[] {
	const roots = ["README.md", "docs", "packages", ".omp", ".codex", "assets", "package.json"];
	const files = roots.flatMap(root => {
		const full = path.join(repoRoot, root);
		if (!fs.existsSync(full)) return [];
		return fs.statSync(full).isDirectory() ? walk(full) : [full];
	});

	const hits: LegacyHit[] = [];
	for (const file of files) {
		const rel = relative(file);
		let content: string;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const lines = content.split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			for (const { token, pattern } of legacyTokenPatterns) {
				pattern.lastIndex = 0;
				if (pattern.test(line)) {
					hits.push({ allowlist: allowlistFor(rel), line: index + 1, path: rel, token });
				}
			}
		}
	}
	return hits;
}

const packages = listPackages();
const visibleDefinitions = listVisibleDefinitions();
const legacyHits = scanLegacyHits();
const unexpectedDefinitions = visibleDefinitions.filter(def => !expectedVisibleDefinitions.includes(def.name as (typeof expectedVisibleDefinitions)[number]));
const missingDefinitions = expectedVisibleDefinitions.filter(name => !visibleDefinitions.some(def => def.name === name));
const nonGajaePackages = packages.filter(pkg => pkg.name && !pkg.name.startsWith(expectedPackageScope));
const observedBins = [...new Set(packages.flatMap(pkg => pkg.bins))].sort();
const missingBins = expectedCliBins.filter(bin => !observedBins.includes(bin));
const unexpectedLegacyHits = legacyHits.filter(hit => !hit.allowlist);

const report = {
	allowlists: {
		cliBins: expectedCliBins,
		legacyReferences: legacyAllowlist.map(entry => ({ name: entry.name, rationale: entry.rationale })),
		packageScope: expectedPackageScope,
		visibleDefinitions: expectedVisibleDefinitions,
	},
	inventory: {
		legacyHits: {
			allowlisted: legacyHits.length - unexpectedLegacyHits.length,
			unexpected: unexpectedLegacyHits.slice(0, 50),
		},
		packages,
		visibleDefinitions,
	},
	violations: {
		missingBins,
		missingDefinitions,
		nonGajaePackages,
		unexpectedDefinitions,
		unexpectedLegacyHitCount: unexpectedLegacyHits.length,
	},
};

if (process.argv.includes("--json")) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log("Rebrand inventory allowlists");
	console.log(JSON.stringify(report.allowlists, null, 2));
	console.log("Rebrand inventory summary");
	console.log(
		JSON.stringify(
			{
				legacyHits: report.inventory.legacyHits,
				packageCount: packages.length,
				visibleDefinitions: visibleDefinitions.map(def => `${def.type}:${def.name}`),
				violations: report.violations,
			},
			null,
			2,
		),
	);
}

if (process.argv.includes("--strict")) {
	const hasViolation =
		missingBins.length > 0 ||
		missingDefinitions.length > 0 ||
		nonGajaePackages.length > 0 ||
		unexpectedDefinitions.length > 0 ||
		unexpectedLegacyHits.length > 0;
	if (hasViolation) process.exit(1);
}
