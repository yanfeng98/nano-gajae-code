/**
 * Test context overflow error handling across providers.
 *
 * Context overflow occurs when the input (prompt + history) exceeds
 * the model's context window. This is different from output token limits.
 *
 * Expected behavior: All providers should return stopReason: "error"
 * with an errorMessage that indicates the context was too large,
 * OR (for z.ai) return successfully with usage.input > contextWindow.
 *
 * The isContextOverflow() function must return true for all providers.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import { getBundledModel } from "@gajae-code/ai/models";
import { complete } from "@gajae-code/ai/stream";
import type { AssistantMessage, Context, Model, Usage } from "@gajae-code/ai/types";
import { isContextOverflow } from "@gajae-code/ai/utils/overflow";
import { $which } from "@gajae-code/utils";
import { e2eApiKey, resolveApiKey } from "./oauth";

// Resolve OAuth tokens at module level (async, runs before tests)
const oauthTokens = await Promise.all([
	resolveApiKey("anthropic"),
]);
const [githubCopilotToken] = oauthTokens;

// Lorem ipsum paragraph for realistic token estimation
const LOREM_IPSUM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. `;

// Generate a string that will exceed the context window
// Using chars/4 as token estimate (works better with varied text than repeated chars)
function generateOverflowContent(contextWindow: number): string {
	const targetTokens = contextWindow + 10000; // Exceed by 10k tokens
	const targetChars = targetTokens * 4 * 1.5;
	const repetitions = Math.ceil(targetChars / LOREM_IPSUM.length);
	return LOREM_IPSUM.repeat(repetitions);
}

interface OverflowResult {
	provider: string;
	model: string;
	contextWindow: number;
	stopReason: string;
	errorMessage: string | undefined;
	usage: Usage;
	hasUsageData: boolean;
	response: AssistantMessage;
}

async function testContextOverflow(model: Model, apiKey: string): Promise<OverflowResult> {
	const overflowContent = generateOverflowContent(model.contextWindow);

	const context: Context = {
		systemPrompt: ["You are a helpful assistant."],
		messages: [
			{
				role: "user",
				content: overflowContent,
				timestamp: Date.now(),
			},
		],
	};

	const response = await complete(model, context, { apiKey });

	const hasUsageData = response.usage.input > 0 || response.usage.cacheRead > 0;

	return {
		provider: model.provider,
		model: model.id,
		contextWindow: model.contextWindow,
		stopReason: response.stopReason,
		errorMessage: response.errorMessage,
		usage: response.usage,
		hasUsageData,
		response,
	};
}

function logResult(result: OverflowResult) {
	console.log(`\n${result.provider} / ${result.model}:`);
	console.log(`  contextWindow: ${result.contextWindow}`);
	console.log(`  stopReason: ${result.stopReason}`);
	console.log(`  errorMessage: ${result.errorMessage}`);
	console.log(`  usage: ${JSON.stringify(result.usage)}`);
	console.log(`  hasUsageData: ${result.hasUsageData}`);
}

// =============================================================================
// Anthropic
// Expected pattern: "prompt is too long: X tokens > Y maximum"
// =============================================================================

describe("Context overflow error handling", () => {
	describe.skipIf(!e2eApiKey("ANTHROPIC_API_KEY"))("Anthropic (API Key)", () => {
		it("claude-haiku-4-5 - should detect overflow via isContextOverflow", async () => {
			const model = getBundledModel("anthropic", "claude-haiku-4-5-20251001");
			const result = await testContextOverflow(model, Bun.env.ANTHROPIC_API_KEY!);
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/prompt is too long/i);
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});

	describe.skipIf(!e2eApiKey("ANTHROPIC_API_KEY"))("Anthropic (OAuth)", () => {
		it("claude-sonnet-4 - should detect overflow via isContextOverflow", async () => {
			const model = getBundledModel("anthropic", "claude-sonnet-4-20250514");
			const result = await testContextOverflow(model, e2eApiKey("ANTHROPIC_API_KEY")!);
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/prompt is too long/i);
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});

	// =============================================================================
	// GitHub Copilot (OAuth)
	// Tests both OpenAI and Anthropic models via Copilot
	// =============================================================================

	describe("GitHub Copilot (OAuth)", () => {
		// OpenAI model via Copilot
		it.skipIf(!githubCopilotToken)(
			"gpt-4o - should detect overflow via isContextOverflow",
			async () => {
				const model = getBundledModel("anthropic", "gpt-4o");
				const result = await testContextOverflow(model, githubCopilotToken!);
				logResult(result);

				expect(result.stopReason).toBe("error");
				expect(result.errorMessage).toMatch(/exceeds the limit of \d+/i);
				expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
			},
			120000,
		);

		// Anthropic model via Copilot
		it.skipIf(!githubCopilotToken)(
			"claude-sonnet-4 - should detect overflow via isContextOverflow",
			async () => {
				const model = getBundledModel("anthropic", "claude-sonnet-4");
				const result = await testContextOverflow(model, githubCopilotToken!);
				logResult(result);

				expect(result.stopReason).toBe("error");
				expect(result.errorMessage).toMatch(/exceeds the limit of \d+/i);
				expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
			},
			120000,
		);
	});

	// =============================================================================
	// OpenAI
	// Expected pattern: "exceeds the context window"
	// =============================================================================

	describe.skipIf(!e2eApiKey("OPENAI_API_KEY"))("OpenAI Completions", () => {
		it("gpt-4o-mini - should detect overflow via isContextOverflow", async () => {
			const model = { ...getBundledModel("openai", "gpt-4o-mini"), api: "openai-completions" as const };
			const result = await testContextOverflow(model, Bun.env.OPENAI_API_KEY!);
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/maximum context length/i);
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});

	describe.skipIf(!e2eApiKey("OPENAI_API_KEY"))("OpenAI Responses", () => {
		it("gpt-4o - should detect overflow via isContextOverflow", async () => {
			const model = getBundledModel("openai", "gpt-4o");
			const result = await testContextOverflow(model, Bun.env.OPENAI_API_KEY!);
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/exceeds the context window/i);
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});

	// =============================================================================
	// Google
	// Expected pattern: "input token count (X) exceeds the maximum"
	// =============================================================================

	describe.skipIf(!e2eApiKey("GEMINI_API_KEY"))("Google", () => {
		it("gemini-2.0-flash - should detect overflow via isContextOverflow", async () => {
			const model = getBundledModel("google", "gemini-2.0-flash");
			const result = await testContextOverflow(model, Bun.env.GEMINI_API_KEY!);
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/input token count.*exceeds the maximum/i);
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});







	// =============================================================================
	// z.ai
	// Special case: Sometimes accepts overflow silently, sometimes rate limits
	// Detection via usage.input > contextWindow when successful
	// =============================================================================

	describe.skipIf(!e2eApiKey("ZAI_API_KEY"))("z.ai", () => {
		it("glm-4.5-flash - should detect overflow via isContextOverflow (silent overflow or rate limit)", async () => {
			const model = getBundledModel("zai", "glm-4.5-flash");
			const result = await testContextOverflow(model, Bun.env.ZAI_API_KEY!);
			logResult(result);

			// z.ai behavior is inconsistent:
			// - Sometimes accepts overflow and returns successfully with usage.input > contextWindow
			// - Sometimes returns rate limit error
			// Either way, isContextOverflow should detect it (via usage check or we skip if rate limited)
			if (result.stopReason === "stop") {
				expect(result.hasUsageData).toBe(true);
				expect(result.usage.input).toBeGreaterThan(model.contextWindow);
				expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
			} else {
				// Rate limited or other error - just log and pass
				console.log("  z.ai returned error (possibly rate limited), skipping overflow detection");
			}
		}, 120000);
	});



	// =============================================================================
	// Ollama (local)
	// =============================================================================

	// Ollama tests require PI_LOCAL_LLM=1 and ollama installed
	const ollamaInstalled = !!Bun.env.PI_LOCAL_LLM && !!$which("ollama");

	describe.skipIf(!ollamaInstalled)("Ollama (local)", () => {
		let ollamaProcess: ChildProcess | null = null;
		let model: Model<"openai-completions"> | undefined;

		beforeAll(async () => {
			if (!ollamaInstalled) return;
			// Check if model is available, if not pull it
			try {
				execSync("ollama list | grep -q 'gpt-oss:20b'", { stdio: "ignore" });
			} catch {
				console.log("Pulling gpt-oss:20b model for Ollama overflow tests...");
				try {
					execSync("ollama pull gpt-oss:20b", { stdio: "inherit" });
				} catch {
					console.warn("Failed to pull gpt-oss:20b model, tests will be skipped");
					return;
				}
			}

			// Start ollama server
			ollamaProcess = spawn("ollama", ["serve"], {
				stdio: "ignore",
			});

			// Wait for server to be ready
			await new Promise<void>(resolve => {
				const checkServer = async () => {
					try {
						const response = await fetch("http://localhost:11434/api/tags");
						if (response.ok) {
							resolve();
						} else {
							setTimeout(checkServer, 500);
						}
					} catch {
						setTimeout(checkServer, 500);
					}
				};
				setTimeout(checkServer, 1000);
			});

			model = {
				id: "gpt-oss:20b",
				api: "openai-completions",
				provider: "ollama",
				baseUrl: "http://localhost:11434/v1",
				reasoning: true,
				input: ["text"],
				contextWindow: 128000,
				maxTokens: 16000,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				name: "Ollama GPT-OSS 20B",
			};
		}, 60000);

		afterAll(() => {
			if (ollamaProcess) {
				ollamaProcess.kill("SIGTERM");
				ollamaProcess = null;
			}
		});

		it("gpt-oss:20b - should detect overflow via isContextOverflow (ollama silently truncates)", async () => {
			if (!model) return;
			const result = await testContextOverflow(model, "ollama");
			logResult(result);

			// Ollama silently truncates input instead of erroring
			// It returns stopReason "stop" with truncated usage
			// We cannot detect overflow via error message, only via usage comparison
			if (result.stopReason === "stop" && result.hasUsageData) {
				// Ollama truncated - check if reported usage is less than what we sent
				// This is a "silent overflow" - we can detect it if we know expected input size
				console.log("  Ollama silently truncated input to", result.usage.input, "tokens");
				// For now, we accept this behavior - Ollama doesn't give us a way to detect overflow
			} else if (result.stopReason === "error") {
				expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
			}
		}, 300000); // 5 min timeout for local model
	});

	// =============================================================================
	// LM Studio (local) - Skip if not running or local LLM tests disabled
	// =============================================================================

	let lmStudioRunning = false;
	if (!Bun.env.PI_NO_LOCAL_LLM) {
		try {
			execSync("curl -s --max-time 1 http://localhost:1234/v1/models > /dev/null", { stdio: "ignore" });
			lmStudioRunning = true;
		} catch {
			lmStudioRunning = false;
		}
	}

	describe.skipIf(!lmStudioRunning)("LM Studio (local)", () => {
		it("should detect overflow via isContextOverflow", async () => {
			const model: Model<"openai-completions"> = {
				id: "local-model",
				api: "openai-completions",
				provider: "lm-studio",
				baseUrl: "http://localhost:1234/v1",
				reasoning: false,
				input: ["text"],
				contextWindow: 8192,
				maxTokens: 2048,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				name: "LM Studio Local Model",
			};

			const result = await testContextOverflow(model, "lm-studio");
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});

	// =============================================================================
	// llama.cpp server (local) - Skip if not running
	// =============================================================================

	let llamaCppRunning = false;
	try {
		execSync("curl -s --max-time 1 http://localhost:8081/health > /dev/null", { stdio: "ignore" });
		llamaCppRunning = true;
	} catch {
		llamaCppRunning = false;
	}

	describe.skipIf(!llamaCppRunning)("llama.cpp (local)", () => {
		it("should detect overflow via isContextOverflow", async () => {
			// Using small context (4096) to match server --ctx-size setting
			const model: Model<"openai-completions"> = {
				id: "local-model",
				api: "openai-completions",
				provider: "llama.cpp",
				baseUrl: "http://localhost:8081/v1",
				reasoning: false,
				input: ["text"],
				contextWindow: 4096,
				maxTokens: 2048,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				name: "llama.cpp Local Model",
			};

			const result = await testContextOverflow(model, "llama.cpp");
			logResult(result);

			expect(result.stopReason).toBe("error");
			expect(isContextOverflow(result.response, model.contextWindow)).toBe(true);
		}, 120000);
	});
});
