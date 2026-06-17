import type { ModelManagerOptions } from "../model-manager";
import { fetchGeminiModels } from "../utils/discovery/gemini";

export interface GoogleModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface GoogleVertexModelManagerConfig {
	apiKey?: string;
}

export function googleModelManagerOptions(
	config?: GoogleModelManagerConfig,
): ModelManagerOptions<"google-generative-ai"> {
	const apiKey = config?.apiKey;
	return {
		providerId: "google",
		...(apiKey ? { fetchDynamicModels: () => fetchGeminiModels({ apiKey, baseUrl: config?.baseUrl }) } : undefined),
	};
}

export function googleVertexModelManagerOptions(
	_config?: GoogleVertexModelManagerConfig,
): ModelManagerOptions<"google-vertex"> {
	// Vertex AI uses Application Default Credentials (ADC) for authentication,
	// which is handled at stream time rather than during model discovery.
	// Dynamic model discovery is not yet implemented for this provider.
	return {
		providerId: "google-vertex",
	};
}
