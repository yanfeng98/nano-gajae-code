import { $credentialEnv, $pickCredentialEnv, extractHttpStatusFromError } from "@gajae-code/utils";
import { getCustomApi } from "./api-registry";
import type { Effort } from "./model-thinking";
import {
	mapEffortToAnthropicAdaptiveEffort,
	mapEffortToGoogleThinkingLevel,
	requireSupportedEffort,
} from "./model-thinking";
import type { AnthropicOptions } from "./providers/anthropic";

import type { GoogleOptions } from "./providers/google";
import type { GoogleGeminiCliOptions } from "./providers/google-gemini-cli";
import { isKimiModel, streamKimi } from "./providers/kimi";
import type { OllamaChatOptions } from "./providers/ollama";
import type { OpenAICompletionsOptions } from "./providers/openai-completions";
import { streamPiNative } from "./providers/pi-native-client";
// Heavy provider stream functions are imported lazily via register-builtins,
// which wraps each provider module in a dynamic import. This keeps the
// AWS SDK, google-auth-library, @google/genai, @bufbuild/protobuf, and
// other provider SDKs out of the CLI startup parse graph. The
// kimi provider stays eager because its module
// exports routing predicates (isKimiModel)
// that must be callable synchronously before streaming begins, and its
// module is a thin wrapper with no heavy SDK dependencies.
import {
	streamAnthropic,
	streamGoogle,
	streamGoogleGeminiCli,
	streamOllama,
	streamOpenAICodexResponses,
	streamOpenAICompletions,
	streamOpenAIResponses,
} from "./providers/register-builtins";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	Model,
	OptionsForApi,
	SimpleStreamOptions,
	StreamOptions,
	ThinkingBudgets,
	ToolChoice,
} from "./types";
import { AssistantMessageEventStream } from "./utils/event-stream";
import { isFoundryEnabled } from "./utils/foundry";

type KeyResolver = string | (() => string | undefined);

const serviceProviderMap: Record<string, KeyResolver> = {
	openai: () => $credentialEnv("OPENAI_API_KEY"),
	google: "GEMINI_API_KEY",
	groq: "GROQ_API_KEY",
	cerebras: "CEREBRAS_API_KEY",
	xai: "XAI_API_KEY",
	fireworks: "FIREWORKS_API_KEY",
	firepass: "FIREPASS_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	kilo: "KILO_API_KEY",
	zai: "ZAI_API_KEY",
	mistral: "MISTRAL_API_KEY",
	minimax: "MINIMAX_API_KEY",
	"minimax-code": "MINIMAX_CODE_API_KEY",
	"minimax-code-cn": "MINIMAX_CODE_CN_API_KEY",
	"opencode-go": "OPENCODE_API_KEY",
	"opencode-zen": "OPENCODE_API_KEY",

	deepseek: "DEEPSEEK_API_KEY",
	"openai-codex": "OPENAI_CODEX_OAUTH_TOKEN",
	exa: "EXA_API_KEY",
	jina: "JINA_API_KEY",
	brave: "BRAVE_API_KEY",
	perplexity: "PERPLEXITY_API_KEY",
	tavily: "TAVILY_API_KEY",
	parallel: "PARALLEL_API_KEY",
	kagi: "KAGI_API_KEY",
	// Foundry mode optionally switches Anthropic auth to enterprise gateway credentials.
	anthropic: () =>
		isFoundryEnabled()
			? $pickCredentialEnv("ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY")
			: $pickCredentialEnv("ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"),
	huggingface: () => $pickCredentialEnv("HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"),
	litellm: "LITELLM_API_KEY",
	moonshot: "MOONSHOT_API_KEY",
	nvidia: "NVIDIA_API_KEY",
	nanogpt: "NANO_GPT_API_KEY",
	ollama: "OLLAMA_API_KEY",
	"ollama-cloud": "OLLAMA_CLOUD_API_KEY",
	"llama.cpp": "LLAMA_CPP_API_KEY",
	qianfan: "QIANFAN_API_KEY",
	together: "TOGETHER_API_KEY",
	zenmux: "ZENMUX_API_KEY",
	venice: "VENICE_API_KEY",
	vllm: "VLLM_API_KEY",
	xiaomi: "XIAOMI_API_KEY",
};

/**
 * Get API key for provider from known environment variables, e.g. OPENAI_API_KEY.
 *
 * Provider authentication intentionally excludes cwd/.env values. Project dotenv files are
 * loaded into $env for app/tool execution, but must not silently fund GJC model requests.
 */
