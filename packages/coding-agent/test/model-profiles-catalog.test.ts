import { describe, expect, test } from "bun:test";
import {
	BUILTIN_MODEL_PROFILES,
	formatAvailableProfileNames,
	getModelProfilePresentation,
	groupModelProfilesForPresetLanding,
	type ModelProfileDefinition,
	mergeModelProfiles,
	recommendModelProfileForProvider,
	resolveProfileBindings,
} from "@gajae-code/coding-agent/config/model-profiles";
import { parseModelString } from "@gajae-code/coding-agent/config/model-resolver";
import { ProfileModelSelectorSchema } from "@gajae-code/coding-agent/config/models-config-schema";
import modelsJson from "../../ai/src/models.json";

type Role = "default" | "executor" | "planner" | "critic" | "architect";

const roles: Role[] = ["default", "executor", "planner", "critic", "architect"];

const expectedProfiles: Array<{ name: string; requiredProviders: string[]; mapping: Record<Role, string> }> = [
	{
		name: "opencodego",
		requiredProviders: ["opencode-go"],
		mapping: {
			default: "opencode-go/kimi-k2.6",
			executor: "opencode-go/deepseek-v4-flash",
			planner: "opencode-go/qwen3.7-max",
			critic: "opencode-go/MiniMax-M2.5",
			architect: "opencode-go/deepseek-v4-pro",
		},
	},
	{
		name: "claude-opus",
		requiredProviders: ["anthropic"],
		mapping: {
			default: "anthropic/claude-opus-4-8:xhigh",
			executor: "anthropic/claude-sonnet-4-6",
			planner: "anthropic/claude-opus-4-8:low",
			critic: "anthropic/claude-opus-4-8:high",
			architect: "anthropic/claude-opus-4-8:xhigh",
		},
	},
	{
		name: "glm-eco",
		requiredProviders: ["zai"],
		mapping: {
			default: "zai/glm-5.1:low",
			executor: "zai/glm-5.1:minimal",
			planner: "zai/glm-5.1:low",
			critic: "zai/glm-5.1:medium",
			architect: "zai/glm-5.1:high",
		},
	},
	{
		name: "glm-medium",
		requiredProviders: ["zai"],
		mapping: {
			default: "zai/glm-5.1:medium",
			executor: "zai/glm-5.1:low",
			planner: "zai/glm-5.1:medium",
			critic: "zai/glm-5.1:high",
			architect: "zai/glm-5.1:xhigh",
		},
	},
	{
		name: "glm-pro",
		requiredProviders: ["zai"],
		mapping: {
			default: "zai/glm-5.1:xhigh",
			executor: "zai/glm-5.1:medium",
			planner: "zai/glm-5.1:high",
			critic: "zai/glm-5.1:xhigh",
			architect: "zai/glm-5.1:xhigh",
		},
	},
	{
		name: "kimi-coding-plan-eco",
		requiredProviders: ["kimi-code"],
		mapping: {
			default: "kimi-code/kimi-k2.7-code:low",
			executor: "kimi-code/kimi-k2.7-code:minimal",
			planner: "kimi-code/kimi-k2.7-code:low",
			critic: "kimi-code/kimi-k2.7-code:medium",
			architect: "kimi-code/kimi-k2.7-code:high",
		},
	},
	{
		name: "kimi-coding-plan-medium",
		requiredProviders: ["kimi-code"],
		mapping: {
			default: "kimi-code/kimi-k2.7-code:medium",
			executor: "kimi-code/kimi-k2.7-code:low",
			planner: "kimi-code/kimi-k2.7-code:medium",
			critic: "kimi-code/kimi-k2.7-code:high",
			architect: "kimi-code/kimi-k2.7-code:xhigh",
		},
	},
	{
		name: "kimi-coding-plan-pro",
		requiredProviders: ["kimi-code"],
		mapping: {
			default: "kimi-code/kimi-k2.7-code:xhigh",
			executor: "kimi-code/kimi-k2.7-code:medium",
			planner: "kimi-code/kimi-k2.7-code:high",
			critic: "kimi-code/kimi-k2.7-code:xhigh",
			architect: "kimi-code/kimi-k2.7-code:xhigh",
		},
	},
	{
		name: "minimax-eco",
		requiredProviders: ["minimax-code"],
		mapping: {
			default: "minimax-code/minimax-v3:low",
			executor: "minimax-code/minimax-v3:minimal",
			planner: "minimax-code/minimax-v3:low",
			critic: "minimax-code/minimax-v3:medium",
			architect: "minimax-code/minimax-v3:high",
		},
	},
	{
		name: "minimax-medium",
		requiredProviders: ["minimax-code"],
		mapping: {
			default: "minimax-code/minimax-v3:medium",
			executor: "minimax-code/minimax-v3:low",
			planner: "minimax-code/minimax-v3:medium",
			critic: "minimax-code/minimax-v3:high",
			architect: "minimax-code/minimax-v3:xhigh",
		},
	},
	{
		name: "minimax-pro",
		requiredProviders: ["minimax-code"],
		mapping: {
			default: "minimax-code/minimax-v3:xhigh",
			executor: "minimax-code/minimax-v3:medium",
			planner: "minimax-code/minimax-v3:high",
			critic: "minimax-code/minimax-v3:xhigh",
			architect: "minimax-code/minimax-v3:xhigh",
		},
	},
];

