import type {
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStream,
	Effort,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	Static,
	streamSimple,
	TextContent,
	Tool,
	ToolChoice,
	ToolResultMessage,
	TSchema,
} from "@gajae-code/ai";
import type { AppendOnlyContextManager } from "./append-only-context";
import type { HarmonyAuditEvent } from "./harmony-leak";

/** Stream function - can return sync or Promise for async config lookup */
export type StreamFn = (
	...args: Parameters<typeof streamSimple>
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

export interface AgentLoopConfig extends SimpleStreamOptions {
	model: Model;
	interruptMode?: "immediate" | "wait";
	sessionId?: string;
	providerSessionId?: string;

	metadataResolver?: (provider: string) => Record<string, unknown> | undefined;
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	getAuthCredentialType?: (provider: string) => "api_key" | "oauth" | undefined;
	getSteeringMessages?: () => Promise<AgentMessage[]>;
	getFollowUpMessages?: () => Promise<AgentMessage[]>;
	shouldPause?: () => boolean;
	onBeforeYield?: () => Promise<void> | void;

	/**
	 * Provides tool execution context, resolved per tool call.
	 * Use for late-bound UI or session state access.
	 */
	getToolContext?: (toolCall?: ToolCallContext) => AgentToolContext | undefined;
	syncContextBeforeModelCall?: (context: AgentContext) => void | Promise<void>;

	/**
	 * Optional transform applied to tool call arguments before execution.
	 * Use for deobfuscating secrets or rewriting arguments.
	 */
	transformToolCallArguments?: (args: Record<string, unknown>, toolName: string) => Record<string, unknown>;

	/**
	 * Enable intent tracing for tool calls.
	 * When enabled, the harness injects a `string` field into tool schemas sent to the model,
	 * then strips from arguments before executing tools.
	 */
	intentTracing?: boolean;
	appendOnlyContext?: AppendOnlyContextManager;

	onAssistantMessageEvent?: (message: AssistantMessage, event: AssistantMessageEvent) => void;
	onToolChoiceIncapability?: (event: Extract<AssistantMessageEvent, { type: "toolChoiceIncapability" }>) => void;
	onHarmonyLeak?: (event: HarmonyAuditEvent) => void | Promise<void>;
	getToolChoice?: () => ToolChoice | undefined;
	getReasoning?: () => Effort | undefined;

	/**
	 * Called after a tool call has been validated and is about to execute.
	 *
	 * Return `{ block: true }` to prevent execution. The loop emits an error tool
	 * result instead (using `reason` as the error text, or a default if omitted).
	 *
	 * Mutating `context.args` in place changes the arguments passed to `tool.execute`
	 * — the loop does **not** re-validate after this hook runs.
	 *
	 * The hook receives the tool abort signal (`signal`) and is responsible for
	 * honoring it. Throwing surfaces as a tool-error result and does not abort the
	 * rest of the batch.
	 */
	beforeToolCall?: (
		context: BeforeToolCallContext,
		signal?: AbortSignal,
	) => Promise<BeforeToolCallResult | undefined> | BeforeToolCallResult | undefined;

	/**
	 * Called after a tool finishes executing, before `tool_execution_end` and the
	 * tool-result message are emitted.
	 *
	 * Return an `AfterToolCallResult` to override individual fields of the executed
	 * tool result. Omitted fields keep their original values; there is no deep merge.
	 *
	 * Throwing surfaces as a tool-error result and does not abort the rest of the batch.
	 */
	afterToolCall?: (
		context: AfterToolCallContext,
		signal?: AbortSignal,
	) => Promise<AfterToolCallResult | undefined> | AfterToolCallResult | undefined;
}

/**
 * Batch/sequencing metadata for the tool call currently being processed.
 */
export interface ToolCallContext {
	batchId: string;
	index: number;
	total: number;
	toolCalls: Array<{ id: string; name: string }>;
}

/** A single tool-call content block emitted by an assistant message. */
export type AgentToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

/**
 * Result returned from `beforeToolCall`.
 *
 * Set `block: true` to prevent the tool from executing. The loop emits an error tool
 * result instead, using `reason` as the error text (or a default if omitted).
 *
 * Mutating the `args` reference passed in `BeforeToolCallContext` is supported and
 * survives into execution — the loop does **not** re-validate after this hook runs.
 */
export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
}

/**
 * Partial override returned from `afterToolCall`.
 *
 * Merge semantics are field-by-field; omitted fields keep the executed values.
 * No deep merge is performed.
 */
export interface AfterToolCallResult {
	/** If provided, replaces the tool result content array in full. */
	content?: (TextContent | ImageContent)[];
	/** If provided, replaces the tool result details payload in full. */
	details?: unknown;
	/** If provided, replaces the error flag carried with the tool result. */
	isError?: boolean;
}

/** Context passed to `beforeToolCall`. */
export interface BeforeToolCallContext {
	/** The assistant message that requested the tool call. */
	assistantMessage: AssistantMessage;
	/** The raw tool call block from `assistantMessage.content`. */
	toolCall: AgentToolCall;
	/**
	 * Validated tool arguments. The same reference is forwarded to `tool.execute`
	 * (after any `transformToolCallArguments` pass), so in-place mutations stick.
	 */
	args: Record<string, unknown>;
	/** Current agent context at the time the tool call is prepared. */
	context: AgentContext;
}