export function getEnvApiKey(provider: string): string | undefined {
	const resolver = serviceProviderMap[provider];
	if (typeof resolver === "string") {
		return $credentialEnv(resolver);
	}
	return resolver?.();
}

/**
 * Enumerate every provider that has an env-var fallback for `getEnvApiKey`.
 * Used by `gjc auth-broker migrate --include-env` to discover env-sourced keys
 * that should be uploaded to the broker.
 */
export function listProvidersWithEnvKey(): string[] {
	return Object.keys(serviceProviderMap);
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: OptionsForApi<TApi>,
): AssistantMessageEventStream {
	// Check custom API registry first (extension-provided APIs like "vertex-Anthropic model-api")
	const customApiProvider = getCustomApi(model.api);
	if (customApiProvider) {
		return customApiProvider.stream(model, context, options as StreamOptions);
	}

	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}
	const providerOptions = { ...options, apiKey };

	const api: Api = model.api;
	switch (api) {
		case "anthropic-messages": {
			const anthropicOptions = providerOptions as AnthropicOptions;
			return streamAnthropic(model as Model<"anthropic-messages">, context, {
				...anthropicOptions,
				isOAuth: anthropicOptions.isOAuth ?? model.isOAuth,
			});
		}

		case "openai-completions":
			return streamOpenAICompletions(model as Model<"openai-completions">, context, providerOptions as any);

		case "openai-responses":
			return streamOpenAIResponses(model as Model<"openai-responses">, context, providerOptions as any);

		case "openai-codex-responses":
			return streamOpenAICodexResponses(model as Model<"openai-codex-responses">, context, providerOptions as any);

		case "google-generative-ai":
			return streamGoogle(model as Model<"google-generative-ai">, context, providerOptions);

		case "google-gemini-cli":
			return streamGoogleGeminiCli(
				model as Model<"google-gemini-cli">,
				context,
				providerOptions as GoogleGeminiCliOptions,
			);

		case "ollama-chat":
			return streamOllama(model as Model<"ollama-chat">, context, providerOptions as OllamaChatOptions);

		default:
			throw new Error(`Unhandled API: ${api}`);
	}
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: OptionsForApi<TApi>,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}

type AuthRetryFailure = {
	error: unknown;
	bufferedEvents: AssistantMessageEvent[];
	terminalEvent?: Extract<AssistantMessageEvent, { type: "error" }>;
};

function extractStatusFromAssistantError(message: AssistantMessage): number | undefined {
	if (message.errorStatus !== undefined) return message.errorStatus;
	if (!message.errorMessage) return undefined;
	return extractHttpStatusFromError({ message: message.errorMessage });
}

function createAssistantAuthError(message: AssistantMessage): Error & { status?: number } {
	const error: Error & { status?: number } = new Error(message.errorMessage ?? "Provider authentication failed");
	const status = extractStatusFromAssistantError(message);
	if (status !== undefined) error.status = status;
	return error;
}

