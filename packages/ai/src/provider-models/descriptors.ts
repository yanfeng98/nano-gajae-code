/**
 * Unified provider descriptors — single source of truth for provider metadata
 * used by both runtime model discovery (model-registry.ts) and catalog
 * generation (generate-models.ts).
 */
import type { ModelManagerOptions } from "../model-manager";
import type { Api, KnownProvider } from "../types";
import type { OAuthProvider } from "../utils/oauth/types";
import { googleModelManagerOptions } from "./google";
import { ollamaCloudModelManagerOptions } from "./ollama";
import {
	anthropicModelManagerOptions,
	deepseekModelManagerOptions,
	huggingfaceModelManagerOptions,
	kimiCodeModelManagerOptions,
	litellmModelManagerOptions,
	moonshotModelManagerOptions,
	ollamaModelManagerOptions,
	openaiModelManagerOptions,
	opencodeGoModelManagerOptions,
	opencodeZenModelManagerOptions,
	vllmModelManagerOptions,
} from "./openai-compat";
import { zaiModelManagerOptions } from "./special";

/** Catalog discovery configuration for providers that support endpoint-based model listing. */
export interface CatalogDiscoveryConfig {
	/** Human-readable name for log messages. */
	label: string;
	/** Environment variables to check for API keys during catalog generation. */
	envVars: string[];
	/** OAuth provider for credential refresh during catalog generation. */
	oauthProvider?: OAuthProvider;
	/** When true, catalog discovery proceeds even without credentials. */
	allowUnauthenticated?: boolean;
}

/** Unified provider descriptor used by both runtime discovery and catalog generation. */
export interface ProviderDescriptor {
	providerId: KnownProvider;
	createModelManagerOptions(config: { apiKey?: string; baseUrl?: string }): ModelManagerOptions<Api>;
	/** Preferred model ID when no explicit selection is made. */
	defaultModel: string;
	/** When true, the runtime creates a model manager even without a valid API key (e.g. ollama). */
	allowUnauthenticated?: boolean;
	/** Catalog discovery configuration. Only providers with this field participate in generate-models.ts. */
	catalogDiscovery?: CatalogDiscoveryConfig;
}

/** A provider descriptor that has catalog discovery configured. */
export type CatalogProviderDescriptor = ProviderDescriptor & { catalogDiscovery: CatalogDiscoveryConfig };

/** Type guard for descriptors with catalog discovery. */
export function isCatalogDescriptor(d: ProviderDescriptor): d is CatalogProviderDescriptor {
	return d.catalogDiscovery != null;
}

/** Whether catalog discovery may run without provider credentials. */
export function allowsUnauthenticatedCatalogDiscovery(descriptor: CatalogProviderDescriptor): boolean {
	return descriptor.catalogDiscovery.allowUnauthenticated ?? descriptor.allowUnauthenticated ?? false;
}

function descriptor(
	providerId: KnownProvider,
	defaultModel: string,
	createModelManagerOptions: ProviderDescriptor["createModelManagerOptions"],
	options: Pick<ProviderDescriptor, "allowUnauthenticated"> = {},
): ProviderDescriptor {
	return {
		providerId,
		defaultModel,
		createModelManagerOptions,
		...options,
	};
}

function catalog(
	label: string,
	envVars: string[],
	options: Pick<CatalogDiscoveryConfig, "oauthProvider" | "allowUnauthenticated"> = {},
): CatalogDiscoveryConfig {
	return {
		label,
		envVars,
		...options,
	};
}

function catalogDescriptor(
	providerId: KnownProvider,
	defaultModel: string,
	createModelManagerOptions: ProviderDescriptor["createModelManagerOptions"],
	catalogDiscovery: CatalogDiscoveryConfig,
	options: Pick<ProviderDescriptor, "allowUnauthenticated"> = {},
): ProviderDescriptor {
	return {
		...descriptor(providerId, defaultModel, createModelManagerOptions, options),
		catalogDiscovery,
	};
}

/**
 * All standard providers.
 */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
	descriptor("anthropic", "claude-sonnet-4-6", config => anthropicModelManagerOptions(config)),
	descriptor("openai", "gpt-5.4", config => openaiModelManagerOptions(config)),
	catalogDescriptor(
		"huggingface",
		"deepseek-ai/DeepSeek-R1",
		config => huggingfaceModelManagerOptions(config),
		catalog("Hugging Face", ["HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"]),
	),
	catalogDescriptor(
		"deepseek",
		"deepseek-v4-pro",
		config => deepseekModelManagerOptions(config),
		catalog("DeepSeek", ["DEEPSEEK_API_KEY"]),
	),
	descriptor("opencode-zen", "claude-sonnet-4-6", config => opencodeZenModelManagerOptions(config)),
	descriptor("opencode-go", "kimi-k2.5", config => opencodeGoModelManagerOptions(config)),
	catalogDescriptor(
		"ollama",
		"gpt-oss:20b",
		config => ollamaModelManagerOptions(config),
		catalog("Ollama", ["OLLAMA_API_KEY"]),
		{ allowUnauthenticated: true },
	),
	catalogDescriptor(
		"ollama-cloud",
		"gpt-oss:120b",
		config => ollamaCloudModelManagerOptions(config),
		catalog("Ollama Cloud", ["OLLAMA_CLOUD_API_KEY"], { oauthProvider: "ollama-cloud" }),
	),
	catalogDescriptor(
		"kimi-code",
		"kimi-k2.5",
		config => kimiCodeModelManagerOptions(config),
		catalog("Kimi Code", ["KIMI_API_KEY"]),
	),
	catalogDescriptor(
		"litellm",
		"claude-opus-4-6",
		config => litellmModelManagerOptions(config),
		catalog("LiteLLM", ["LITELLM_API_KEY"], { allowUnauthenticated: true }),
	),
	catalogDescriptor(
		"vllm",
		"gpt-oss-20b",
		config => vllmModelManagerOptions(config),
		catalog("vLLM", ["VLLM_API_KEY"], { allowUnauthenticated: true }),
	),
	catalogDescriptor(
		"moonshot",
		"kimi-k2.5",
		config => moonshotModelManagerOptions(config),
		catalog("Moonshot", ["MOONSHOT_API_KEY"]),
	),
	catalogDescriptor("zai", "glm-5.1", config => zaiModelManagerOptions(config), catalog("zAI", ["ZAI_API_KEY"])),
	descriptor("google", "gemini-2.5-pro", config => googleModelManagerOptions(config)),
] as const;

/** Default model IDs for all known providers, built from descriptors + special providers. */
export const DEFAULT_MODEL_PER_PROVIDER: Record<KnownProvider, string> = {
	...Object.fromEntries(PROVIDER_DESCRIPTORS.map(d => [d.providerId, d.defaultModel])),
	// Providers not in PROVIDER_DESCRIPTORS (special auth or no standard discovery)
	minimax: "minimax-m3",
	"minimax-code": "minimax-m3",
	"minimax-code-cn": "minimax-m3",
	"lm-studio": "llama-4",
} as Record<KnownProvider, string>;
