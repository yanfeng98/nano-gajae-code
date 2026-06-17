import type { GjcModelAssignmentTargetId } from "./model-registry";
import type { ModelsConfig } from "./models-config-schema";

export type ModelProfileRole = GjcModelAssignmentTargetId;

export interface ModelProfileDefinition {
	name: string;
	requiredProviders: string[];
	modelMapping: Partial<Record<ModelProfileRole, string>>;
	source: "builtin" | "user";
}

export interface ResolvedProfileBinding {
	defaultSelector?: string;
	agentModelOverrides: Partial<Record<Exclude<ModelProfileRole, "default">, string>>;
}

function parseModelSelectorProvider(selector: string): string | undefined {
	const slashIdx = selector.indexOf("/");
	if (slashIdx <= 0) return undefined;
	return selector.slice(0, slashIdx);
}

export function deriveModelProfileMappedProviders(definition: Pick<ModelProfileDefinition, "modelMapping">): string[] {
	const providers = new Set<string>();
	for (const selector of Object.values(definition.modelMapping)) {
		if (!selector) continue;
		const provider = parseModelSelectorProvider(selector);
		if (provider) providers.add(provider);
	}
	return [...providers].sort((a, b) => a.localeCompare(b));
}

export function aggregateModelProfileRequiredProviders(
	requiredProviders: readonly string[],
	definition: Pick<ModelProfileDefinition, "modelMapping">,
): string[] {
	const providers = new Set(requiredProviders);
	for (const provider of deriveModelProfileMappedProviders(definition)) {
		providers.add(provider);
	}
	return [...providers];
}

const profile = (
	name: string,
	requiredProviders: string[],
	modelMapping: Record<ModelProfileRole, string>,
): ModelProfileDefinition => ({
	name,
	requiredProviders: aggregateModelProfileRequiredProviders(requiredProviders, { modelMapping }),
	modelMapping,
	source: "builtin",
});