function emitBufferedEvents(stream: AssistantMessageEventStream, events: AssistantMessageEvent[]): void {
	for (const event of events) {
		stream.push(event);
	}
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const retryApiKey = options?.onAuthError ? (options.apiKey ?? getEnvApiKey(model.provider)) : undefined;
	if (retryApiKey) {
		const outer = new AssistantMessageEventStream();
		const onAuthError = options!.onAuthError!;
		const runAttempt = async (apiKey: string, captureAuthFailure: boolean): Promise<AuthRetryFailure | undefined> => {
			const bufferedEvents: AssistantMessageEvent[] = [];
			let emittedReplayUnsafeEvent = false;
			const flushBuffered = (): void => {
				emitBufferedEvents(outer, bufferedEvents);
				bufferedEvents.length = 0;
			};

			try {
				const inner = streamSimple(model, context, { ...options, apiKey, onAuthError: undefined });
				for await (const event of inner) {
					if (!emittedReplayUnsafeEvent && event.type === "start") {
						bufferedEvents.push(event);
						continue;
					}
					if (
						!emittedReplayUnsafeEvent &&
						captureAuthFailure &&
						event.type === "error" &&
						extractStatusFromAssistantError(event.error) === 401
					) {
						return { error: createAssistantAuthError(event.error), bufferedEvents, terminalEvent: event };
					}
					flushBuffered();
					emittedReplayUnsafeEvent = true;
					outer.push(event);
					if (outer.done) return undefined;
				}
				flushBuffered();
				if (!outer.done) outer.end(await inner.result());
			} catch (error) {
				if (!emittedReplayUnsafeEvent && captureAuthFailure && extractHttpStatusFromError(error) === 401) {
					return { error, bufferedEvents };
				}
				flushBuffered();
				outer.fail(error);
			}
			return undefined;
		};
		const emitFailure = (failure: AuthRetryFailure): void => {
			emitBufferedEvents(outer, failure.bufferedEvents);
			if (failure.terminalEvent) {
				outer.push(failure.terminalEvent);
			} else {
				outer.fail(failure.error);
			}
		};

		void (async () => {
			const failure = await runAttempt(retryApiKey, true);
			if (!failure) return;
			let nextKey: string | undefined;
			try {
				nextKey = await onAuthError(model.provider, retryApiKey, failure.error);
			} catch {
				nextKey = undefined;
			}
			if (!nextKey || nextKey === retryApiKey) {
				emitFailure(failure);
				return;
			}
			await runAttempt(nextKey, false);
		})();
		return outer;
	}

	// Pi-native transport short-circuits the per-provider dispatch entirely:
	// the gateway resolves provider + credential server-side, so we don't
	// need an `apiKey` from `getEnvApiKey` here — `options.apiKey` carries
	// the gateway bearer instead. Comes BEFORE the custom-API check so
	// extension-registered APIs can't accidentally override a configured
	// pi-native transport.
	if (model.transport === "pi-native") {
		return streamPiNative(model, context, options);
	}

	// Check custom API registry (extension-provided APIs)
	const customApiProvider = getCustomApi(model.api);
	if (customApiProvider) {
		return customApiProvider.streamSimple(model, context, options);
	}

	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}

	// Kimi Code - route to dedicated handler that wraps OpenAI or Anthropic API
	if (isKimiModel(model)) {
		// Pass raw SimpleStreamOptions - streamKimi handles mapping internally
		return streamKimi(model as Model<"openai-completions">, context, {
			...options,
			apiKey,
			format: options?.kimiApiFormat ?? "anthropic",
		});
	}

	const providerOptions = mapOptionsForApi(model, options, apiKey);
	return stream(model, context, providerOptions);
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const s = streamSimple(model, context, options);
	return s.result();
}

const MIN_OUTPUT_TOKENS = 1024;
export const OUTPUT_FALLBACK_BUFFER = 4000;
const ANTHROPIC_USE_INTERLEAVED_THINKING = Bun.env.PI_NO_INTERLEAVED_THINKING !== "1";

export const ANTHROPIC_THINKING: Record<Effort, number> = {
	minimal: 1024,
	low: 4096,
	medium: 8192,
	high: 16384,
	xhigh: 32768,
	max: 65536,
};

const GOOGLE_THINKING: Record<Effort, number> = {
	minimal: 1024,
	low: 4096,
	medium: 8192,
	high: 16384,
	xhigh: 24575,
	max: 24575,
};

export function mapAnthropicToolChoice(choice?: ToolChoice): AnthropicOptions["toolChoice"] {
	if (!choice) return undefined;
	if (typeof choice === "string") {
		if (choice === "required") return "any";
		if (choice === "auto" || choice === "none" || choice === "any") return choice;
		return undefined;
	}
	if (choice.type === "tool") {
		return choice.name ? { type: "tool", name: choice.name } : undefined;
	}
	if (choice.type === "function") {
		const name = "function" in choice ? choice.function?.name : choice.name;
		return name ? { type: "tool", name } : undefined;
	}
	return undefined;
}

function mapGoogleToolChoice(
	choice?: ToolChoice,
): GoogleOptions["toolChoice"] | GoogleGeminiCliOptions["toolChoice"] | GoogleVertexOptions["toolChoice"] {
	if (!choice) return undefined;
	if (typeof choice === "string") {
		if (choice === "required") return "any";
		if (choice === "auto" || choice === "none" || choice === "any") return choice;
		return undefined;
	}
	return "any";
}

