import {
	type AssistantMessage,
	type AssistantMessageEvent,
	type Effort,
	getBundledModel,
	type ImageContent,
	type Message,
	type Model,
	type ProviderSessionState,
	type ServiceTier,
	type SimpleStreamOptions,
	streamSimple,
	type TextContent,
	type ThinkingBudgets,
	type ToolChoice,
} from "@gajae-code/ai";
import { agentLoop, agentLoopContinue } from "./agent-loop";
import type { AppendOnlyContextManager } from "./append-only-context";
import type { HarmonyAuditEvent } from "./harmony-leak";
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentMessage,
	AgentState,
	AgentTool,
	AgentToolContext,
	StreamFn,
	ToolCallContext,
} from "./types";

function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
	return messages.filter((m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult");
}

function refreshToolChoiceForActiveTools(
	toolChoice: ToolChoice | undefined,
	tools: AgentContext["tools"] = [],
): ToolChoice | undefined {
	if (!toolChoice || typeof toolChoice === "string") {
		return toolChoice;
	}

	const toolName =
		toolChoice.type === "tool"
			? toolChoice.name
			: "function" in toolChoice
				? toolChoice.function.name
				: toolChoice.name;

	return tools.some(tool => tool.name === toolName) ? toolChoice : undefined;
}

export class AgentBusyError extends Error {
	constructor(
		message: string = "Agent is already processing. Use steer() or followUp() to queue messages, or wait for completion.",
	) {
		super(message);
		this.name = "AgentBusyError";
	}
}
export interface AgentOptions {
	initialState?: Partial<AgentState>;
	convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
	interruptMode?: "immediate" | "wait";
	shouldPause?: AgentLoopConfig["shouldPause"];
	kimiApiFormat?: "openai" | "anthropic";
	preferWebsockets?: boolean;
	streamFn?: StreamFn;
	sessionId?: string;
	providerSessionId?: string;
	providerSessionState?: Map<string, ProviderSessionState>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	getAuthCredentialType?: (provider: string) => "api_key" | "oauth" | undefined;
	onPayload?: SimpleStreamOptions["onPayload"];
	onResponse?: SimpleStreamOptions["onResponse"];
	onSseEvent?: SimpleStreamOptions["onSseEvent"];
	onAssistantMessageEvent?: (message: AssistantMessage, event: AssistantMessageEvent) => void;
	onToolChoiceIncapability?: AgentLoopConfig["onToolChoiceIncapability"];
	onHarmonyLeak?: (event: HarmonyAuditEvent) => void | Promise<void>;
	thinkingBudgets?: ThinkingBudgets;
	temperature?: number;
	topP?: number;
	topK?: number;
	minP?: number;
	presencePenalty?: number;
	repetitionPenalty?: number;
	serviceTier?: ServiceTier;
	hideThinkingSummary?: boolean;
	maxRetryDelayMs?: number;
	requestMaxRetries?: number;
	streamMaxRetries?: number;
	getToolContext?: (toolCall?: ToolCallContext) => AgentToolContext | undefined;
	transformToolCallArguments?: (args: Record<string, unknown>, toolName: string) => Record<string, unknown>;
	intentTracing?: boolean;
	getToolChoice?: () => ToolChoice | undefined;
	beforeToolCall?: AgentLoopConfig["beforeToolCall"];
	afterToolCall?: AgentLoopConfig["afterToolCall"];
	telemetry?: AgentLoopConfig["telemetry"];
	appendOnlyContext?: AppendOnlyContextManager;
}

export interface AgentPromptOptions {
	toolChoice?: ToolChoice;
}

export class Agent {
	#state: AgentState = {
		systemPrompt: [],
		model: getBundledModel("google", "gemini-2.5-flash-lite-preview-06-17"),
		thinkingLevel: undefined,
		tools: [],
		messages: [],
		isStreaming: false,
		streamMessage: null,
		pendingToolCalls: new Set<string>(),
		error: undefined,
	};

	#listeners = new Set<(e: AgentEvent) => void>();
	#abortController?: AbortController;
	#convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	#transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	#steeringQueue: AgentMessage[] = [];
	#followUpQueue: AgentMessage[] = [];
	#steeringMode: "all" | "one-at-a-time";
	#followUpMode: "all" | "one-at-a-time";
	#interruptMode: "immediate" | "wait";
	#sessionId?: string;
	#providerSessionId?: string;
	#metadata?: Record<string, unknown>;
	#metadataResolver?: (provider: string) => Record<string, unknown> | undefined;
	#providerSessionState?: Map<string, ProviderSessionState>;
	#thinkingBudgets?: ThinkingBudgets;
	#temperature?: number;
	#topP?: number;
	#topK?: number;
	#minP?: number;
	#presencePenalty?: number;
	#repetitionPenalty?: number;
	#serviceTier?: ServiceTier;
	#hideThinkingSummary?: boolean;
	#maxRetryDelayMs?: number;
	#requestMaxRetries?: number;
	#streamMaxRetries?: number;
	#getToolContext?: (toolCall?: ToolCallContext) => AgentToolContext | undefined;
	#runningPrompt?: Promise<void>;
	#resolveRunningPrompt?: () => void;
	#runSequence = 0;
	#activeRunId?: number;
	#kimiApiFormat?: "openai" | "anthropic";
	#preferWebsockets?: boolean;
	#transformToolCallArguments?: (args: Record<string, unknown>, toolName: string) => Record<string, unknown>;
	#intentTracing: boolean;
	#getToolChoice?: () => ToolChoice | undefined;
	#onPayload?: SimpleStreamOptions["onPayload"];
	#onResponse?: SimpleStreamOptions["onResponse"];
	#onSseEvent?: SimpleStreamOptions["onSseEvent"];
	#onAssistantMessageEvent?: (message: AssistantMessage, event: AssistantMessageEvent) => void;
	#onToolChoiceIncapability?: AgentLoopConfig["onToolChoiceIncapability"];
	#onHarmonyLeak?: (event: HarmonyAuditEvent) => void | Promise<void>;
	#onBeforeYield?: () => Promise<void> | void;
	#shouldPause?: AgentLoopConfig["shouldPause"];
	#telemetry?: AgentLoopConfig["telemetry"];
	#appendOnlyContext?: AppendOnlyContextManager;

	get intentTracing(): boolean {
		return this.#intentTracing;
	}

	streamFn: StreamFn;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	getAuthCredentialType?: (provider: string) => "api_key" | "oauth" | undefined;
	beforeToolCall?: AgentLoopConfig["beforeToolCall"];
	afterToolCall?: AgentLoopConfig["afterToolCall"];

	constructor(opts: AgentOptions = {}) {
		this.#state = { ...this.#state, ...opts.initialState };
		this.#convertToLlm = opts.convertToLlm || defaultConvertToLlm;
		this.#transformContext = opts.transformContext;
		this.#steeringMode = opts.steeringMode || "one-at-a-time";
		this.#followUpMode = opts.followUpMode || "one-at-a-time";
		this.#interruptMode = opts.interruptMode || "immediate";
		this.streamFn = opts.streamFn || streamSimple;
		this.#sessionId = opts.sessionId;
		this.#providerSessionId = opts.providerSessionId;
		this.#providerSessionState = opts.providerSessionState;
		this.#thinkingBudgets = opts.thinkingBudgets;
		this.#temperature = opts.temperature;
		this.#topP = opts.topP;
		this.#topK = opts.topK;
		this.#minP = opts.minP;
		this.#presencePenalty = opts.presencePenalty;
		this.#repetitionPenalty = opts.repetitionPenalty;
		this.#serviceTier = opts.serviceTier;
		this.#hideThinkingSummary = opts.hideThinkingSummary;
		this.#maxRetryDelayMs = opts.maxRetryDelayMs;
		this.#requestMaxRetries = opts.requestMaxRetries;
		this.#streamMaxRetries = opts.streamMaxRetries;
		this.getApiKey = opts.getApiKey;
		this.getAuthCredentialType = opts.getAuthCredentialType;
		this.#onPayload = opts.onPayload;
		this.#onResponse = opts.onResponse;
		this.#onSseEvent = opts.onSseEvent;
		this.#getToolContext = opts.getToolContext;
		this.#kimiApiFormat = opts.kimiApiFormat;
		this.#preferWebsockets = opts.preferWebsockets;
		this.#transformToolCallArguments = opts.transformToolCallArguments;
		this.#intentTracing = opts.intentTracing === true;
		this.#getToolChoice = opts.getToolChoice;
		this.#onAssistantMessageEvent = opts.onAssistantMessageEvent;
		this.#onToolChoiceIncapability = opts.onToolChoiceIncapability;
		this.#onHarmonyLeak = opts.onHarmonyLeak;
		this.#shouldPause = opts.shouldPause;
		this.beforeToolCall = opts.beforeToolCall;
		this.afterToolCall = opts.afterToolCall;
		this.#telemetry = opts.telemetry;
		this.#appendOnlyContext = opts.appendOnlyContext;
	}

	get sessionId(): string | undefined {
		return this.#sessionId;
	}

	set sessionId(value: string | undefined) {
		this.#sessionId = value;
	}

	get providerSessionId(): string | undefined {
		return this.#providerSessionId;
	}

	set providerSessionId(value: string | undefined) {
		this.#providerSessionId = value;
	}

	get metadata(): Record<string, unknown> | undefined {
		return this.#metadata;
	}

	set metadata(value: Record<string, unknown> | undefined) {
		this.#metadata = value;
		this.#metadataResolver = undefined;
	}

	metadataForProvider(provider: string): Record<string, unknown> | undefined {
		if (this.#metadataResolver) return this.#metadataResolver(provider);
		return this.#metadata;
	}

	setMetadataResolver(resolver: ((provider: string) => Record<string, unknown> | undefined) | undefined): void {
		this.#metadataResolver = resolver;
	}

	get telemetry(): AgentLoopConfig["telemetry"] | undefined {
		return this.#telemetry;
	}

	setTelemetry(telemetry: AgentLoopConfig["telemetry"] | undefined): void {
		this.#telemetry = telemetry;
	}

	get providerSessionState(): Map<string, ProviderSessionState> | undefined {
		return this.#providerSessionState;
	}

	set providerSessionState(value: Map<string, ProviderSessionState> | undefined) {
		this.#providerSessionState = value;
	}

	get thinkingBudgets(): ThinkingBudgets | undefined {
		return this.#thinkingBudgets;
	}

	set thinkingBudgets(value: ThinkingBudgets | undefined) {
		this.#thinkingBudgets = value;
	}

	get temperature(): number | undefined {
		return this.#temperature;
	}

	set temperature(value: number | undefined) {
		this.#temperature = value;
	}

	get topP(): number | undefined {
		return this.#topP;
	}

	set topP(value: number | undefined) {
		this.#topP = value;
	}

	get topK(): number | undefined {
		return this.#topK;
	}

	set topK(value: number | undefined) {
		this.#topK = value;
	}

	get minP(): number | undefined {
		return this.#minP;
	}

	set minP(value: number | undefined) {
		this.#minP = value;
	}

	get presencePenalty(): number | undefined {
		return this.#presencePenalty;
	}

	set presencePenalty(value: number | undefined) {
		this.#presencePenalty = value;
	}

	get repetitionPenalty(): number | undefined {
		return this.#repetitionPenalty;
	}

	set repetitionPenalty(value: number | undefined) {
		this.#repetitionPenalty = value;
	}

	get serviceTier(): ServiceTier | undefined {
		return this.#serviceTier;
	}

	set serviceTier(value: ServiceTier | undefined) {
		this.#serviceTier = value;
	}

	get hideThinkingSummary(): boolean | undefined {
		return this.#hideThinkingSummary;
	}

	set hideThinkingSummary(value: boolean | undefined) {
		this.#hideThinkingSummary = value;
	}

	get maxRetryDelayMs(): number | undefined {
		return this.#maxRetryDelayMs;
	}

	set maxRetryDelayMs(value: number | undefined) {
		this.#maxRetryDelayMs = value;
	}

	get requestMaxRetries(): number | undefined {
		return this.#requestMaxRetries;
	}

	set requestMaxRetries(value: number | undefined) {
		this.#requestMaxRetries = value;
	}

	get streamMaxRetries(): number | undefined {
		return this.#streamMaxRetries;
	}

	set streamMaxRetries(value: number | undefined) {
		this.#streamMaxRetries = value;
	}

	get state(): AgentState {
		return this.#state;
	}

	get appendOnlyContext(): AppendOnlyContextManager | undefined {
		return this.#appendOnlyContext;
	}

	setAppendOnlyContext(manager?: AppendOnlyContextManager): void {
		this.#appendOnlyContext = manager;
	}

	subscribe(fn: (e: AgentEvent) => void): () => void {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	setProviderResponseInterceptor(fn: SimpleStreamOptions["onResponse"] | undefined): void {
		this.#onResponse = fn;
	}

	setRawSseEventInterceptor(fn: SimpleStreamOptions["onSseEvent"] | undefined): void {
		this.#onSseEvent = fn;
	}

	setAssistantMessageEventInterceptor(
		fn: ((message: AssistantMessage, event: AssistantMessageEvent) => void) | undefined,
	): void {
		this.#onAssistantMessageEvent = fn;
	}

	setOnBeforeYield(fn: (() => Promise<void> | void) | undefined): void {
		this.#onBeforeYield = fn;
	}

	setShouldPause(fn: AgentLoopConfig["shouldPause"] | undefined): void {
		this.#shouldPause = fn;
	}

	emitExternalEvent(event: AgentEvent) {
		switch (event.type) {
			case "message_start":
			case "message_update":
				this.#state.streamMessage = event.message;
				break;
			case "message_end":
				this.#state.streamMessage = null;
				this.appendMessage(event.message);
				break;
			case "tool_execution_start": {
				const pending = new Set(this.#state.pendingToolCalls);
				pending.add(event.toolCallId);
				this.#state.pendingToolCalls = pending;
				break;
			}
			case "tool_execution_end": {
				const pending = new Set(this.#state.pendingToolCalls);
				pending.delete(event.toolCallId);
				this.#state.pendingToolCalls = pending;
				break;
			}
		}

		this.#emit(event);
	}

	createExternalEventEmitterForCurrentRun(): ((event: AgentEvent) => void) | undefined {
		const runId = this.#activeRunId;
		if (runId === undefined) return undefined;
		return (event: AgentEvent) => {
			if (this.#activeRunId !== runId) return;
			this.emitExternalEvent(event);
		};
	}

	setSystemPrompt(v: string[]) {
		this.#state.systemPrompt = v;
	}

	setModel(m: Model) {
		this.#state.model = m;
	}

	setThinkingLevel(l: Effort | undefined) {
		this.#state.thinkingLevel = l;
	}

	setSteeringMode(mode: "all" | "one-at-a-time") {
		this.#steeringMode = mode;
	}

	getSteeringMode(): "all" | "one-at-a-time" {
		return this.#steeringMode;
	}

	setFollowUpMode(mode: "all" | "one-at-a-time") {
		this.#followUpMode = mode;
	}

	getFollowUpMode(): "all" | "one-at-a-time" {
		return this.#followUpMode;
	}

	setInterruptMode(mode: "immediate" | "wait") {
		this.#interruptMode = mode;
	}

	getInterruptMode(): "immediate" | "wait" {
		return this.#interruptMode;
	}

	setTools(t: AgentTool<any>[]) {
		this.#state.tools = t;
	}

	replaceMessages(ms: AgentMessage[]) {
		this.#state.messages = ms.slice();
	}

	appendMessage(m: AgentMessage) {
		this.#state.messages = [...this.#state.messages, m];
	}

	popMessage(): AgentMessage | undefined {
		const messages = this.#state.messages.slice(0, -1);
		const removed = this.#state.messages.at(-1);
		this.#state.messages = messages;

		if (removed && this.#state.streamMessage === removed) {
			this.#state.streamMessage = null;
		}

		return removed;
	}

	steer(m: AgentMessage) {
		this.#steeringQueue.push(m);
	}

	followUp(m: AgentMessage) {
		this.#followUpQueue.push(m);
	}

	clearSteeringQueue() {
		this.#steeringQueue = [];
	}

	clearFollowUpQueue() {
		this.#followUpQueue = [];
	}

	clearAllQueues() {
		this.#steeringQueue = [];
		this.#followUpQueue = [];
	}

	hasQueuedMessages(): boolean {
		return this.#steeringQueue.length > 0 || this.#followUpQueue.length > 0;
	}

	hasQueuedSteering(): boolean {
		return this.#steeringQueue.length > 0;
	}

	snapshotSteering(): AgentMessage[] {
		return this.#steeringQueue.slice();
	}

	restoreSteering(messages: AgentMessage[]): void {
		if (messages.length === 0) return;
		this.#steeringQueue = [...messages, ...this.#steeringQueue];
	}

	snapshotFollowUp(): AgentMessage[] {
		return this.#followUpQueue.slice();
	}

	restoreFollowUp(messages: AgentMessage[]): void {
		if (messages.length === 0) return;
		this.#followUpQueue = [...messages, ...this.#followUpQueue];
	}

	#dequeueSteeringMessages(): AgentMessage[] {
		if (this.#steeringMode === "one-at-a-time") {
			if (this.#steeringQueue.length > 0) {
				const first = this.#steeringQueue[0];
				this.#steeringQueue = this.#steeringQueue.slice(1);
				return [first];
			}
			return [];
		}
		const steering = this.#steeringQueue.slice();
		this.#steeringQueue = [];
		return steering;
	}

	#dequeueFollowUpMessages(): AgentMessage[] {
		if (this.#followUpMode === "one-at-a-time") {
			if (this.#followUpQueue.length > 0) {
				const first = this.#followUpQueue[0];
				this.#followUpQueue = this.#followUpQueue.slice(1);
				return [first];
			}
			return [];
		}
		const followUp = this.#followUpQueue.slice();
		this.#followUpQueue = [];
		return followUp;
	}

	/**
	 * Remove and return the last steering message from the queue (LIFO).
	 * Used by dequeue keybinding.
	 */
	popLastSteer(): AgentMessage | undefined {
		return this.#steeringQueue.pop();
	}

	/**
	 * Remove and return the last follow-up message from the queue (LIFO).
	 * Used by dequeue keybinding.
	 */
	popLastFollowUp(): AgentMessage | undefined {
		return this.#followUpQueue.pop();
	}

	/** Remove queued steering+follow-up messages matching `predicate`, preserving order of the rest. */
	removeQueuedMessages(predicate: (message: AgentMessage) => boolean): {
		steering: number;
		followUp: number;
		total: number;
	} {
		const beforeSteering = this.#steeringQueue.length;
		const beforeFollowUp = this.#followUpQueue.length;
		this.#steeringQueue = this.#steeringQueue.filter(m => !predicate(m));
		this.#followUpQueue = this.#followUpQueue.filter(m => !predicate(m));
		const steering = beforeSteering - this.#steeringQueue.length;
		const followUp = beforeFollowUp - this.#followUpQueue.length;
		return { steering, followUp, total: steering + followUp };
	}

	clearMessages() {
		this.#state.messages = [];
	}

	abort() {
		this.#abortController?.abort();
	}

	/**
	 * Force the current run out of the busy/streaming state when cooperative abort
	 * did not drain. The abandoned provider/tool stream may still settle later, so
	 * #runLoop guards every state mutation with a run id.
	 */
	forceAbort(reason = "Force aborted"): boolean {
		const hadActiveRun = this.#runningPrompt !== undefined || this.#state.isStreaming;
		if (!hadActiveRun) return false;

		this.#abortController?.abort(reason);
		this.#activeRunId = undefined;
		this.#state.isStreaming = false;
		this.#state.streamMessage = null;
		this.#state.pendingToolCalls = new Set<string>();
		this.#abortController = undefined;

		const resolve = this.#resolveRunningPrompt;
		this.#runningPrompt = undefined;
		this.#resolveRunningPrompt = undefined;
		resolve?.();

		this.#emit({ type: "agent_end", messages: [] });
		return true;
	}

	waitForIdle(): Promise<void> {
		return this.#runningPrompt ?? Promise.resolve();
	}

	reset() {
		this.#state.messages = [];
		this.#state.isStreaming = false;
		this.#state.streamMessage = null;
		this.#state.pendingToolCalls = new Set<string>();
		this.#state.error = undefined;
		this.#steeringQueue = [];
		this.#followUpQueue = [];
	}

	/** Send a prompt with an AgentMessage */
	async prompt(message: AgentMessage | AgentMessage[], options?: AgentPromptOptions): Promise<void>;
	async prompt(input: string, options?: AgentPromptOptions): Promise<void>;
	async prompt(input: string, images?: ImageContent[], options?: AgentPromptOptions): Promise<void>;
	async prompt(
		input: string | AgentMessage | AgentMessage[],
		imagesOrOptions?: ImageContent[] | AgentPromptOptions,
		options?: AgentPromptOptions,
	) {
		if (this.#state.isStreaming) {
			throw new AgentBusyError();
		}

		const model = this.#state.model;
		if (!model) throw new Error("No model configured");

		let msgs: AgentMessage[];
		let promptOptions: AgentPromptOptions | undefined;
		let images: ImageContent[] | undefined;

		if (Array.isArray(input)) {
			msgs = input;
			promptOptions = imagesOrOptions as AgentPromptOptions | undefined;
		} else if (typeof input === "string") {
			if (Array.isArray(imagesOrOptions)) {
				images = imagesOrOptions;
				promptOptions = options;
			} else {
				promptOptions = imagesOrOptions;
			}
			const content: Array<TextContent | ImageContent> = [{ type: "text", text: input }];
			if (images && images.length > 0) {
				content.push(...images);
			}
			msgs = [
				{
					role: "user",
					content,
					timestamp: Date.now(),
				},
			];
		} else {
			msgs = [input];
			promptOptions = imagesOrOptions as AgentPromptOptions | undefined;
		}

		await this.#runLoop(msgs, promptOptions);
	}

	/**
	 * Continue from current context (used for retries and resuming queued messages).
	 */
	async continue() {
		if (this.#state.isStreaming) {
			throw new AgentBusyError();
		}

		const messages = this.#state.messages;
		if (messages.length === 0) {
			throw new Error("No messages to continue from");
		}
		if (messages[messages.length - 1].role === "assistant") {
			const queuedSteering = this.#dequeueSteeringMessages();
			if (queuedSteering.length > 0) {
				await this.#runLoop(queuedSteering, { skipInitialSteeringPoll: true });
				return;
			}

			const queuedFollowUp = this.#dequeueFollowUpMessages();
			if (queuedFollowUp.length > 0) {
				await this.#runLoop(queuedFollowUp);
				return;
			}

			throw new Error("Cannot continue from message role: assistant");
		}

		await this.#runLoop(undefined);
	}

	/**
	 * Run the agent loop.
	 * If messages are provided, starts a new conversation turn with those messages.
	 * Otherwise, continues from existing context.
	 */
	async #runLoop(messages?: AgentMessage[], options?: AgentPromptOptions & { skipInitialSteeringPoll?: boolean }) {
		const model = this.#state.model;
		if (!model) throw new Error("No model configured");

		let skipInitialSteeringPoll = options?.skipInitialSteeringPoll === true;

		const { promise, resolve } = Promise.withResolvers<void>();
		this.#runningPrompt = promise;
		this.#resolveRunningPrompt = resolve;

		const runId = ++this.#runSequence;
		this.#activeRunId = runId;
		const abortController = new AbortController();
		this.#abortController = abortController;
		this.#state.isStreaming = true;
		this.#state.streamMessage = null;
		this.#state.error = undefined;

		const reasoning = this.#state.thinkingLevel;

		const context: AgentContext = {
			systemPrompt: this.#state.systemPrompt,
			messages: this.#state.messages.slice(),
			tools: this.#state.tools,
		};

		const getToolChoice = () =>
			this.#getToolChoice?.() ?? refreshToolChoiceForActiveTools(options?.toolChoice, this.#state.tools);

		const config: AgentLoopConfig = {
			model,
			reasoning,
			temperature: this.#temperature,
			topP: this.#topP,
			topK: this.#topK,
			minP: this.#minP,
			presencePenalty: this.#presencePenalty,
			repetitionPenalty: this.#repetitionPenalty,
			serviceTier: this.#serviceTier,
			hideThinkingSummary: this.#hideThinkingSummary,
			interruptMode: this.#interruptMode,
			sessionId: this.#sessionId,
			providerSessionId: this.#providerSessionId,
			metadata: this.#metadataResolver ? undefined : this.#metadata,
			metadataResolver: this.#metadataResolver,
			providerSessionState: this.#providerSessionState,
			thinkingBudgets: this.#thinkingBudgets,
			maxRetryDelayMs: this.#maxRetryDelayMs,
			requestMaxRetries: this.#requestMaxRetries,
			streamMaxRetries: this.#streamMaxRetries,
			kimiApiFormat: this.#kimiApiFormat,
			preferWebsockets: this.#preferWebsockets,
			convertToLlm: this.#convertToLlm,
			transformContext: this.#transformContext,
			onPayload: this.#onPayload,
			onResponse: this.#onResponse,
			onSseEvent: this.#onSseEvent,
			signal: abortController.signal,
			getApiKey: this.getApiKey,
			getAuthCredentialType: this.getAuthCredentialType,
			getToolContext: this.#getToolContext,
			syncContextBeforeModelCall: async context => {
				if (this.#listeners.size > 0) {
					await Bun.sleep(0);
				}
				context.systemPrompt = this.#state.systemPrompt;
				context.tools = this.#state.tools;
			},
			transformToolCallArguments: this.#transformToolCallArguments,
			intentTracing: this.#intentTracing,
			appendOnlyContext: this.#appendOnlyContext,
			beforeToolCall: this.beforeToolCall
				? async (ctx, signal) => {
						if (this.#activeRunId !== runId) return undefined;
						const result = await this.beforeToolCall?.(ctx, signal);
						if (this.#activeRunId !== runId) return undefined;
						return result;
					}
				: undefined,
			afterToolCall: this.afterToolCall
				? async (ctx, signal) => {
						if (this.#activeRunId !== runId) return undefined;
						const result = await this.afterToolCall?.(ctx, signal);
						if (this.#activeRunId !== runId) return undefined;
						return result;
					}
				: undefined,
			onAssistantMessageEvent: this.#onAssistantMessageEvent
				? (message, event) => {
						if (this.#activeRunId !== runId) return;
						this.#onAssistantMessageEvent?.(message, event);
					}
				: undefined,
			onToolChoiceIncapability: this.#onToolChoiceIncapability
				? event => {
						if (this.#activeRunId !== runId) return;
						this.#onToolChoiceIncapability?.(event);
					}
				: undefined,
			onHarmonyLeak: this.#onHarmonyLeak,
			getToolChoice,
			getReasoning: () => this.#state.thinkingLevel,
			getSteeringMessages: async () => {
				if (this.#activeRunId !== runId) {
					return [];
				}
				if (skipInitialSteeringPoll) {
					skipInitialSteeringPoll = false;
					return [];
				}
				const queued = this.#dequeueSteeringMessages();
				if (this.#activeRunId !== runId) {
					this.#steeringQueue = [...queued, ...this.#steeringQueue];
					return [];
				}
				return queued;
			},
			getFollowUpMessages: async () => {
				if (this.#activeRunId !== runId) {
					return [];
				}
				const queued = this.#dequeueFollowUpMessages();
				if (this.#activeRunId !== runId) {
					this.#followUpQueue = [...queued, ...this.#followUpQueue];
					return [];
				}
				return queued;
			},
			onBeforeYield: async () => {
				if (this.#activeRunId !== runId) return;
				await this.#onBeforeYield?.();
			},
			shouldPause: () => {
				if (this.#activeRunId !== runId) return false;
				return this.#shouldPause?.() === true;
			},
			telemetry: this.#telemetry,
		};

		let partial: AgentMessage | null = null;

		try {
			const stream = messages
				? agentLoop(messages, context, config, abortController.signal, this.streamFn)
				: agentLoopContinue(context, config, abortController.signal, this.streamFn);

			for await (const event of stream) {
				if (this.#activeRunId !== runId) {
					break;
				}

				// Update internal state based on events
				switch (event.type) {
					case "message_start":
						partial = event.message;
						this.#state.streamMessage = event.message;
						break;

					case "message_update":
						partial = event.message;
						this.#state.streamMessage = event.message;
						break;

					case "message_end":
						partial = null;
						this.#state.streamMessage = null;
						this.appendMessage(event.message);
						break;

					case "tool_execution_start": {
						const s = new Set(this.#state.pendingToolCalls);
						s.add(event.toolCallId);
						this.#state.pendingToolCalls = s;
						break;
					}

					case "tool_execution_end": {
						const s = new Set(this.#state.pendingToolCalls);
						s.delete(event.toolCallId);
						this.#state.pendingToolCalls = s;
						break;
					}

					case "turn_end":
						if (event.message.role === "assistant" && (event.message as any).errorMessage) {
							this.#state.error = (event.message as any).errorMessage;
						}
						break;

					case "agent_end":
						this.#state.isStreaming = false;
						this.#state.streamMessage = null;
						break;
				}

				// Emit to listeners
				this.#emit(event);
			}

			if (this.#activeRunId !== runId) {
				return;
			}

			// Handle any remaining partial message
			if (partial && partial.role === "assistant" && Array.isArray(partial.content) && partial.content.length > 0) {
				const onlyEmpty = !partial.content.some(
					c =>
						(c.type === "thinking" && c.thinking.trim().length > 0) ||
						(c.type === "text" && c.text.trim().length > 0) ||
						(c.type === "toolCall" && c.name.trim().length > 0),
				);
				if (!onlyEmpty) {
					this.appendMessage(partial);
				} else {
					if (abortController.signal.aborted) {
						throw new Error("Request was aborted");
					}
				}
			}
		} catch (err: any) {
			if (this.#activeRunId !== runId) {
				return;
			}

			const errorMsg: AgentMessage = {
				role: "assistant",
				content: [{ type: "text", text: "" }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: abortController.signal.aborted ? "aborted" : "error",
				errorMessage: err?.message || String(err),
				timestamp: Date.now(),
			} as AgentMessage;

			this.appendMessage(errorMsg);
			this.#state.error = err?.message || String(err);
			this.#emit({ type: "agent_end", messages: [errorMsg] });
		} finally {
			if (this.#activeRunId === runId) {
				this.#state.isStreaming = false;
				this.#state.streamMessage = null;
				this.#state.pendingToolCalls = new Set<string>();
				this.#abortController = undefined;
				this.#activeRunId = undefined;
				this.#resolveRunningPrompt?.();
				this.#runningPrompt = undefined;
				this.#resolveRunningPrompt = undefined;
			}
		}
	}

	#emit(e: AgentEvent) {
		for (const listener of this.#listeners) {
			listener(e);
		}
	}
}