export const BUILTIN_MODEL_PROFILES: readonly ModelProfileDefinition[] = [
	profile("opencodego", ["opencode-go"], {
		default: "opencode-go/kimi-k2.6",
		executor: "opencode-go/deepseek-v4-flash",
		planner: "opencode-go/qwen3.7-max",
		critic: "opencode-go/mimo-v2.5-pro",
		architect: "opencode-go/deepseek-v4-pro",
	}),
	profile("claude-opus", ["anthropic"], {
		default: "anthropic/claude-opus-4-8:xhigh",
		executor: "anthropic/claude-sonnet-4-6",
		planner: "anthropic/claude-opus-4-8:low",
		critic: "anthropic/claude-opus-4-8:high",
		architect: "anthropic/claude-opus-4-8:xhigh",
	}),
	profile("glm-eco", ["zai"], {
		default: "zai/glm-5.1:low",
		executor: "zai/glm-5.1:minimal",
		planner: "zai/glm-5.1:low",
		critic: "zai/glm-5.1:medium",
		architect: "zai/glm-5.1:high",
	}),
	profile("glm-medium", ["zai"], {
		default: "zai/glm-5.1:medium",
		executor: "zai/glm-5.1:low",
		planner: "zai/glm-5.1:medium",
		critic: "zai/glm-5.1:high",
		architect: "zai/glm-5.1:xhigh",
	}),
	profile("glm-pro", ["zai"], {
		default: "zai/glm-5.1:xhigh",
		executor: "zai/glm-5.1:medium",
		planner: "zai/glm-5.1:high",
		critic: "zai/glm-5.1:xhigh",
		architect: "zai/glm-5.1:xhigh",
	}),
	profile("kimi-coding-plan-eco", ["kimi-code"], {
		default: "kimi-code/kimi-k2.7-code:low",
		executor: "kimi-code/kimi-k2.7-code:minimal",
		planner: "kimi-code/kimi-k2.7-code:low",
		critic: "kimi-code/kimi-k2.7-code:medium",
		architect: "kimi-code/kimi-k2.7-code:high",
	}),
	profile("kimi-coding-plan-medium", ["kimi-code"], {
		default: "kimi-code/kimi-k2.7-code:medium",
		executor: "kimi-code/kimi-k2.7-code:low",
		planner: "kimi-code/kimi-k2.7-code:medium",
		critic: "kimi-code/kimi-k2.7-code:high",
		architect: "kimi-code/kimi-k2.7-code:xhigh",
	}),
	profile("kimi-coding-plan-pro", ["kimi-code"], {
		default: "kimi-code/kimi-k2.7-code:xhigh",
		executor: "kimi-code/kimi-k2.7-code:medium",
		planner: "kimi-code/kimi-k2.7-code:high",
		critic: "kimi-code/kimi-k2.7-code:xhigh",
		architect: "kimi-code/kimi-k2.7-code:xhigh",
	}),
	profile("mimo-eco", ["xiaomi"], {
		default: "xiaomi/mimo-v2.5-pro:low",
		executor: "xiaomi/mimo-v2.5-pro:minimal",
		planner: "xiaomi/mimo-v2.5-pro:low",
		critic: "xiaomi/mimo-v2.5-pro:medium",
		architect: "xiaomi/mimo-v2.5-pro:high",
	}),
	profile("mimo-medium", ["xiaomi"], {
		default: "xiaomi/mimo-v2.5-pro:medium",
		executor: "xiaomi/mimo-v2.5-pro:low",
		planner: "xiaomi/mimo-v2.5-pro:medium",
		critic: "xiaomi/mimo-v2.5-pro:high",
		architect: "xiaomi/mimo-v2.5-pro:xhigh",
	}),
	profile("mimo-pro", ["xiaomi"], {
		default: "xiaomi/mimo-v2.5-pro:xhigh",
		executor: "xiaomi/mimo-v2.5-pro:medium",
		planner: "xiaomi/mimo-v2.5-pro:high",
		critic: "xiaomi/mimo-v2.5-pro:xhigh",
		architect: "xiaomi/mimo-v2.5-pro:xhigh",
	}),
	profile("minimax-eco", ["minimax-code"], {
		default: "minimax-code/minimax-v3:low",
		executor: "minimax-code/minimax-v3:minimal",
		planner: "minimax-code/minimax-v3:low",
		critic: "minimax-code/minimax-v3:medium",
		architect: "minimax-code/minimax-v3:high",
	}),
	profile("minimax-medium", ["minimax-code"], {
		default: "minimax-code/minimax-v3:medium",
		executor: "minimax-code/minimax-v3:low",
		planner: "minimax-code/minimax-v3:medium",
		critic: "minimax-code/minimax-v3:high",
		architect: "minimax-code/minimax-v3:xhigh",
	}),
	profile("minimax-pro", ["minimax-code"], {
		default: "minimax-code/minimax-v3:xhigh",
		executor: "minimax-code/minimax-v3:medium",
		planner: "minimax-code/minimax-v3:high",
		critic: "minimax-code/minimax-v3:xhigh",
		architect: "minimax-code/minimax-v3:xhigh",
	}),
];

export interface ModelProfilePresentation {
	displayName: string;
	providerGroup: string;
}

