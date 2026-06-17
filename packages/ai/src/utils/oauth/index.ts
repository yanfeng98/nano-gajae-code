// ============================================================================
// High-level API
// ============================================================================
import type {
	OAuthCredentials,
	OAuthProvider,
	OAuthProviderId,
	OAuthProviderInfo,
	OAuthProviderInterface,
} from "./types";

const builtInOAuthProviders: OAuthProviderInfo[] = [
	{
		id: "anthropic",
		name: "Anthropic (Claude Pro/Max)",
		available: true,
	},
	{
		id: "openai-codex",
		name: "ChatGPT Plus/Pro (Codex Subscription)",
		available: true,
	},
	{
		id: "openai-codex-device",
		name: "ChatGPT Plus/Pro (Codex, headless/device)",
		available: true,
	},
	{
		id: "kimi-code",
		name: "Kimi Code",
		available: true,
	},
	{
		id: "kagi",
		name: "Kagi",
		available: true,
	},
	{
		id: "cerebras",
		name: "Cerebras",
		available: true,
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		available: true,
	},
	{
		id: "xai",
		name: "xAI",
		available: true,
	},
	{
		id: "fireworks",
		name: "Fireworks",
		available: true,
	},
	{
		id: "google-gemini-cli",
		name: "Google Cloud Code Assist (Gemini CLI)",
		available: true,
	},
	{
		id: "google-antigravity",
		name: "Antigravity (Gemini 3, Claude, GPT-OSS)",
		available: true,
	},
	{
		id: "litellm",
		name: "LiteLLM",
		available: true,
	},
	{
		id: "ollama",
		name: "Ollama (Local OpenAI-compatible)",
		available: true,
	},
	{
		id: "ollama-cloud",
		name: "Ollama Cloud",
		available: true,
	},
	{
		id: "huggingface",
		name: "Hugging Face Inference",
		available: true,
	},
	{
		id: "tavily",
		name: "Tavily",
		available: true,
	},
	{
		id: "together",
		name: "Together",
		available: true,
	},
	{
		id: "opencode-zen",
		name: "OpenCode Zen",
		available: true,
	},
	{
		id: "opencode-go",
		name: "OpenCode Go",
		available: true,
	},
	{
		id: "zai",
		name: "Z.AI (GLM Coding Plan)",
		available: true,
	},
	{
		id: "minimax-code",
		name: "MiniMax Coding Plan (International)",
		available: true,
	},
	{
		id: "minimax-code-cn",
		name: "MiniMax Coding Plan (China)",
		available: true,
	},
	{
		id: "moonshot",
		name: "Moonshot (Kimi API)",
		available: true,
	},
	{
		id: "parallel",
		name: "Parallel",
		available: true,
	},
	{
		id: "perplexity",
		name: "Perplexity (Pro/Max)",
		available: true,
	},
	{
		id: "nvidia",
		name: "NVIDIA",
		available: true,
	},
	{
		id: "vllm",
		name: "vLLM (Local OpenAI-compatible)",
		available: true,
	},
];

const customOAuthProviders = new Map<string, OAuthProviderInterface>();

/**
 * Register a custom OAuth provider.
 */
export function registerOAuthProvider(provider: OAuthProviderInterface): void {
	customOAuthProviders.set(provider.id, provider);
}

/**
 * Get a custom OAuth provider by ID.
 */
export function getOAuthProvider(id: OAuthProviderId): OAuthProviderInterface | undefined {
	return customOAuthProviders.get(id);
}

/**
 * Remove all custom OAuth providers registered by a source.
 */
export function unregisterOAuthProviders(sourceId: string): void {
	for (const [id, provider] of customOAuthProviders.entries()) {
		if (provider.sourceId === sourceId) {
			customOAuthProviders.delete(id);
		}
	}
}

/**
 * Refresh token for any OAuth provider.
 * Saves the new credentials and returns the new access token.
 */