/** Context passed to `afterToolCall`. */
export interface AfterToolCallContext {
	/** The assistant message that requested the tool call. */
	assistantMessage: AssistantMessage;
	/** The raw tool call block from `assistantMessage.content`. */
	toolCall: AgentToolCall;
	/** Validated tool arguments used for execution (post `beforeToolCall` mutations). */
	args: Record<string, unknown>;
	/** The executed tool result before any `afterToolCall` overrides are applied. */
	result: AgentToolResult<any>;
	/** Whether the executed tool result is currently treated as an error. */
	isError: boolean;
	/** Current agent context at the time the tool call is finalized. */
	context: AgentContext;
}

export interface CustomAgentMessages {
	// Empty by default - apps extend via declaration merging
}

export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/**
 * Agent state containing all configuration and conversation data.
 */
export interface AgentState {
	systemPrompt: string[];
	model: Model;
	thinkingLevel?: Effort;
	tools: AgentTool<any>[];
	messages: AgentMessage[]; // Can include attachments + custom message types
	isStreaming: boolean;
	streamMessage: AgentMessage | null;
	pendingToolCalls: Set<string>;
	error?: string;
}

export interface AgentToolResult<T = any, _TInput = unknown> {
	content: (TextContent | ImageContent)[];
	details?: T;
	isError?: boolean;
}

// Callback for streaming tool execution updates
export type AgentToolUpdateCallback<T = any, TInput = unknown> = (partialResult: AgentToolResult<T, TInput>) => void;

/** Options passed to renderResult */
export interface RenderResultOptions {
	/** Whether the result view is expanded */
	expanded: boolean;
	/** Whether this is a partial/streaming result */
	isPartial: boolean;
	/** Current spinner frame index for animated elements (optional) */
	spinnerFrame?: number;
}

/**
 * Context passed to tool execution.
 * Apps can extend via declaration merging.
 */
export interface AgentToolContext {
	// Empty by default - apps extend via declaration merging
}

export type AgentToolExecFn<TParameters extends TSchema = TSchema, TDetails = any, TTheme = unknown> = (
	this: AgentTool<TParameters, TDetails, TTheme>,
	toolCallId: string,
	params: Static<TParameters>,
	signal?: AbortSignal,
	onUpdate?: AgentToolUpdateCallback<TDetails, TParameters>,
	context?: AgentToolContext,
) => Promise<AgentToolResult<TDetails, TParameters>>;

export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any, TTheme = unknown>
	extends Tool<TParameters> {
	// A human-readable label for the tool to be displayed in UI
	label: string;
	/** If true, tool is excluded unless explicitly listed in --tools or agent's tools field */
	hidden?: boolean;
	/** If true, tool can stage a pending action that requires explicit resolution via the resolve tool. */
	deferrable?: boolean;
	/** Built-in tool loading behavior. "essential" loads initially; "discoverable" can be activated by tool search. */
	loadMode?: "essential" | "discoverable";
	/** Short one-line summary used for tool discovery indexes. */
	summary?: string;
	/** If true, tool execution ignores abort signals (runs to completion) */
	nonAbortable?: boolean;
	/**
	 * Concurrency mode for tool scheduling when multiple calls are in one turn.
	 * - "shared": can run alongside other shared tools (default)
	 * - "exclusive": runs alone; other tools wait until it finishes
	 */
	concurrency?: "shared" | "exclusive";
	/** If true, argument validation errors are non-fatal: raw args are passed to execute() instead of returning an error to the LLM. */
	lenientArgValidation?: boolean;
	/**
	 * Controls how the INTENT_FIELD (`_i`) is handled for this tool.
	 * - `"require"` (default): `_i` is injected and required in the parameter schema.
	 * - `"optional"`: `_i` is injected as an optional/nullable field.
	 * - `"omit"`: `_i` is NOT injected. Use for tools where intent is obvious (yield, resolve, todo_write, …).
	 * - function: `_i` is NOT injected; intent is derived dynamically from (potentially partial / streaming) args.
	 */
	intent?: "omit" | "optional" | "require" | ((args: Partial<Static<TParameters>>) => string | undefined);

	/** The main execution callback for this tool. */
	execute: AgentToolExecFn<TParameters, TDetails, TTheme>;

	/** Optional custom rendering for tool call display (returns UI component) */
	renderCall?: (args: Static<TParameters>, options: RenderResultOptions, theme: TTheme) => unknown;

	/** Optional custom rendering for tool result display (returns UI component) */
	renderResult?: (
		result: AgentToolResult<TDetails, TParameters>,
		options: RenderResultOptions,
		theme: TTheme,
	) => unknown;
}

export interface AgentContext {
	systemPrompt: string[];
	messages: AgentMessage[];
	tools?: AgentTool<any>[];
}

export type AgentEvent =
	| { type: "agent_start" }
	| {
			type: "agent_end";
			messages: AgentMessage[];
			stopReason?: "completed" | "paused";
	  }
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// Message lifecycle - emitted for user, assistant, and toolResult messages
	| { type: "message_start"; message: AgentMessage }
	// Only emitted for assistant messages during streaming
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
	// Tool execution lifecycle
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any; intent?: string }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError?: boolean };