const oldNames = [
	"opencode-go-eco",
	"opencode-go-standard",
	"opencode-go-pro",
	"codex-standard",
	"opencode-go-codex-eco",
	"opencode-go-codex-standard",
	"opencode-go-codex-pro",
	"minimax-standard",
	"minimax-cn-standard",
	"kimi-standard",
	"glm-standard",
	"claude-fable",
	"fable-codex",
];

function selectorExists(selector: string): boolean {
	const parsed = parseModelString(selector);
	if (!parsed) return false;
	return (modelsJson as Record<string, Record<string, unknown>>)[parsed.provider]?.[parsed.id] !== undefined;
}

describe("built-in model profile catalog", () => {
	test("contains exact 11-profile matrix cell-for-cell", () => {
		expect(BUILTIN_MODEL_PROFILES.map(profile => profile.name)).toEqual(
			expectedProfiles.map(profile => profile.name),
		);
		for (const expected of expectedProfiles) {
			const profile = BUILTIN_MODEL_PROFILES.find(candidate => candidate.name === expected.name);
			expect(profile?.requiredProviders).toEqual(expected.requiredProviders);
			expect(profile?.modelMapping).toEqual(expected.mapping);
		}
	});

	test("old builtin names are absent and available names list current names", () => {
		const profiles = mergeModelProfiles();
		for (const oldName of oldNames) expect(profiles.has(oldName)).toBe(false);
		expect(formatAvailableProfileNames(profiles)).toContain("glm-medium");
		expect(formatAvailableProfileNames(profiles)).not.toContain("glm-standard");
	});

	test("every selector parses with schema validation and exists in models.json", () => {
		const missing: string[] = [];
		for (const profile of BUILTIN_MODEL_PROFILES) {
			for (const role of roles) {
				const selector = profile.modelMapping[role];
				expect(selector).toBeDefined();
				expect(ProfileModelSelectorSchema.safeParse(selector).success).toBe(true);
				expect(parseModelString(selector ?? "")).toBeDefined();
				if (selector && !selectorExists(selector)) missing.push(`${profile.name}.${role}=${selector}`);
			}
		}
		expect(missing).toEqual([]);
		expect((modelsJson as Record<string, Record<string, unknown>>)["kimi-code"]?.["kimi-k2.7-code"]).toBeDefined();
		expect((modelsJson as Record<string, Record<string, unknown>>)["minimax-code"]?.["minimax-v3"]).toBeDefined();
	});

	test("plain minimax provider does not appear in catalog or recommendations", () => {
		expect(JSON.stringify(BUILTIN_MODEL_PROFILES)).not.toContain("minimax/");
		expect(recommendModelProfileForProvider("minimax", mergeModelProfiles())).toBeUndefined();
		expect(recommendModelProfileForProvider("minimax-code", mergeModelProfiles())?.name).toBe("minimax-medium");
	});

	test("presentation groups and provider recommendations are pure catalog helpers", () => {
		const profiles = mergeModelProfiles();
		expect(getModelProfilePresentation("kimi-coding-plan-medium")).toEqual({
			displayName: "Kimi Coding Plan Medium",
			providerGroup: "KIMI CODING PLAN",
		});
		expect([...groupModelProfilesForPresetLanding(profiles).keys()]).toEqual([
			"OPENCODEGO",
			"CLAUDE",
			"GLM",
			"KIMI CODING PLAN",
			"MINIMAX",
			"CURSOR",
			"MINIMAX",
		]);
		expect(recommendModelProfileForProvider("anthropic", profiles)?.name).toBe("claude-opus");
		expect(recommendModelProfileForProvider("opencode-go", profiles)?.name).toBe("opencodego");
		expect(recommendModelProfileForProvider("zai", profiles)?.name).toBe("glm-medium");
		expect(recommendModelProfileForProvider("kimi-code", profiles)?.name).toBe("kimi-coding-plan-medium");
		expect(recommendModelProfileForProvider("minimax-cn", profiles)?.name).toBe("minimax-medium");
	});

	test("user same-name profile overrides builtin via mergeModelProfiles", () => {
		const merged = mergeModelProfiles({
			"glm-medium": {
				required_providers: ["custom"],
				model_mapping: { default: "custom/model" },
			},
		});
		const profile = merged.get("glm-medium");
		expect(profile).toEqual({
			name: "glm-medium",
			requiredProviders: ["custom"],
			modelMapping: { default: "custom/model" },
			source: "user",
		});
		expect(resolveProfileBindings(profile as ModelProfileDefinition)).toEqual({
			defaultSelector: "custom/model",
			agentModelOverrides: {},
		});
	});
});
