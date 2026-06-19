import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Settings } from "../src/config/settings";
import { BUILTIN_TOOLS, createTools, type ToolSession } from "../src/tools/index";

const repoRoot = path.resolve(import.meta.dir, "../../..");

const publicGuidanceFiles = [
	"packages/coding-agent/README.md",
	"docs/codebase-overview.md",
	"docs/onboarding-packet.md",
	"docs/tools/read.md",
	"packages/coding-agent/src/prompts/tools/bash.md",
	"packages/coding-agent/src/prompts/tools/irc.md",
	"packages/coding-agent/src/prompts/tools/read.md",
];

const publicDocsToolDir = path.join(repoRoot, "docs/tools");
const legacyMemoryPromptFiles = [
	"packages/coding-agent/src/prompts/tools/recall.md",
	"packages/coding-agent/src/prompts/tools/retain.md",
	"packages/coding-agent/src/prompts/tools/reflect.md",
];

function createToolSession(settings: Settings): ToolSession {
	return {
		cwd: repoRoot,
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => null,
		settings,
		isToolDiscoveryEnabled: () => true,
		getSelectedDiscoveredToolNames: () => [],
		activateDiscoveredTools: async names => names,
	} as ToolSession;
}

describe("public memory tool surface", () => {
	it("does not document public memory tool usage in public guidance", async () => {
		const offenders: string[] = [];
		const publicToolUsagePatterns = [
			/memory:\/\//i,
			/\buse\s+`?(?:recall|retain|reflect)`?/i,
			/\bexposes?\s+`?retain`?,\s+`?recall`?,\s+(?:and\s+)?`?reflect`?/i,
		];
		for (const relativePath of publicGuidanceFiles) {
			const content = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
			if (publicToolUsagePatterns.some(pattern => pattern.test(content))) {
				offenders.push(relativePath);
			}
		}
		expect(offenders).toEqual([]);
	});

});
