/**
 * Claude Code provider.
 *
 * Discovers Claude Code configuration from both project-local `.claude/` and
 * user-home `~/.claude/` directories, importing settings, skills, commands,
 * hooks, tools, MCP servers, and more into GJC sessions.
 */
import * as path from "node:path";
import { hasFsCode, tryParseJson } from "@gajae-code/utils";
import { registerProvider } from "../capability";
import { type ContextFile, contextFileCapability } from "../capability/context-file";
import { type ExtensionModule, extensionModuleCapability } from "../capability/extension-module";
import { readFile } from "../capability/fs";
import { type Hook, hookCapability } from "../capability/hook";
import { type MCPServer, mcpCapability } from "../capability/mcp";
import { type Settings, settingsCapability } from "../capability/settings";
import { type Skill, skillCapability } from "../capability/skill";
import { type SlashCommand, slashCommandCapability } from "../capability/slash-command";
import { type SystemPrompt, systemPromptCapability } from "../capability/system-prompt";
import { type CustomTool, toolCapability } from "../capability/tool";
import type { LoadContext, LoadResult } from "../capability/types";
import {
	calculateDepth,
	createSourceMeta,
	discoverExtensionModulePaths,
	expandEnvVarsDeep,
	getExtensionNameFromPath,
	loadFilesFromDir,
	scanSkillsFromDir,
} from "./helpers";

const PROVIDER_ID = "claude";
const DISPLAY_NAME = "Claude Code";
const PRIORITY = 80;
const CONFIG_DIR = ".claude";

function getProjectClaude(ctx: LoadContext): string {
	return path.join(ctx.cwd, CONFIG_DIR);
}

function getUserClaude(ctx: LoadContext): string {
	return path.join(ctx.home, CONFIG_DIR);
}

function isMissingDirectoryError(error: unknown): boolean {
	return hasFsCode(error, "ENOENT") || hasFsCode(error, "ENOTDIR");
}

function parseMcpServers(content: string | null, filePath: string, level: "user" | "project"): MCPServer[] {
	if (!content) return [];
	const json = tryParseJson<{ mcpServers?: Record<string, unknown> }>(content);
	if (!json?.mcpServers) return [];

	const mcpServers = expandEnvVarsDeep(json.mcpServers);
	return Object.entries(mcpServers).map(([name, config]) => {
		const serverConfig = config as Record<string, unknown>;
		return {
			name,
			timeout: typeof serverConfig.timeout === "number" ? serverConfig.timeout : undefined,
			command: serverConfig.command as string | undefined,
			args: serverConfig.args as string[] | undefined,
			env: serverConfig.env as Record<string, string> | undefined,
			url: serverConfig.url as string | undefined,
			headers: serverConfig.headers as Record<string, string> | undefined,
			transport: serverConfig.type as "stdio" | "sse" | "http" | undefined,
			_source: createSourceMeta(PROVIDER_ID, filePath, level),
		};
	});
}

async function loadMCPServers(ctx: LoadContext): Promise<LoadResult<MCPServer>> {
	const items: MCPServer[] = [];
	const projectBase = getProjectClaude(ctx);
	const userBase = getUserClaude(ctx);

	const allPaths = [
		{ base: projectBase, level: "project" as const },
		{ base: userBase, level: "user" as const },
	];

	for (const { base, level } of allPaths) {
		const paths = [path.join(base, ".mcp.json"), path.join(base, "mcp.json")];
		const contents = await Promise.all(paths.map(filePath => readFile(filePath)));
		for (let i = 0; i < paths.length; i++) {
			const servers = parseMcpServers(contents[i], paths[i], level);
			if (servers.length > 0) {
				items.push(...servers);
				break;
			}
		}
	}

	return { items, warnings: [] };
}

