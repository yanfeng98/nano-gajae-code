import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { sessionStateDir } from "../src/gjc-runtime/session-layout";
import { ensureWorkflowSkillActivationState } from "../src/hooks/skill-state";
import { getDeepInterviewMutationDecision } from "../src/skill-state/deep-interview-mutation-guard";

describe("bash mutation guard fd duplication", () => {
	let tempDir: string | undefined;
	let originalGjcSessionId: string | undefined;

	beforeAll(() => {
		originalGjcSessionId = process.env.GJC_SESSION_ID;
		process.env.GJC_SESSION_ID = "test-session";
	});

	afterAll(() => {
		if (originalGjcSessionId === undefined) {
			delete process.env.GJC_SESSION_ID;
		} else {
			process.env.GJC_SESSION_ID = originalGjcSessionId;
		}
	});

	afterEach(async () => {
		if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	});

	async function cwd(): Promise<string> {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gjc-mutation-guard-fd-dup-"));
		return tempDir;
	}

	it("ignores numeric fd-dup bash redirects while preserving real redirect targets", async () => {
		const root = await cwd();
		await ensureWorkflowSkillActivationState({
			cwd: root,
			skill: "ralplan",
			sessionId: "session-fd-dup",
			threadId: "thread-fd-dup",
			stateDir: sessionStateDir(root, "session-fd-dup"),
		});

		for (const command of [
			"gjc ralplan --write --stage final /tmp/plan.md 2>&1",
			"gjc ralplan --write --stage final /tmp/plan.md >&2",
			"gjc ralplan --write --stage final /tmp/plan.md 1>&2",
		]) {
			const decision = await getDeepInterviewMutationDecision({
				cwd: root,
				sessionId: "session-fd-dup",
				tool: { name: "bash" } as never,
				args: { command },
			});
			expect(decision.blocked).toBe(false);
			expect(decision.targets).not.toContain("&1");
			expect(decision.targets).not.toContain("&2");
		}

		for (const [command, target] of [
			["echo hi > src/file.ts", "src/file.ts"],
			["echo hi 2> .gjc/state/x", ".gjc/state/x"],
			["echo hi >> file", "file"],
			["cat <<EOF > /tmp/scratch.md", "/tmp/scratch.md"],
		] as const) {
			const decision = await getDeepInterviewMutationDecision({
				cwd: root,
				sessionId: "session-fd-dup",
				tool: { name: "bash" } as never,
				args: { command },
			});
			expect(decision.targets).toContain(target);
			if (command !== "cat <<EOF > /tmp/scratch.md") expect(decision.blocked).toBe(true);
		}
	});

	it("never blocks sanctioned gjc commands with shell output operators", async () => {
		const root = await cwd();
		await ensureWorkflowSkillActivationState({
			cwd: root,
			skill: "ralplan",
			sessionId: "session-gjc-ok",
			threadId: "thread-gjc-ok",
			stateDir: sessionStateDir(root, "session-gjc-ok"),
		});

		for (const command of [
			"gjc ultragoal status --json",
			"gjc ultragoal status --json ; echo done",
			"gjc ultragoal status --json | head -20",
			"gjc ultragoal status --json 2>&1 | head -20",
			"gjc ralplan --write --stage final /tmp/plan.md 2>&1 ; gjc ultragoal status",
		]) {
			const decision = await getDeepInterviewMutationDecision({
				cwd: root,
				sessionId: "session-gjc-ok",
				tool: { name: "bash" } as never,
				args: { command },
			});
			expect(decision.blocked).toBe(false);
		}
	});
});
