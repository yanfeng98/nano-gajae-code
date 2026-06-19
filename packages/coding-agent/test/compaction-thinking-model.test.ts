/**
 * Test for compaction with thinking models (Anthropic API).
 *
 * Reproduces issue where compact fails when maxTokens < thinkingBudget.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Agent } from "@gajae-code/agent-core";
import { Effort, getBundledModel, type Model, type Effort as ThinkingLevelType } from "@gajae-code/ai";
import { ModelRegistry } from "@gajae-code/coding-agent/config/model-registry";
import { Settings } from "@gajae-code/coding-agent/config/settings";
import { AgentSession } from "@gajae-code/coding-agent/session/agent-session";
import { AuthStorage } from "@gajae-code/coding-agent/session/auth-storage";
import { SessionManager } from "@gajae-code/coding-agent/session/session-manager";
import { createTools, type ToolSession } from "@gajae-code/coding-agent/tools";
import { Snowflake } from "@gajae-code/utils";
import { e2eApiKey } from "./utilities";

const HAS_ANTHROPIC_AUTH = !!e2eApiKey("ANTHROPIC_API_KEY");

describe.skipIf(!HAS_ANTHROPIC_AUTH)("Compaction with thinking models (Anthropic)", () => {
	let session: AgentSession;
	let tempDir: string;
	let authStorage: AuthStorage | undefined;

	beforeEach(() => {
		tempDir = path.join(os.tmpdir(), `pi-thinking-compaction-anthropic-test-${Snowflake.next()}`);
		fs.mkdirSync(tempDir, { recursive: true });
	});

	afterEach(async () => {
		if (session) {
			await session.dispose();
		}
		authStorage?.close();
		authStorage = undefined;
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true });
		}
	});

	async function createSession(model: Model, thinkingLevel: ThinkingLevelType = Effort.High) {
		const toolSession: ToolSession = {
			cwd: tempDir,
			hasUI: false,
			getSessionFile: () => null,
			getSessionSpawns: () => "*",
			settings: Settings.isolated(),
		};
		const tools = await createTools(toolSession);

		const agent = new Agent({
			getApiKey: () => e2eApiKey("ANTHROPIC_API_KEY"),
			initialState: {
				model,
				systemPrompt: ["You are a helpful assistant. Be concise."],
				tools,
				thinkingLevel,
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settings = Settings.isolated();

		authStorage = await AuthStorage.create(path.join(tempDir, "testauth.db"));
		const modelRegistry = new ModelRegistry(authStorage);

		session = new AgentSession({
			agent,
			sessionManager,
			settings,
			modelRegistry,
		});

		session.subscribe(() => {});

		return session;
	}

	it("should compact successfully with claude-3-7-sonnet and thinking level high", async () => {
		const model = getBundledModel("anthropic", "claude-3-7-sonnet-latest")!;
		await createSession(model, Effort.High);

		// Send a simple prompt
		await session.prompt("Write down the first 10 prime numbers.");
		await session.agent.waitForIdle();

		// Verify we got a response
		const messages = session.messages;
		expect(messages.length).toBeGreaterThan(0);

		const assistantMessages = messages.filter(m => m.role === "assistant");
		expect(assistantMessages.length).toBeGreaterThan(0);

		// Now try to compact - this should not throw
		const result = await session.compact();

		expect(result.summary).toBeDefined();
		expect(result.summary.length).toBeGreaterThan(0);
		expect(result.tokensBefore).toBeGreaterThan(0);

		// Verify session is still usable after compaction
		const messagesAfterCompact = session.messages;
		expect(messagesAfterCompact.length).toBeGreaterThan(0);
		expect(messagesAfterCompact[0].role).toBe("compactionSummary");
	}, 180000);
});