const PROFILE_PRESENTATION: Record<string, ModelProfilePresentation> = {
	opencodego: { displayName: "OpenCodeGo", providerGroup: "OPENCODEGO" },
	"claude-opus": { displayName: "Claude Opus", providerGroup: "CLAUDE" },
	"glm-eco": { displayName: "GLM Eco", providerGroup: "GLM" },
	"glm-medium": { displayName: "GLM Medium", providerGroup: "GLM" },
	"glm-pro": { displayName: "GLM Pro", providerGroup: "GLM" },
	"kimi-coding-plan-eco": { displayName: "Kimi Coding Plan Eco", providerGroup: "KIMI CODING PLAN" },
	"kimi-coding-plan-medium": { displayName: "Kimi Coding Plan Medium", providerGroup: "KIMI CODING PLAN" },
	"kimi-coding-plan-pro": { displayName: "Kimi Coding Plan Pro", providerGroup: "KIMI CODING PLAN" },
	"minimax-eco": { displayName: "MiniMax Eco", providerGroup: "MINIMAX" },
	"minimax-medium": { displayName: "MiniMax Medium", providerGroup: "MINIMAX" },
	"minimax-pro": { displayName: "MiniMax Pro", providerGroup: "MINIMAX" },
};

const PROFILE_GROUP_ORDER = [
	"OPENCODEGO",
	"CLAUDE",
	"GLM",
	"KIMI CODING PLAN",
	"MINIMAX",
	"COMBOS",
];

const PROFILE_RECOMMENDATIONS: Record<string, string> = {
	anthropic: "claude-opus",
	"opencode-go": "opencodego",
	zai: "glm-medium",
	"kimi-code": "kimi-coding-plan-medium",
	"minimax-code": "minimax-medium",
};

export function getModelProfilePresentation(name: string): ModelProfilePresentation {
	return PROFILE_PRESENTATION[name] ?? { displayName: name, providerGroup: "COMBOS" };
}

export function groupModelProfilesForPresetLanding(
	profiles: ReadonlyMap<string, ModelProfileDefinition>,
): Map<string, ModelProfileDefinition[]> {
	const groups = new Map<string, ModelProfileDefinition[]>();
	for (const group of PROFILE_GROUP_ORDER) groups.set(group, []);
	for (const profile of profiles.values()) {
		const group = getModelProfilePresentation(profile.name).providerGroup;
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)?.push(profile);
	}
	for (const [group, entries] of groups) {
		if (entries.length === 0) groups.delete(group);
		else entries.sort((a, b) => a.name.localeCompare(b.name));
	}
	return groups;
}

export function recommendModelProfileForProvider(
	providerId: string,
	profiles: ReadonlyMap<string, ModelProfileDefinition>,
): ModelProfileDefinition | undefined {
	const recommended = PROFILE_RECOMMENDATIONS[providerId];
	return recommended ? profiles.get(recommended) : undefined;
}

export function mergeModelProfiles(userProfiles?: ModelsConfig["profiles"]): Map<string, ModelProfileDefinition> {
	const profiles = new Map<string, ModelProfileDefinition>();
	for (const definition of BUILTIN_MODEL_PROFILES) {
		profiles.set(definition.name, {
			...definition,
			requiredProviders: [...definition.requiredProviders],
			modelMapping: { ...definition.modelMapping },
		});
	}
	for (const [name, definition] of Object.entries(userProfiles ?? {})) {
		const modelMapping = { ...definition.model_mapping };
		profiles.set(name, {
			name,
			requiredProviders: aggregateModelProfileRequiredProviders(definition.required_providers, { modelMapping }),
			modelMapping,
			source: "user",
		});
	}
	return profiles;
}

export function resolveProfileBindings(definition: ModelProfileDefinition): ResolvedProfileBinding {
	const { default: defaultSelector, executor, architect, planner, critic } = definition.modelMapping;
	const agentModelOverrides: ResolvedProfileBinding["agentModelOverrides"] = {};
	if (executor !== undefined) agentModelOverrides.executor = executor;
	if (architect !== undefined) agentModelOverrides.architect = architect;
	if (planner !== undefined) agentModelOverrides.planner = planner;
	if (critic !== undefined) agentModelOverrides.critic = critic;
	return { defaultSelector, agentModelOverrides };
}

export function formatAvailableProfileNames(profiles: ReadonlyMap<string, ModelProfileDefinition>): string {
	return [...profiles.keys()].sort((a, b) => a.localeCompare(b)).join(", ");
}