function mapOpenAiToolChoice(choice?: ToolChoice): OpenAICompletionsOptions["toolChoice"] {
	if (!choice) return undefined;
	if (typeof choice === "string") {
		if (choice === "any") return "required";
		if (choice === "auto" || choice === "none" || choice === "required") return choice;
		return undefined;
	}
	if (choice.type === "tool") {
		return choice.name ? { type: "function", function: { name: choice.name } } : undefined;
	}
	if (choice.type === "function") {
		const name = "function" in choice ? choice.function?.name : choice.name;
		return name ? { type: "function", function: { name } } : undefined;
	}
	return undefined;
}

function resolveOpenAiReasoningEffort<TApi extends Api>(
	model: Model<TApi>,
	options?: SimpleStreamOptions,
): Effort | undefined {
	const reasoning = options?.reasoning;
	if (!reasoning || !model.reasoning) return undefined;
	return requireSupportedEffort(model, reasoning);
}

const castApi = <TApi extends Api>(api: OptionsForApi<TApi>): OptionsForApi<Api> => api as OptionsForApi<Api>;

function mapOptionsForApi<TApi extends Api>(
	model: Model<TApi>,
	options?: SimpleStreamOptions,
	apiKey?: string,
): OptionsForApi<TApi> {
	const base = {
		temperature: options?.temperature,
		topP: options?.topP,
		topK: options?.topK,
		minP: options?.minP,
		presencePenalty: options?.presencePenalty,
		repetitionPenalty: options?.repetitionPenalty,
		maxTokens: options?.maxTokens || Math.min(model.maxTokens, 32000),
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
		cacheRetention: options?.cacheRetention ?? model.cacheRetention,
		headers: options?.headers,
		initiatorOverride: options?.initiatorOverride,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		requestMaxRetries: options?.requestMaxRetries,
		streamMaxRetries: options?.streamMaxRetries,
		metadata: options?.metadata,
		sessionId: options?.sessionId,
		providerSessionState: options?.providerSessionState,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		onSseEvent: options?.onSseEvent,
	};

	switch (model.api) {
		case "anthropic-messages": {
			// Explicitly disable thinking when reasoning is not specified or model doesn't support it
			const reasoning = options?.reasoning;
			if (!reasoning || !model.reasoning) {
				return castApi<"anthropic-messages">({
					...base,
					thinkingEnabled: false,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			}

			let thinkingBudget = options.thinkingBudgets?.[reasoning] ?? ANTHROPIC_THINKING[reasoning];
			if (thinkingBudget <= 0) {
				return castApi<"anthropic-messages">({
					...base,
					thinkingEnabled: false,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			}

			// For Opus 4.6+ and Sonnet 4.6+: use adaptive thinking with effort level
			// For older models: use budget-based thinking
			if (model.thinking?.mode === "anthropic-adaptive") {
				const effort = mapEffortToAnthropicAdaptiveEffort(model, reasoning);
				return castApi<"anthropic-messages">({
					...base,
					thinkingEnabled: true,
					effort,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			}

			if (ANTHROPIC_USE_INTERLEAVED_THINKING) {
				return castApi<"anthropic-messages">({
					...base,
					thinkingEnabled: true,
					thinkingBudgetTokens: thinkingBudget,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			}

			// Caller's maxTokens is the desired output; add thinking budget on top, capped at model limit
			const maxTokens = Math.min((base.maxTokens || 0) + thinkingBudget, model.maxTokens);

			// If not enough room for thinking + output, reduce thinking budget
			if (maxTokens <= thinkingBudget) {
				thinkingBudget = maxTokens - MIN_OUTPUT_TOKENS;
			}

			// If thinking budget is too low, disable thinking
			if (thinkingBudget <= 0) {
				return castApi<"anthropic-messages">({
					...base,
					thinkingEnabled: false,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			} else {
				return castApi<"anthropic-messages">({
					...base,
					maxTokens,
					thinkingEnabled: true,
					thinkingBudgetTokens: thinkingBudget,
					toolChoice: mapAnthropicToolChoice(options?.toolChoice),
					thinkingDisplay: options?.hideThinkingSummary ? "omitted" : undefined,
					serviceTier: options?.serviceTier,
				});
			}
		}

		case "openai-completions":
			return castApi<"openai-completions">({
				...base,
				reasoning: resolveOpenAiReasoningEffort(model, options),
				disableReasoning: options?.disableReasoning,
				toolChoice: mapOpenAiToolChoice(options?.toolChoice),
				serviceTier: options?.serviceTier,
			});

		case "openai-responses":
			return castApi<"openai-responses">({
				...base,
				reasoning: resolveOpenAiReasoningEffort(model, options),
				toolChoice: mapOpenAiToolChoice(options?.toolChoice),
				serviceTier: options?.serviceTier,
				reasoningSummary: options?.hideThinkingSummary ? null : undefined,
			});

		case "openai-codex-responses":
			return castApi<"openai-codex-responses">({
				...base,
				reasoning: resolveOpenAiReasoningEffort(model, options),
				toolChoice: mapOpenAiToolChoice(options?.toolChoice),
				serviceTier: options?.serviceTier,
				preferWebsockets: options?.preferWebsockets,
				reasoningSummary: options?.hideThinkingSummary ? null : undefined,
			});

		case "google-generative-ai": {
			// Explicitly disable thinking when reasoning is not specified or model doesn't support it
			// This is needed because Gemini has "dynamic thinking" enabled by default
			const reasoning = options?.reasoning;
			if (!reasoning || !model.reasoning) {
				return castApi<"google-generative-ai">({
					...base,
					thinking: { enabled: false },
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			}

			const googleModel = model as Model<"google-generative-ai">;
			const effort = requireSupportedEffort(googleModel, reasoning);

			// Gemini 3+ models use thinkingLevel exclusively instead of thinkingBudget.
			// https://ai.google.dev/gemini-api/docs/thinking#set-budget
			if (googleModel.thinking?.mode === "google-level") {
				return castApi<"google-generative-ai">({
					...base,
					thinking: {
						enabled: true,
						level: mapEffortToGoogleThinkingLevel(googleModel, effort),
					},
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			}

			return castApi<"google-gemini-cli">({
				...base,
				thinking: {
					enabled: true,
					budgetTokens: getGoogleBudget(googleModel, effort, options?.thinkingBudgets),
				},
				toolChoice: mapGoogleToolChoice(options?.toolChoice),
			});
		}

		case "google-gemini-cli": {
			const reasoning = options?.reasoning;
			if (!reasoning || !model.reasoning) {
				return castApi<"google-gemini-cli">({
					...base,
					thinking: { enabled: false },
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			}

			const effort = requireSupportedEffort(model, reasoning);

			// Gemini 3+ models use thinkingLevel instead of thinkingBudget
			if (model.thinking?.mode === "google-level") {
				return castApi<"google-gemini-cli">({
					...base,
					thinking: {
						enabled: true,
						level: mapEffortToGoogleThinkingLevel(model, effort),
					},
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			}

			let thinkingBudget = options.thinkingBudgets?.[effort] ?? GOOGLE_THINKING[effort];

			// Caller's maxTokens is the desired output; add thinking budget on top, capped at model limit
			const maxTokens = Math.min((base.maxTokens || 0) + thinkingBudget, model.maxTokens);

			// If not enough room for thinking + output, reduce thinking budget
			if (maxTokens <= thinkingBudget) {
				thinkingBudget = Math.max(0, maxTokens - MIN_OUTPUT_TOKENS) ?? 0;
			}

			// If thinking budget is too low, disable thinking
			if (thinkingBudget <= 0) {
				return castApi<"google-gemini-cli">({
					...base,
					thinking: { enabled: false },
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			} else {
				return castApi<"google-gemini-cli">({
					...base,
					maxTokens,
					thinking: { enabled: true, budgetTokens: thinkingBudget },
					toolChoice: mapGoogleToolChoice(options?.toolChoice),
				});
			}
		}

		case "ollama-chat":
			return castApi<"ollama-chat">({
				...base,
				reasoning: resolveOpenAiReasoningEffort(model, options),
				toolChoice: options?.toolChoice,
			});

		default:
			throw new Error(`Unhandled API in mapOptionsForApi: ${model.api}`);
	}
}

function getGoogleBudget(
	model: Model<"google-generative-ai">,
	effort: Effort,
	customBudgets?: ThinkingBudgets,
): number {
	requireSupportedEffort(model, effort);

	// Custom budgets take precedence if provided for this level
	if (customBudgets?.[effort] !== undefined) {
		return customBudgets[effort]!;
	}

	// See https://ai.google.dev/gemini-api/docs/thinking#set-budget
	if (model.id.includes("2.5-")) {
		switch (effort) {
			case "minimal":
				return 128;
			case "low":
				return 2048;
			case "medium":
				return 8192;
			default:
				return model.id.includes("2.5-flash") ? 24576 : 32768;
		}
	}

	// Unknown model - use dynamic
	return -1;
}