async function loadContextFiles(ctx: LoadContext): Promise<LoadResult<ContextFile>> {
	const items: ContextFile[] = [];
	const projectBase = getProjectClaude(ctx);
	const userBase = getUserClaude(ctx);

	const sources = [
		{ base: projectBase, level: "project" as const },
		{ base: userBase, level: "user" as const },
	];

	for (const { base, level } of sources) {
		const claudeMd = path.join(base, "CLAUDE.md");
		const content = await readFile(claudeMd);
		if (content !== null) {
			const depth = level === "project" ? calculateDepth(ctx.cwd, path.dirname(base), path.sep) : 0;
			items.push({
				path: claudeMd,
				content,
				level,
				depth,
				_source: createSourceMeta(PROVIDER_ID, claudeMd, level),
			});
		}
	}

	return { items, warnings: [] };
}

async function loadSkills(ctx: LoadContext): Promise<LoadResult<Skill>> {
	const projectScans: Promise<LoadResult<Skill>>[] = [];
	let current = ctx.cwd;
	while (true) {
		projectScans.push(
			scanSkillsFromDir(ctx, {
				dir: path.join(current, CONFIG_DIR, "skills"),
				providerId: PROVIDER_ID,
				level: "project",
			}),
		);
		if (current === (ctx.repoRoot ?? ctx.home)) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	// Also scan user-home .claude/skills/
	const userScan = scanSkillsFromDir(ctx, {
		dir: path.join(getUserClaude(ctx), "skills"),
		providerId: PROVIDER_ID,
		level: "user",
	});
	const allScans = [...projectScans, userScan];

	const results = await Promise.allSettled(allScans);
	const items: Skill[] = [];
	const warnings: string[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") {
			items.push(...result.value.items);
			warnings.push(...(result.value.warnings ?? []));
		} else if (!isMissingDirectoryError(result.reason)) {
			warnings.push(`Failed to scan Claude skills: ${String(result.reason)}`);
		}
	}
	return { items, warnings };
}

async function loadExtensionModules(ctx: LoadContext): Promise<LoadResult<ExtensionModule>> {
	const items: ExtensionModule[] = [];

	const sources = [
		{ base: getProjectClaude(ctx), level: "project" as const },
		{ base: getUserClaude(ctx), level: "user" as const },
	];

	for (const { base, level } of sources) {
		const extensionsDir = path.join(base, "extensions");
		const paths = await discoverExtensionModulePaths(ctx, extensionsDir);
		for (const extPath of paths) {
			items.push({
				name: getExtensionNameFromPath(extPath),
				path: extPath,
				level,
				_source: createSourceMeta(PROVIDER_ID, extPath, level),
			});
		}
	}

	return { items, warnings: [] };
}

async function loadSlashCommands(ctx: LoadContext): Promise<LoadResult<SlashCommand>> {
	const items: SlashCommand[] = [];
	const warnings: string[] = [];

	const sources = [
		{ dir: path.join(getProjectClaude(ctx), "commands"), level: "project" as const },
		{ dir: path.join(getUserClaude(ctx), "commands"), level: "user" as const },
	];

	for (const { dir, level } of sources) {
		const result = await loadFilesFromDir<SlashCommand>(ctx, dir, PROVIDER_ID, level, {
			extensions: ["md"],
			transform: (name, content, filePath, source) => ({
				name: name.replace(/\.md$/, ""),
				path: filePath,
				content,
				level,
				_source: source,
			}),
		});
		items.push(...result.items);
		warnings.push(...(result.warnings ?? []));
	}

	return { items, warnings };
}

async function loadHooks(ctx: LoadContext): Promise<LoadResult<Hook>> {
	const items: Hook[] = [];
	const warnings: string[] = [];
	const hookTypes = ["pre", "post"] as const;

	const sources = [
		{ base: getProjectClaude(ctx), level: "project" as const },
		{ base: getUserClaude(ctx), level: "user" as const },
	];

	for (const { base, level } of sources) {
		const hooksDir = path.join(base, "hooks");
		const results = await Promise.all(
			hookTypes.map(hookType =>
				loadFilesFromDir<Hook>(ctx, path.join(hooksDir, hookType), PROVIDER_ID, level, {
					transform: (name, _content, filePath, source) => ({
						name,
						path: filePath,
						type: hookType,
						tool: name.replace(/\.(sh|bash|zsh|fish)$/, ""),
						level,
						_source: source,
					}),
				}),
			),
		);
		for (const result of results) {
			items.push(...result.items);
			warnings.push(...(result.warnings ?? []));
		}
	}

	return { items, warnings };
}

