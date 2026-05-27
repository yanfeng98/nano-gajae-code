import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import {
	buildActiveUltragoalPromptContext,
	buildSkillActivationAdditionalContext,
	buildSkillStopOutput,
	recordSkillActivation,
} from "./skill-state";

export type GjcNativeHookEventName = "UserPromptSubmit" | "Stop";

export interface GjcNativeHookDispatchResult {
	hookEventName: GjcNativeHookEventName | null;
	outputJson: Record<string, unknown> | null;
}

type HookPayload = Record<string, unknown>;

function safeString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function readHookEventName(payload: HookPayload): GjcNativeHookEventName | null {
	const raw = safeString(payload.hook_event_name ?? payload.hookEventName ?? payload.event ?? payload.name).trim();
	return raw === "UserPromptSubmit" || raw === "Stop" ? raw : null;
}

function readPromptText(payload: HookPayload): string {
	return safeString(payload.prompt ?? payload.user_prompt ?? payload.userPrompt).trim();
}

function readSessionId(payload: HookPayload): string | undefined {
	return safeString(payload.session_id ?? payload.sessionId).trim() || undefined;
}

function readThreadId(payload: HookPayload): string | undefined {
	return safeString(payload.thread_id ?? payload.threadId).trim() || undefined;
}

function readTurnId(payload: HookPayload): string | undefined {
	return safeString(payload.turn_id ?? payload.turnId).trim() || undefined;
}

export async function dispatchGjcNativeSkillHook(
	payload: HookPayload,
	options: { cwd?: string; stateDir?: string } = {},
): Promise<GjcNativeHookDispatchResult> {
	const hookEventName = readHookEventName(payload);
	const cwd = (options.cwd ?? safeString(payload.cwd).trim()) || process.cwd();
	if (hookEventName === "UserPromptSubmit") {
		const prompt = readPromptText(payload);
		const skillState = prompt
			? await recordSkillActivation({
					cwd,
					text: prompt,
					sessionId: readSessionId(payload),
					threadId: readThreadId(payload),
					turnId: readTurnId(payload),
					stateDir: options.stateDir,
				})
			: null;
		const activeUltragoalContext = skillState
			? null
			: await buildActiveUltragoalPromptContext({
					cwd,
					sessionId: readSessionId(payload),
					threadId: readThreadId(payload),
					stateDir: options.stateDir,
				});
		return {
			hookEventName,
			outputJson:
				skillState || activeUltragoalContext
					? {
							hookSpecificOutput: {
								hookEventName,
								additionalContext: skillState
									? buildSkillActivationAdditionalContext(skillState)
									: activeUltragoalContext,
							},
						}
					: null,
		};
	}

	if (hookEventName === "Stop") {
		return {
			hookEventName,
			outputJson: await buildSkillStopOutput({
				cwd,
				sessionId: readSessionId(payload),
				threadId: readThreadId(payload),
				stateDir: options.stateDir,
			}),
		};
	}

	return { hookEventName, outputJson: null };
}

async function readStdinJson(): Promise<{ payload: HookPayload; parseError: Error | null }> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of Bun.stdin.stream()) {
		chunks.push(chunk);
	}
	const raw = Buffer.concat(chunks).toString("utf-8").trim();
	if (!raw) return { payload: {}, parseError: null };
	try {
		return { payload: JSON.parse(raw) as HookPayload, parseError: null };
	} catch (error) {
		return { payload: {}, parseError: error instanceof Error ? error : new Error(String(error)) };
	}
}

async function logHookError(cwd: string, type: string, error: unknown): Promise<void> {
	const logsDir = path.join(cwd, ".gjc", "logs");
	await mkdir(logsDir, { recursive: true }).catch(() => {});
	await appendFile(
		path.join(logsDir, `native-hook-${new Date().toISOString().split("T")[0]}.jsonl`),
		`${JSON.stringify({ timestamp: new Date().toISOString(), type, error: error instanceof Error ? error.message : String(error) })}\n`,
	).catch(() => {});
}

export async function runGjcNativeSkillHookCli(): Promise<void> {
	const { payload, parseError } = await readStdinJson();
	if (parseError) {
		await logHookError(process.cwd(), "native_hook_stdin_parse_error", parseError);
		process.stdout.write(
			`${JSON.stringify({
				decision: "block",
				reason: "GJC native hook received malformed JSON input.",
				hookSpecificOutput: {
					hookEventName: "Unknown",
					additionalContext: `stdin JSON parsing failed inside gjc codex-native-hook: ${parseError.message}`,
				},
			})}\n`,
		);
		return;
	}

	try {
		const result = await dispatchGjcNativeSkillHook(payload);
		if (result.outputJson) {
			process.stdout.write(`${JSON.stringify(result.outputJson)}\n`);
		} else if (result.hookEventName === "Stop") {
			process.stdout.write("{}\n");
		}
	} catch (error) {
		const cwd = safeString(payload.cwd).trim() || process.cwd();
		await logHookError(cwd, "native_hook_dispatch_error", error);
		if (readHookEventName(payload) === "Stop") {
			const detail = error instanceof Error ? error.message : String(error);
			process.stdout.write(
				`${JSON.stringify({
					decision: "block",
					reason: "GJC native Stop hook failed before normal continuation handling.",
					stopReason: "gjc_native_stop_dispatch_failure",
					systemMessage: `GJC native Stop hook failed before normal continuation handling. Failure: ${detail}`,
				})}\n`,
			);
		} else {
			process.exitCode = 1;
		}
	}
}
