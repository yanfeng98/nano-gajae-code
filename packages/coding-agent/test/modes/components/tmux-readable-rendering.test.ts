import { beforeAll, describe, expect, it } from "bun:test";
import type { AssistantMessage } from "@gajae-code/ai";
import { resetSettingsForTest, Settings } from "@gajae-code/coding-agent/config/settings";
import { AssistantMessageComponent } from "@gajae-code/coding-agent/modes/components/assistant-message";
import { BranchSummaryMessageComponent } from "@gajae-code/coding-agent/modes/components/branch-summary-message";
import { CompactionSummaryMessageComponent } from "@gajae-code/coding-agent/modes/components/compaction-summary-message";
import { CustomMessageComponent } from "@gajae-code/coding-agent/modes/components/custom-message";
import { HookMessageComponent } from "@gajae-code/coding-agent/modes/components/hook-message";
import { SkillMessageComponent } from "@gajae-code/coding-agent/modes/components/skill-message";
import { ToolExecutionComponent } from "@gajae-code/coding-agent/modes/components/tool-execution";
import { UserMessageComponent } from "@gajae-code/coding-agent/modes/components/user-message";
import {
	getMarkdownTheme,
	getThemeByName,
	initTheme,
	setThemeInstance,
	type Theme,
} from "@gajae-code/coding-agent/modes/theme/theme";
import type { CustomMessage, HookMessage, SkillPromptDetails } from "@gajae-code/coding-agent/session/messages";
import { renderOutputBlock } from "@gajae-code/coding-agent/tui/output-block";
import type { TUI } from "@gajae-code/tui";

const sgrPattern = /\x1b\[([0-9;]*)m/g;
const uiStub = { requestRender() {} } as unknown as TUI;

function hasSgrCode(text: string, code: string): boolean {
	for (const match of text.matchAll(sgrPattern)) {
		const rawParams = match[1];
		const params = rawParams === "" ? ["0"] : rawParams.split(";");
		if (params.includes(code)) return true;
	}
	return false;
}

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

async function useTheme(name: "red-claw" | "blue-crab"): Promise<Theme> {
	const theme = await getThemeByName(name);
	expect(theme).toBeDefined();
	setThemeInstance(theme!);
	return theme!;
}

beforeAll(async () => {
	resetSettingsForTest();
	await Settings.init({ inMemory: true, cwd: process.cwd() });
	await initTheme(false, undefined, undefined, "red-claw", "blue-crab");
});

describe("tmux-readable rendering", () => {
	for (const themeName of ["red-claw", "blue-crab"] as const) {
		it(`renders ${themeName} user messages without a full-width background`, async () => {
			await useTheme(themeName);

			const rendered = new UserMessageComponent("hello *there*\n\n> quoted").render(80).join("\n");

			expect(hasSgrCode(rendered, "48")).toBe(false);
			expect(hasSgrCode(rendered, "3")).toBe(false);
			expect(Bun.stripANSI(rendered)).toContain("hello there");
			expect(Bun.stripANSI(rendered)).toContain("quoted");
		});

		it(`renders ${themeName} assistant prose and thinking without terminal-unsafe styling`, async () => {
			const activeTheme = await useTheme(themeName);
			const markdownTheme = getMarkdownTheme();
			const assistantMessage = createAssistantMessage([
				{ type: "thinking", thinking: "thinking *quietly*" },
				{ type: "text", text: "final *answer*\n\n> cited line" },
			]);

			const rendered = new AssistantMessageComponent(assistantMessage).render(80).join("\n");

			expect(activeTheme.italic("sample")).toBe("sample");
			expect(markdownTheme.italic("sample")).toBe("sample");
			expect(hasSgrCode(rendered, "48")).toBe(false);
			expect(hasSgrCode(rendered, "3")).toBe(false);
			expect(Bun.stripANSI(rendered)).toContain("thinking quietly");
			expect(Bun.stripANSI(rendered)).toContain("final answer");
			expect(Bun.stripANSI(rendered)).toContain("cited line");
		});

		it(`renders ${themeName} tool executions without a full-width background`, async () => {
			await useTheme(themeName);
			const component = new ToolExecutionComponent("unknown_tool", { value: "demo" }, {}, undefined, uiStub);
			component.updateResult({ content: [{ type: "text", text: "ready" }], isError: false }, false);

			const rendered = component.render(80).join("\n");

			expect(hasSgrCode(rendered, "48")).toBe(false);
			expect(hasSgrCode(rendered, "3")).toBe(false);
			expect(Bun.stripANSI(rendered)).toContain("ready");
		});

		it(`renders ${themeName} output blocks without a state background by default`, async () => {
			const theme = await useTheme(themeName);

			const rendered = renderOutputBlock(
				{ header: "Bash", state: "success", sections: [{ lines: ["done"] }], width: 80 },
				theme,
			).join("\n");

			expect(hasSgrCode(rendered, "48")).toBe(false);
			expect(hasSgrCode(rendered, "3")).toBe(false);
			expect(Bun.stripANSI(rendered)).toContain("done");
		});

		it(`renders ${themeName} auxiliary message blocks without a full-width background`, async () => {
			await useTheme(themeName);
			const customMessage: CustomMessage = {
				role: "custom",
				customType: "notice",
				content: "custom body",
				display: true,
				timestamp: Date.now(),
			};
			const hookMessage: HookMessage = {
				role: "hookMessage",
				customType: "hook",
				content: "hook body",
				display: true,
				timestamp: Date.now(),
			};
			const skillMessage: CustomMessage<SkillPromptDetails> = {
				role: "custom",
				customType: "skill-prompt",
				content: "skill body",
				display: true,
				details: { name: "demo", path: "/tmp/demo/SKILL.md", lineCount: 7 },
				timestamp: Date.now(),
			};
			const rendered = [
				new CustomMessageComponent(customMessage).render(80).join("\n"),
				new HookMessageComponent(hookMessage).render(80).join("\n"),
				new SkillMessageComponent(skillMessage).render(80).join("\n"),
				new BranchSummaryMessageComponent({
					role: "branchSummary",
					summary: "branch summary",
					fromId: "message-1",
					timestamp: Date.now(),
				})
					.render(80)
					.join("\n"),
				new CompactionSummaryMessageComponent({
					role: "compactionSummary",
					summary: "compaction summary",
					tokensBefore: 1234,
					timestamp: Date.now(),
				})
					.render(80)
					.join("\n"),
			].join("\n");

			expect(hasSgrCode(rendered, "48")).toBe(false);
			expect(hasSgrCode(rendered, "3")).toBe(false);
			expect(Bun.stripANSI(rendered)).toContain("custom body");
			expect(Bun.stripANSI(rendered)).toContain("hook body");
			expect(Bun.stripANSI(rendered)).toContain("demo");
			expect(Bun.stripANSI(rendered)).toContain("Branch summary");
			expect(Bun.stripANSI(rendered)).toContain("Compacted from 1,234 tokens");
		});
	}
});