async function loadTools(ctx: LoadContext): Promise<LoadResult<CustomTool>> {
	const items: CustomTool[] = [];
	const warnings: string[] = [];

	const sources = [
		{ dir: path.join(getProjectClaude(ctx), "tools"), level: "project" as const },
		{ dir: path.join(getUserClaude(ctx), "tools"), level: "user" as const },
	];

	for (const { dir, level } of sources) {
		const result = await loadFilesFromDir<CustomTool>(ctx, dir, PROVIDER_ID, level, {
			transform: (name, _content, filePath, source) => {
				const toolName = name.replace(/\.(ts|js|sh|bash|py)$/, "");
				return {
					name: toolName,
					path: filePath,
					description: `${toolName} custom tool`,
					level,
					_source: source,
				};
			},
		});
		items.push(...result.items);
		warnings.push(...(result.warnings ?? []));
	}

	return { items, warnings };
}

async function loadSystemPrompts(ctx: LoadContext): Promise<LoadResult<SystemPrompt>> {
	const items: SystemPrompt[] = [];

	const sources = [
		{ base: getProjectClaude(ctx), level: "project" as const },
		{ base: getUserClaude(ctx), level: "user" as const },
	];

	for (const { base, level } of sources) {
		const systemMd = path.join(base, "SYSTEM.md");
		const content = await readFile(systemMd);
		if (content !== null) {
			items.push({
				path: systemMd,
				content,
				level,
				_source: createSourceMeta(PROVIDER_ID, systemMd, level),
			});
		}
	}

	return { items, warnings: [] };
}

async function loadSettings(ctx: LoadContext): Promise<LoadResult<Settings>> {
	const items: Settings[] = [];
	const warnings: string[] = [];

	const sources = [
		{ base: getProjectClaude(ctx), level: "project" as const },
		{ base: getUserClaude(ctx), level: "user" as const },
	];

	for (const { base, level } of sources) {
		const settingsJson = path.join(base, "settings.json");
		const content = await readFile(settingsJson);
		if (content) {
			const data = tryParseJson<Record<string, unknown>>(content);
			if (data) {
				items.push({
					path: settingsJson,
					data,
					level,
					_source: createSourceMeta(PROVIDER_ID, settingsJson, level),
				} as Settings);
			} else {
				warnings.push(`Failed to parse JSON in ${settingsJson}`);
			}
		}
	}

	return { items, warnings };
}

registerProvider<MCPServer>(mcpCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load MCP servers from .claude/mcp.json (project and user)",
	priority: PRIORITY,
	load: loadMCPServers,
});

registerProvider<ContextFile>(contextFileCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load CLAUDE.md files from .claude/ directories (project and user)",
	priority: PRIORITY,
	load: loadContextFiles,
});

registerProvider<Skill>(skillCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load skills from .claude/skills/ (project and user)",
	priority: PRIORITY,
	load: loadSkills,
});

registerProvider<ExtensionModule>(extensionModuleCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load extension modules from .claude/extensions (project and user)",
	priority: PRIORITY,
	load: loadExtensionModules,
});

registerProvider<SlashCommand>(slashCommandCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load slash commands from .claude/commands/*.md (project and user)",
	priority: PRIORITY,
	load: loadSlashCommands,
});

registerProvider<Hook>(hookCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load hooks from .claude/hooks/pre/ and .claude/hooks/post/ (project and user)",
	priority: PRIORITY,
	load: loadHooks,
});

registerProvider<CustomTool>(toolCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load custom tools from .claude/tools/ (project and user)",
	priority: PRIORITY,
	load: loadTools,
});

registerProvider<Settings>(settingsCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load settings from .claude/settings.json (project and user)",
	priority: PRIORITY,
	load: loadSettings,
});

registerProvider<SystemPrompt>(systemPromptCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Load system prompt from .claude/SYSTEM.md (project and user)",
	priority: PRIORITY,
	load: loadSystemPrompts,
});