export async function refreshOAuthToken(
	provider: OAuthProvider,
	credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
	if (!credentials) {
		throw new Error(`No OAuth credentials found for ${provider}`);
	}

	let newCredentials: OAuthCredentials;
	switch (provider) {
		case "anthropic": {
			const { refreshAnthropicToken } = await import("./anthropic");
			newCredentials = await refreshAnthropicToken(credentials.refresh);
			break;
		}
		case "github-copilot": {
			const { refreshGitHubCopilotToken } = await import("./github-copilot");
			newCredentials = await refreshGitHubCopilotToken(credentials.refresh, credentials.enterpriseUrl);
			break;
		}
		case "google-gemini-cli": {
			const { refreshGoogleCloudToken } = await import("./google-gemini-cli");
			if (!credentials.projectId) {
				throw new Error("Google Cloud credentials missing projectId");
			}
			newCredentials = await refreshGoogleCloudToken(credentials.refresh, credentials.projectId);
			break;
		}
		case "google-antigravity": {
			const { refreshAntigravityToken } = await import("./google-antigravity");
			if (!credentials.projectId) {
				throw new Error("Antigravity credentials missing projectId");
			}
			newCredentials = await refreshAntigravityToken(credentials.refresh, credentials.projectId);
			break;
		}
		case "openai-codex":
		case "openai-codex-device": {
			const { refreshOpenAICodexToken } = await import("./openai-codex");
			newCredentials = await refreshOpenAICodexToken(credentials.refresh);
			break;
		}
		case "kimi-code": {
			const { refreshKimiToken } = await import("./kimi");
			newCredentials = await refreshKimiToken(credentials.refresh);
			break;
		}
		case "gitlab-duo": {
			const { refreshGitLabDuoToken } = await import("./gitlab-duo");
			newCredentials = await refreshGitLabDuoToken(credentials);
			break;
		}
		case "xai": {
			const { refreshXaiToken } = await import("./xai");
			newCredentials = await refreshXaiToken(credentials.refresh);
			break;
		}
		default:
			throw new Error(`Unknown OAuth provider: ${provider}`);
	}
	return newCredentials;
}
function getPerplexityJwtExpiryMs(token: string): number | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;
	const payload = parts[1];
	if (!payload) return undefined;
	try {
		const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
		if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) return undefined;
		return decoded.exp * 1000 - 5 * 60_000;
	} catch {
		return undefined;
	}
}

/**
 * Build API-key bytes for a provider from an already-fresh OAuth credential.
 *
 * Refresh is owned by AuthStorage. This helper deliberately refuses expired
 * credentials so it cannot POST broker redaction sentinels to upstream token
 * endpoints as a side channel.
 *
 * For providers that need credential metadata at request time, returns
 * JSON-encoded credentials plus expiry metadata for diagnostics/edge guards.
 * @returns API key string, or null if no credentials
 * @throws Error if the credential is expired and must be refreshed upstream
 */
export async function getOAuthApiKey(
	provider: OAuthProvider,
	credentials: Record<string, OAuthCredentials>,
): Promise<{ newCredentials: OAuthCredentials; apiKey: string } | null> {
	let creds = credentials[provider];
	if (!creds) {
		return null;
	}

	if (provider === "perplexity") {
		// Perplexity JWTs usually omit `exp` (server-side sessions). Trust the JWT
		// claim when present; otherwise treat the credential as non-expiring rather
		// than honoring a stale stored `expires` (older logins wrote loginTime+1h).
		const NEVER_EXPIRES = 8.64e15;
		const normalizedExpires =
			creds.expires > 0 && creds.expires < 10_000_000_000 ? creds.expires * 1000 : creds.expires;
		const jwtExpiry = getPerplexityJwtExpiryMs(creds.access);
		const expires = jwtExpiry ?? Math.max(normalizedExpires, NEVER_EXPIRES);
		if (expires !== creds.expires) {
			creds = { ...creds, expires };
		}
	}
	// Refresh is the sole responsibility of `AuthStorage` (which calls
	// `refreshOAuthToken` directly with broker-aware single-flighting). If we
	// reach here with an expired credential, the outer pipeline failed to
	// refresh before this call OR the refresh slot is the broker sentinel —
	// either way, posting the credential to a provider endpoint would only
	// trigger a `__remote__`-against-real-provider failure that gets classified
	// as `invalid_grant` and disables the row. Refuse loudly instead.
	if (Date.now() >= creds.expires) {
		if (provider === "perplexity") {
			const jwtExpiry = getPerplexityJwtExpiryMs(creds.access);
			if (jwtExpiry && Date.now() < jwtExpiry) {
				const fallbackCredentials = { ...creds, expires: jwtExpiry };
				return { newCredentials: fallbackCredentials, apiKey: fallbackCredentials.access };
			}
		}
		throw new Error(
			`OAuth credential for ${provider} is expired and must be refreshed via AuthStorage before getOAuthApiKey is called`,
		);
	}
	// For providers that need request-time credential metadata, return JSON.
	const needsStructuredApiKey = provider === "google-gemini-cli" || provider === "google-antigravity";
	const apiKey = needsStructuredApiKey
		? JSON.stringify({
				token: creds.access,
				enterpriseUrl: creds.enterpriseUrl,
				projectId: creds.projectId,
				refreshToken: creds.refresh,
				expiresAt: creds.expires,
				email: creds.email,
				accountId: creds.accountId,
			})
		: creds.access;
	return { newCredentials: creds, apiKey };
}

/**
 * Get list of OAuth providers.
 */
export function getOAuthProviders(): OAuthProviderInfo[] {
	const customProviders = Array.from(customOAuthProviders.values(), provider => ({
		id: provider.id,
		name: provider.name,
		available: true,
	}));
	return [...builtInOAuthProviders, ...customProviders];
}
