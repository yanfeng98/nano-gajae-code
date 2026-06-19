import { afterEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getBundledModel } from "@gajae-code/ai/models";
import type { AssistantMessage, Message, ProviderPayload, ProviderSessionState, Usage } from "@gajae-code/ai/types";
import { createOpenAIResponsesHistoryPayload } from "@gajae-code/ai/utils";
import * as asyncModule from "@gajae-code/coding-agent/async";
import * as settingsModule from "@gajae-code/coding-agent/config/settings";
import type { CreateAgentSessionResult } from "@gajae-code/coding-agent/sdk";
import * as sdkModule from "@gajae-code/coding-agent/sdk";
import type { AgentSession, ForkContextSeed } from "@gajae-code/coding-agent/session/agent-session";
import type { AuthStorage } from "@gajae-code/coding-agent/session/auth-storage";
import {
	type SessionEntry,
	SessionManager,
	type SessionMessageEntry,
} from "@gajae-code/coding-agent/session/session-manager";
import * as taskModule from "@gajae-code/coding-agent/task";
import * as agentsModule from "@gajae-code/coding-agent/task/agents";
import * as discoveryModule from "@gajae-code/coding-agent/task/discovery";
import * as eventBusModule from "@gajae-code/coding-agent/utils/event-bus";
import { Snowflake } from "@gajae-code/utils";

function createUsage(): Usage {
	return {
		input: 1,
		output: 1,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createUserHistoryPayload(provider = "openai"): ProviderPayload {
	return createOpenAIResponsesHistoryPayload(provider, [
		{ type: "message", role: "user", content: [{ type: "input_text", text: "Preserved user history" }] },
		{ type: "compaction", encrypted_content: "enc_preserved" },
	]);
}

function createStaleAssistantHistoryPayload(provider = "openai"): ProviderPayload {
	return createOpenAIResponsesHistoryPayload(provider, [
		{ type: "reasoning", encrypted_content: "enc_stale" },
		{
			type: "message",
			role: "assistant",
			status: "completed",
			id: "msg_stale_snapshot",
			content: [{ type: "output_text", text: "Stale native snapshot" }],
		},
	]);
}

function createStaleAssistantMessage(
	text: string,
	options: { api?: AssistantMessage["api"]; provider?: string; model?: string } = {},
): AssistantMessage {
	const { api = "openai-responses", provider = "openai", model = "gpt-5-mini" } = options;
	return {
		role: "assistant",
		content: [
			{
				type: "thinking",
				thinking: "Reasoning summary",
				thinkingSignature: JSON.stringify({
					type: "reasoning",
					id: "rs_stale",
					encrypted_content: "enc_stale",
				}),
			},
			{ type: "text", text, textSignature: "text_sig_preserved" },
			{
				type: "toolCall",
				id: "tool_call_1",
				name: "read",
				arguments: { path: "README.md" },
				thoughtSignature: "tool_sig_preserved",
			},
		],
		api,
		provider,
		model,
		usage: createUsage(),
		stopReason: "stop",
		providerPayload: createStaleAssistantHistoryPayload(provider),
		timestamp: Date.now(),
	};
}

function isSessionMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
	return entry.type === "message";
}

function getMessageEntries(sessionManager: SessionManager): SessionMessageEntry[] {
	return sessionManager.getEntries().filter(isSessionMessageEntry);
}

function getTextContent(message: Message): string | undefined {
	if (typeof message.content === "string") return message.content;
	return message.content.find(block => block.type === "text")?.text;
}

function findPersistedMessageEntry(
	sessionManager: SessionManager,
	role: Message["role"],
	text: string,
): SessionMessageEntry {
	const entry = getMessageEntries(sessionManager).find(candidate => {
		if (candidate.message.role !== role) return false;
		return getTextContent(candidate.message) === text;
	});
	if (!entry) {
		throw new Error(`Expected persisted ${role} message with text: ${text}`);
	}
	return entry;
}

function findRuntimeAssistant(session: AgentSession, text: string): AssistantMessage {
	const message = session.messages.find(
		candidate => candidate.role === "assistant" && getTextContent(candidate) === text,
	);
	if (message?.role !== "assistant") {
		throw new Error(`Expected runtime assistant message with text: ${text}`);
	}
	return message;
}

function expectAssistantReplayMetadataSanitized(message: AssistantMessage): void {
	// After rehydration, assistant Responses-family providerPayload must be stripped
	// to prevent stale native history replay on warmed sessions.
	expect(message.providerPayload).toBeUndefined();

	const thinkingBlock = message.content.find(block => block.type === "thinking");
	if (thinkingBlock?.type !== "thinking") {
		throw new Error("Expected assistant thinking block");
	}
	expect(thinkingBlock.thinkingSignature).toBeUndefined();

	const textBlock = message.content.find(block => block.type === "text");
	if (textBlock?.type !== "text") {
		throw new Error("Expected assistant text block");
	}
	expect(textBlock.textSignature).toBe("text_sig_preserved");

	const toolCallBlock = message.content.find(block => block.type === "toolCall");
	if (toolCallBlock?.type !== "toolCall") {
		throw new Error("Expected assistant tool call block");
	}
	expect(toolCallBlock).toMatchObject({
		id: "tool_call_1",
		name: "read",
		arguments: { path: "README.md" },
		thoughtSignature: "tool_sig_preserved",
	});
}

async function createPersistedSession(
	tempDir: string,
	populate: (sessionManager: SessionManager) => { treeTargetId?: string } | undefined,
): Promise<{ sessionFile: string; treeTargetId?: string }> {
	const sessionManager = SessionManager.create(tempDir, tempDir);
	const result = populate(sessionManager);
	await sessionManager.flush();
	const sessionFile = sessionManager.getSessionFile();
	if (!sessionFile) {
		throw new Error("Expected persisted session file");
	}
	await sessionManager.close();
	return { sessionFile, treeTargetId: result?.treeTargetId };
}

async function createSessionHarness(
	tempDir: string,
	sessionManager: SessionManager,
	options: {
		provider?: Parameters<typeof getBundledModel>[0];
		modelId?: string;
		forkContextSeed?: ForkContextSeed;
		providerSessionId?: string;
		providerSessionState?: Map<string, ProviderSessionState>;
		settings?: Record<string, unknown>;
	} = {},
): Promise<{ session: AgentSession; authStorage: AuthStorage }> {
	const { provider = "openai", modelId = "gpt-5-mini" } = options;
	const [{ createAgentSession }, { Settings }, { AuthStorage }] = await Promise.all([
		import("@gajae-code/coding-agent/sdk"),
		import("@gajae-code/coding-agent/config/settings"),
		import("@gajae-code/coding-agent/session/auth-storage"),
	]);
	const authStorage = await AuthStorage.create(path.join(tempDir, `testauth-${Snowflake.next()}.db`));
	authStorage.setRuntimeApiKey("openai", "test-key");
	const model = getBundledModel(provider, modelId);
	if (!model) {
		throw new Error(`Expected bundled test model ${provider}/${modelId}`);
	}

	const { session } = await createAgentSession({
		cwd: tempDir,
		agentDir: tempDir,
		authStorage,
		sessionManager,
		model,
		settings: Settings.isolated(options.settings ?? {}),
		disableExtensionDiscovery: true,
		skills: [],
		contextFiles: [],
		promptTemplates: [],
		slashCommands: [],
		enableMCP: false,
		enableLsp: false,
		forkContextSeed: options.forkContextSeed,
		providerSessionId: options.providerSessionId,
		providerSessionState: options.providerSessionState,
	});

	return { session, authStorage };
}

describe("AgentSession OpenAI Responses replay boundaries", () => {
	const sessions: AgentSession[] = [];
	const authStorages: AuthStorage[] = [];
	const tempDirs: string[] = [];

	afterEach(async () => {
		while (sessions.length > 0) {
			await sessions.pop()?.dispose();
		}
		while (authStorages.length > 0) {
			authStorages.pop()?.close();
		}
		while (tempDirs.length > 0) {
			const tempDir = tempDirs.pop();
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		}
	});

	it("sanitizes stale assistant replay metadata during startup resume while preserving user payloads", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-startup-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const preservedUserPayload = createUserHistoryPayload();
		const assistantText = "Loaded assistant response";

		const { sessionFile } = await createPersistedSession(tempDir, sessionManager => {
			sessionManager.appendMessage({
				role: "user",
				content: "Preserved summary",
				providerPayload: preservedUserPayload,
				timestamp: Date.now() - 2,
			});
			sessionManager.appendMessage(createStaleAssistantMessage(assistantText));
			sessionManager.appendMessage({ role: "user", content: "Follow-up", timestamp: Date.now() - 1 });
		});

		const reloadedSessionManager = await SessionManager.open(sessionFile, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, reloadedSessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const persistedUser = findPersistedMessageEntry(session.sessionManager, "user", "Preserved summary").message;
		if (persistedUser.role !== "user") {
			throw new Error("Expected persisted user message");
		}
		expect(persistedUser.providerPayload).toEqual(preservedUserPayload);

		const persistedAssistant = findPersistedMessageEntry(session.sessionManager, "assistant", assistantText).message;
		if (persistedAssistant.role !== "assistant") {
			throw new Error("Expected persisted assistant message");
		}
		expectAssistantReplayMetadataSanitized(persistedAssistant);

		const runtimeAssistant = findRuntimeAssistant(session, assistantText);
		expectAssistantReplayMetadataSanitized(runtimeAssistant);
		const runtimeUser = session.messages.find(
			message => message.role === "user" && getTextContent(message) === "Preserved summary",
		);
		if (runtimeUser?.role !== "user") {
			throw new Error("Expected runtime user message");
		}
		expect(runtimeUser.providerPayload).toEqual(preservedUserPayload);
	});


	it("sanitizes stale assistant replay metadata when forking a persisted session", async () => {
		const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-fork-source-${Snowflake.next()}-`));
		const forkDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-fork-target-${Snowflake.next()}-`));
		tempDirs.push(sourceDir, forkDir);
		const preservedUserPayload = createUserHistoryPayload();
		const assistantText = "Forked assistant snapshot";

		const { sessionFile } = await createPersistedSession(sourceDir, sessionManager => {
			sessionManager.appendMessage({
				role: "user",
				content: "Fork summary",
				providerPayload: preservedUserPayload,
				timestamp: Date.now() - 2,
			});
			sessionManager.appendMessage(createStaleAssistantMessage(assistantText));
		});

		const forkedSessionManager = await SessionManager.forkFrom(sessionFile, forkDir, forkDir);
		const forkedAssistant = findPersistedMessageEntry(forkedSessionManager, "assistant", assistantText).message;
		if (forkedAssistant.role !== "assistant") {
			throw new Error("Expected forked assistant message");
		}
		expectAssistantReplayMetadataSanitized(forkedAssistant);

		const forkedUser = findPersistedMessageEntry(forkedSessionManager, "user", "Fork summary").message;
		if (forkedUser.role !== "user") {
			throw new Error("Expected forked user message");
		}
		expect(forkedUser.providerPayload).toEqual(preservedUserPayload);
		await forkedSessionManager.close();
	});


	it("propagates appendOnlyPrefixSnapshot through buildForkContextSeed when append-only mode is active", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-fc-default-append-only-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const parentManager = SessionManager.create(tempDir, tempDir);

		const deepseekModel = getBundledModel("deepseek", "deepseek-chat");
		const provider: Parameters<typeof getBundledModel>[0] = deepseekModel ? "deepseek" : "openai";
		const modelId = deepseekModel ? "deepseek-chat" : "gpt-5-mini";

		const { session: parent, authStorage } = await createSessionHarness(tempDir, parentManager, {
			provider,
			modelId,
			settings: { "provider.appendOnlyContext": "on" },
		});
		sessions.push(parent);
		authStorages.push(authStorage);

		parent.agent.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Refactor auth." }],
			attribution: "user",
			timestamp: Date.now() - 10_000,
		});

		const seed = await parent.buildForkContextSeed({ maxMessages: 10, maxTokens: 10_000 });

		if (parent.agent.appendOnlyContext) {
			expect(seed.appendOnlyPrefixSnapshot).toBeDefined();
			expect(seed.appendOnlyPrefixSnapshot?.fingerprint).toBe(parent.agent.appendOnlyContext.prefix.fingerprint);

			const parentFingerprintBefore = parent.agent.appendOnlyContext.prefix.fingerprint;
			(seed.appendOnlyPrefixSnapshot as { fingerprint: string }).fingerprint = "TAMPER";
			expect(parent.agent.appendOnlyContext.prefix.fingerprint).toBe(parentFingerprintBefore);
		} else {
			expect(seed.appendOnlyPrefixSnapshot).toBeUndefined();
		}
	});

	it("spawns bundled executor and architect via TaskTool with inheritContext: bounded through the production path", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-fc-task-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const parentManager = SessionManager.create(tempDir, tempDir);

		const { session: parent, authStorage } = await createSessionHarness(tempDir, parentManager, {
			settings: { "task.forkContext.enabled": true },
		});
		sessions.push(parent);
		authStorages.push(authStorage);

		parent.agent.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Establishing parent context for fork-context spawn test." }],
			attribution: "user",
			timestamp: Date.now() - 10_000,
		});

		const bundledExecutor = agentsModule.getBundledAgent("executor");
		const bundledArchitect = agentsModule.getBundledAgent("architect");
		expect(bundledExecutor?.forkContext).toBe("allowed");
		expect(bundledArchitect?.forkContext).toBe("allowed");

		vi.spyOn(discoveryModule, "discoverAgents").mockResolvedValue({
			agents: [bundledExecutor!, bundledArchitect!],
			projectAgentsDir: null,
		});

		const childCaptures: Array<{
			agentDisplayName?: string;
			forkContextSeed?: ForkContextSeed;
			providerSessionId?: string;
		}> = [];
		vi.spyOn(sdkModule, "createAgentSession").mockImplementation(async (options = {}) => {
			childCaptures.push({
				agentDisplayName: options.agentDisplayName,
				forkContextSeed: options.forkContextSeed,
				providerSessionId: options.providerSessionId,
			});
			const listeners: Array<
				(event: Parameters<AgentSession["subscribe"]>[0] extends (event: infer E) => void ? E : never) => void
			> = [];
			const stubSession: Partial<AgentSession> = {
				state: { messages: [] } as unknown as AgentSession["state"],
				agent: { state: { systemPrompt: ["stub"] } } as unknown as AgentSession["agent"],
				model: undefined,
				sessionManager: {
					appendSessionInit: () => {},
					getSessionFile: () => null,
					getArtifactsDir: () => null,
				} as unknown as AgentSession["sessionManager"],
				getActiveToolNames: () => ["yield"],
				setActiveToolsByName: async () => {},
				subscribe: ((listener: (typeof listeners)[number]) => {
					listeners.push(listener);
					return () => {
						const index = listeners.indexOf(listener);
						if (index >= 0) listeners.splice(index, 1);
					};
				}) as AgentSession["subscribe"],
				prompt: async () => {
					(stubSession.state as { messages: Message[] }).messages.push({
						role: "assistant",
						content: [{ type: "text", text: "(stub-yield)" }],
						api: "openai-responses",
						provider: "openai",
						model: "mock",
						usage: createUsage(),
						stopReason: "stop",
						timestamp: Date.now(),
					});
					for (const listener of listeners) {
						listener({
							type: "tool_execution_end",
							toolCallId: "yield-call",
							toolName: "yield",
							result: {
								content: [{ type: "text", text: "Result submitted." }],
								details: { status: "success", data: { ok: true } },
							},
							isError: false,
						});
					}
				},
				waitForIdle: async () => {},
				getLastAssistantMessage: () => {
					const messages = (stubSession.state as { messages: Message[] }).messages;
					for (let i = messages.length - 1; i >= 0; i--) {
						const message = messages[i];
						if (message?.role === "assistant") return message as AssistantMessage;
					}
					return undefined;
				},
				abort: async () => {},
				dispose: async () => {},
			};
			return {
				session: stubSession as AgentSession,
				extensionsResult: {} as CreateAgentSessionResult["extensionsResult"],
				setToolUIContext: () => {},
				eventBus: new eventBusModule.EventBus(),
			} satisfies CreateAgentSessionResult;
		});

		const manager = new asyncModule.AsyncJobManager({ onJobComplete: async () => {} });
		asyncModule.AsyncJobManager.setInstance(manager);

		const toolSession = {
			cwd: tempDir,
			hasUI: false,
			settings: settingsModule.Settings.isolated({
				"async.enabled": false,
				"task.forkContext.enabled": true,
			}),
			getSessionFile: () => parent.sessionManager.getSessionFile(),
			getSessionSpawns: () => "*",
			model: parent.model,
			buildForkContextSeed: (opts: Parameters<AgentSession["buildForkContextSeed"]>[0]) =>
				parent.buildForkContextSeed(opts),
			modelRegistry: {
				authStorage: undefined,
				refresh: async () => {},
				getAvailable: () => [],
				getApiKey: async () => null,
			},
		};

		const tool = await taskModule.TaskTool.create(
			toolSession as unknown as Parameters<typeof taskModule.TaskTool.create>[0],
		);

		await tool.execute("call-exec", {
			agent: "executor",
			tasks: [{ id: "ExecFork", description: "d", assignment: "a", inheritContext: "bounded" }],
		});
		await tool.execute("call-arch", {
			agent: "architect",
			tasks: [{ id: "ArchFork", description: "d", assignment: "a", inheritContext: "bounded" }],
		});
		try {
			await manager.waitForAll();
		} finally {
			await manager.dispose({ timeoutMs: 100 });
			asyncModule.AsyncJobManager.resetForTests();
			vi.restoreAllMocks();
		}

		expect(childCaptures).toHaveLength(2);
		const execChild = childCaptures.find(o => o.agentDisplayName === "executor");
		const archChild = childCaptures.find(o => o.agentDisplayName === "architect");
		expect(execChild).toBeDefined();
		expect(archChild).toBeDefined();

		for (const child of [execChild!, archChild!]) {
			expect(child.forkContextSeed).toBeDefined();
			// cacheIdentity is the seed-borne identity; it must reuse the parent's sessionId so
			// the child session's provider-side prefix cache hits when configured via sdk.ts:870
			// (which uses options.forkContextSeed?.cacheIdentity as the providerSessionId fallback).
			expect(child.forkContextSeed!.cacheIdentity).toBe(parent.sessionId);
		}
	});


	it("captures session-manager state when custom message details are proxy-backed", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-capture-proxy-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const sessionManager = SessionManager.create(tempDir, tempDir);
		const proxyDetails = new Proxy({ ok: true, nested: { value: "preserved" } }, {});

		sessionManager.appendCustomMessageEntry("proxy-details", "Proxy metadata", true, proxyDetails);

		const snapshot = sessionManager.captureState();
		const customEntry = snapshot.fileEntries.find(
			entry => entry.type === "custom_message" && entry.customType === "proxy-details",
		);
		if (customEntry?.type !== "custom_message") {
			throw new Error("Expected captured custom message entry");
		}
		expect(customEntry.details).toEqual({ ok: true, nested: { value: "preserved" } });
		await sessionManager.close();
	});

	it("reloads when current session contains proxy-backed custom message details", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-reload-proxy-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const sessionManager = SessionManager.create(tempDir, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, sessionManager);
		sessions.push(session);
		authStorages.push(authStorage);
		const proxyDetails = new Proxy({ ok: true, nested: { value: "preserved" } }, {});

		await session.sendCustomMessage(
			{
				customType: "proxy-details",
				content: "Proxy metadata",
				display: true,
				details: proxyDetails,
			},
			{ triggerTurn: false },
		);

		const originalSessionFile = session.sessionFile;
		expect(originalSessionFile).toBeDefined();

		await session.reload();

		expect(() => session.sessionManager.captureState()).not.toThrow();
		expect(session.sessionFile).toBe(originalSessionFile);
	});



	it("resets plain openai-responses provider state when same-file reload restores a different saved model", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-reload-openai-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const assistantText = "Reloaded openai responses model change";

		const { sessionFile } = await createPersistedSession(tempDir, sessionManager => {
			sessionManager.appendModelChange("openai/gpt-5-mini");
			sessionManager.appendMessage(createStaleAssistantMessage(assistantText));
		});

		const reloadedSessionManager = await SessionManager.open(sessionFile, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, reloadedSessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const closeSpy = vi.fn();
		session.providerSessionState.set("openai-responses:openai", { close: closeSpy } satisfies ProviderSessionState);

		const mutatedSessionManager = await SessionManager.open(sessionFile, tempDir);
		mutatedSessionManager.appendModelChange("openai/gpt-5.4-mini");
		await mutatedSessionManager.flush();
		expect(mutatedSessionManager.buildSessionContext().models.default).toBe("openai/gpt-5.4-mini");
		await mutatedSessionManager.close();

		await session.reload();

		expect(session.model?.provider).toBe("openai");
		expect(session.model?.id).toBe("gpt-5.4-mini");
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(session.providerSessionState.size).toBe(0);
		expectAssistantReplayMetadataSanitized(findRuntimeAssistant(session, assistantText));
	});

	it("switches sessions without requiring write access during load-time sanitization", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-switch-fail-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const currentSessionManager = SessionManager.create(tempDir, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, currentSessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const { sessionFile } = await createPersistedSession(tempDir, sessionManager => {
			sessionManager.appendMessage(createStaleAssistantMessage("Unreadable assistant snapshot"));
		});
		const sessionDir = path.dirname(sessionFile);
		const originalMode = fs.statSync(sessionDir).mode & 0o777;
		fs.chmodSync(sessionDir, 0o555);

		const closeSpy = vi.fn();
		session.providerSessionState.set("openai-responses:openai", { close: closeSpy } satisfies ProviderSessionState);

		try {
			await expect(session.switchSession(sessionFile)).resolves.toBe(true);
		} finally {
			fs.chmodSync(sessionDir, originalMode);
		}

		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(session.providerSessionState.size).toBe(0);
		expect(session.sessionManager).toBe(currentSessionManager);
		expect(session.sessionFile).toBe(sessionFile);
		expectAssistantReplayMetadataSanitized(findRuntimeAssistant(session, "Unreadable assistant snapshot"));
	});

	it("clears provider session state and sanitizes loaded assistant metadata when switching sessions", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-switch-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const preservedUserPayload = createUserHistoryPayload();
		const assistantText = "Switched assistant response";

		const currentSessionManager = SessionManager.create(tempDir, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, currentSessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const { sessionFile } = await createPersistedSession(tempDir, sessionManager => {
			sessionManager.appendMessage({
				role: "user",
				content: "Older summary",
				providerPayload: preservedUserPayload,
				timestamp: Date.now() - 2,
			});
			sessionManager.appendMessage(createStaleAssistantMessage(assistantText));
			sessionManager.appendMessage({ role: "user", content: "Older follow-up", timestamp: Date.now() - 1 });
		});

		const closeSpy = vi.fn();
		session.providerSessionState.set("stale-provider-session", { close: closeSpy } satisfies ProviderSessionState);

		const switched = await session.switchSession(sessionFile);
		expect(switched).toBe(true);
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(session.providerSessionState.size).toBe(0);

		const persistedAssistant = findPersistedMessageEntry(session.sessionManager, "assistant", assistantText).message;
		if (persistedAssistant.role !== "assistant") {
			throw new Error("Expected persisted assistant message after switch");
		}
		expectAssistantReplayMetadataSanitized(persistedAssistant);
		const persistedUser = findPersistedMessageEntry(session.sessionManager, "user", "Older summary").message;
		if (persistedUser.role !== "user") {
			throw new Error("Expected switched user message");
		}
		expect(persistedUser.providerPayload).toEqual(preservedUserPayload);
		expectAssistantReplayMetadataSanitized(findRuntimeAssistant(session, assistantText));
	});

	it("does not reintroduce stale assistant replay metadata when navigating to another branch after load sanitization", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-tree-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const branchAssistantText = "Archived branch assistant";

		const { sessionFile, treeTargetId } = await createPersistedSession(tempDir, sessionManager => {
			const rootUserId = sessionManager.appendMessage({ role: "user", content: "Root", timestamp: Date.now() - 5 });
			const mainAssistantId = sessionManager.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "Main branch" }],
				api: "openai-responses",
				provider: "openai",
				model: "gpt-5-mini",
				usage: createUsage(),
				stopReason: "stop",
				timestamp: Date.now() - 4,
			});
			sessionManager.branch(rootUserId);
			sessionManager.appendMessage({ role: "user", content: "Archived branch", timestamp: Date.now() - 3 });
			const archivedAssistantId = sessionManager.appendMessage(createStaleAssistantMessage(branchAssistantText));
			sessionManager.branch(mainAssistantId);
			sessionManager.appendMessage({ role: "user", content: "Active branch leaf", timestamp: Date.now() - 2 });
			return { treeTargetId: archivedAssistantId };
		});

		if (!treeTargetId) {
			throw new Error("Expected archived branch target id");
		}

		const reloadedSessionManager = await SessionManager.open(sessionFile, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, reloadedSessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const navigation = await session.navigateTree(treeTargetId, { summarize: false });
		expect(navigation.cancelled).toBe(false);
		expectAssistantReplayMetadataSanitized(findRuntimeAssistant(session, branchAssistantText));

		const persistedAssistant = findPersistedMessageEntry(
			session.sessionManager,
			"assistant",
			branchAssistantText,
		).message;
		if (persistedAssistant.role !== "assistant") {
			throw new Error("Expected archived branch assistant entry");
		}
		expectAssistantReplayMetadataSanitized(persistedAssistant);
	});

	it("resets provider session state when starting a brand-new session", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-issue-505-new-${Snowflake.next()}-`));
		tempDirs.push(tempDir);
		const sessionManager = SessionManager.create(tempDir, tempDir);
		const { session, authStorage } = await createSessionHarness(tempDir, sessionManager);
		sessions.push(session);
		authStorages.push(authStorage);

		const closeSpy = vi.fn();
		session.providerSessionState.set("live-provider-session", { close: closeSpy } satisfies ProviderSessionState);

		const created = await session.newSession();
		expect(created).toBe(true);
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(session.providerSessionState.size).toBe(0);
	});
});
