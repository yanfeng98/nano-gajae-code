#!/usr/bin/env bun

const CSI = "\x1b[";
const cursorTo = (r: number, c: number) => `${CSI}${r};${c}H`;
const CLR_LINE = `${CSI}K`, CLR_SCREEN = `${CSI}J`;
const HIDE_CURSOR = `${CSI}?25l`, SHOW_CURSOR = `${CSI}?25h`;
const ALT_ON = `${CSI}?1049h`, ALT_OFF = `${CSI}?1049l`;
const RST = `${CSI}0m`;
function fg(c: number, t: string) { return `${CSI}${c}m${t}${RST}`; }
const S = {
  bold:     (t: string) => `\x1b[1m${t}${RST}`,
  dim:      (t: string) => `\x1b[2m${t}${RST}`,
  accent:   (t: string) => fg(36, t),   white: (t: string) => fg(37, t),
  green:    (t: string) => fg(32, t),   yellow: (t: string) => fg(33, t),
  red:      (t: string) => fg(31, t),   gray:   (t: string) => fg(90, t),
  hiWhite:  (t: string) => fg(97, t),   magenta:(t: string) => fg(35, t),
  blue:     (t: string) => fg(34, t),
};
const BOX = { h: "─", v: "│", tl: "┌", tr: "┐", bl: "└", br: "┘" };
const DBOX = { h: "═", v: "║", tl: "╔", tr: "╗", bl: "╚", br: "╝" };

class Terminal {
  raw = false;
  enter() { if (this.raw) return; process.stdout.write(ALT_ON + HIDE_CURSOR); if (process.stdin.isTTY) process.stdin.setRawMode(true); this.raw = true; }
  leave() { if (!this.raw) return; process.stdout.write(SHOW_CURSOR + ALT_OFF); if (process.stdin.isTTY) process.stdin.setRawMode(false); this.raw = false; }
  sz() { return { rows: process.stdout.rows || 35, cols: process.stdout.columns || 110 }; }
  cls() { process.stdout.write(cursorTo(1, 1) + CLR_SCREEN); }
  at(r: number, c: number, t: string) { process.stdout.write(cursorTo(r, c) + CLR_LINE + t); }
}

type GoalStatus = "active" | "paused" | "complete" | "dropped";
interface Goal {
  id: string; objective: string; status: GoalStatus;
  tokensUsed: number; timeUsedSeconds: number; createdAt: number; updatedAt: number;
}
interface GoalModeState { enabled: boolean; mode: "active" | "exiting"; reason?: "completed"; goal: Goal | null; }

let _sid = 0n;
function snowflake() { _sid++; return String((BigInt(Date.now()) - 1700000000000n) << 8n | (_sid & 0xFFn)); }

class GoalRuntime {
  #s: GoalModeState = { enabled: false, mode: "active", goal: null };
  #baseline = 0; #wallStart = 0;
  #tail: Promise<void> = Promise.resolve();
  #log: string[] = [];

  async #lock<T>(fn: () => T): Promise<T> {
    const prev = this.#tail;
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#tail = prev.then(() => promise, () => promise);
    await prev.catch(() => {});
    try { return fn(); } finally { resolve(); }
  }

  #flush(cur: number) {
    const g = this.#s.goal;
    if (!g || g.status !== "active") return;
    const td = Math.max(0, cur - this.#baseline);
    const wd = this.#wallStart > 0 ? Math.max(0, Math.floor((Date.now() - this.#wallStart) / 1000)) : 0;
    if (td <= 0 && wd <= 0) return;
    g.tokensUsed += td; g.timeUsedSeconds += wd; g.updatedAt = Date.now();
    this.#baseline = cur;
    if (wd > 0) this.#wallStart = Date.now();
  }

  emit(msg: string) { this.#log.push(msg); }
  get state() { return this.#s; }
  get logs() { return this.#log; }
  turnTokensBefore() { return this.#baseline; }
  onTurnStart(cur: number) { this.#baseline = cur; if (this.#s.enabled && this.#s.goal?.status === "active") this.#wallStart = Date.now(); }
  onToolDone(cur: number) { this.#flush(cur); }
  onTurnEnd(cur: number) { this.#flush(cur); this.#baseline = cur; }

  async create(obj: string): Promise<Goal> {
    return this.#lock(() => {
      const g = this.#s.goal;
      if (g && g.status !== "dropped" && g.status !== "complete") throw new Error("已有活跃目标");
      const now = Date.now();
      const ng: Goal = { id: snowflake(), objective: obj, status: "active", tokensUsed: 0, timeUsedSeconds: 0, createdAt: now, updatedAt: now };
      this.#s = { enabled: true, mode: "active", goal: ng };
      this.#wallStart = now; this.#baseline = 0;
      this.emit(`GOAL.CREATE  id=${ng.id.slice(-6)}  "${obj.slice(0, 50)}"`);
      return ng;
    });
  }

  async complete(): Promise<Goal> {
    return this.#lock(() => {
      const g = this.#s.goal; if (!g) throw new Error("无目标");
      if (g.status === "complete") throw new Error("已完成");
      this.#flush(g.tokensUsed);                     // 最后 flush 一次
      this.#s.enabled = false; g.status = "complete"; g.updatedAt = Date.now();
      this.#s.mode = "exiting"; this.#s.reason = "completed"; this.#wallStart = 0;
      this.emit(`GOAL.COMPLETE  tokens=${g.tokensUsed}  time=${g.timeUsedSeconds}s`);
      return g;
    });
  }
}

interface SimStep { tool: string; args: string; output: string; tokens: number; ms: number; }
interface SimTask { name: string; desc: string; steps: SimStep[]; deliverable: string; }

const SCENARIOS: Record<string, SimTask[]> = {
  "实现用户登录 API": [
    { name: "创建路由", desc: "POST /api/auth/login", deliverable: "src/routes/auth.ts 存在且包含 login 路由",
      steps: [
        { tool: "read",  args: "src/routes/index.ts",        output: "import { Router } from 'express';", tokens: 120, ms: 150 },
        { tool: "write", args: "src/routes/auth.ts",         output: "Created src/routes/auth.ts (68 lines)", tokens: 350, ms: 250 },
        { tool: "bash",  args: "bun check src/routes/auth.ts",output: "✓ 0 errors", tokens: 80, ms: 350 },
      ]},
    { name: "密码验证", desc: "bcrypt verifyPassword", deliverable: "src/services/auth.ts 包含 verifyPassword",
      steps: [
        { tool: "write", args: "src/services/auth.ts",       output: "Added verifyPassword() + generateToken()", tokens: 280, ms: 200 },
        { tool: "bash",  args: "bun test auth.test.ts",      output: "✓ 5 tests passed", tokens: 150, ms: 450 },
      ]},
    { name: "集成测试", desc: "登录端点 E2E", deliverable: "所有 auth 测试通过",
      steps: [
        { tool: "write", args: "test/auth/login.test.ts",    output: "Created login.test.ts (12 cases)", tokens: 420, ms: 300 },
        { tool: "bash",  args: "bun test test/auth/",        output: "✓ 12 passed, 0 failed", tokens: 200, ms: 550 },
        { tool: "read",  args: "test/auth/login.test.ts",    output: "[Audit] 12 tests cover: success, bad pw, missing fields, rate limit", tokens: 180, ms: 150 },
      ]},
  ],
  "修复分页 Bug": [
    { name: "定位 Bug", desc: "找到 offset 计算错误", deliverable: "定位到 pagination.ts:42",
      steps: [
        { tool: "read",  args: "src/utils/pagination.ts",    output: "export function paginate(page, size) {\n  const offset = page * size;  // ← BUG\n  return { offset, limit: size };\n}", tokens: 150, ms: 150 },
        { tool: "search",args: "paginate( 调用点",            output: "Found 7 call sites: routes/users.ts:23, routes/posts.ts:45 …", tokens: 200, ms: 200 },
        { tool: "bash",  args: "bun test --grep pagination", output: "✓ Bug confirmed at line 42 — offset=page*size should be (page-1)*size — 3 tests fail as expected", tokens: 120, ms: 400 },
      ]},
    { name: "修复验证", desc: "改 offset + 跑测试", deliverable: "所有分页测试通过",
      steps: [
        { tool: "edit",  args: "src/utils/pagination.ts:42", output: "Changed `page * size` → `(page - 1) * size`", tokens: 80, ms: 200 },
        { tool: "bash",  args: "bun test --grep pagination", output: "✓ 3 tests passed", tokens: 100, ms: 350 },
        { tool: "bash",  args: "bun test",                    output: "✓ 47 passed, 0 failed", tokens: 200, ms: 800 },
      ]},
  ],
  "添加 API 限流中间件": [
    { name: "实现限流器", desc: "Token bucket 中间件", deliverable: "src/middleware/rateLimiter.ts 可用",
      steps: [
        { tool: "web_search", args: "express-rate-limit token bucket", output: "express-rate-limit v7: in-memory store, custom key generators", tokens: 300, ms: 250 },
        { tool: "write", args: "src/middleware/rateLimiter.ts", output: "Created TokenBucket class + Express middleware (92 lines)", tokens: 450, ms: 300 },
        { tool: "bash",  args: "bun test rateLimiter.test.ts", output: "✓ 8 tests passed", tokens: 160, ms: 450 },
      ]},
    { name: "集成挂载", desc: "挂载到 /api 路由", deliverable: "所有 /api 路由受限流保护",
      steps: [
        { tool: "read",  args: "src/app.ts",                  output: "const app = express(); app.use('/api', apiRouter);", tokens: 100, ms: 150 },
        { tool: "edit",  args: "src/app.ts",                  output: "Added `app.use('/api', rateLimiter)` before apiRouter", tokens: 120, ms: 200 },
        { tool: "bash",  args: "bun test --e2e",              output: "✓ 23 passed (inc. rate-limit e2e)", tokens: 250, ms: 800 },
      ]},
  ],
};


function runAudit(tasks: SimTask[]): { checks: { deliverable: string; passed: boolean }[]; allPassed: boolean } {
  const checks = tasks.map(t => ({
    deliverable: t.deliverable,
    passed: t.steps.every(s => !s.output.startsWith("✗")),
  }));
  return { checks, allPassed: checks.every(c => c.passed) };
}

type LogKind = "agent" | "goal_sys" | "turn_boundary" | "audit";
interface LogLine { kind: LogKind; text: string; }

class AgentLoop {
  runtime: GoalRuntime;
  tasks: SimTask[];
  speed: number;
  turn = 0;
  continuations = 0;
  phase = "init";
  currentTask = 0;
  totalTokens = 0;

  private aborted = false;
  private paused = false;
  private pausedResolve: (() => void) | null = null;

  constructor(runtime: GoalRuntime, tasks: SimTask[], speed: number) {
    this.runtime = runtime; this.tasks = tasks; this.speed = speed;
  }

  abort() { this.aborted = true; this.resumeIfPaused(); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.pausedResolve?.(); this.pausedResolve = null; }
  private resumeIfPaused() { if (this.paused) { this.pausedResolve?.(); this.pausedResolve = null; } }

  private async wait(ms: number) {
    if (this.paused) await new Promise<void>(r => { this.pausedResolve = r; });
    if (this.aborted) throw new Error("ABORTED");
    await Bun.sleep(ms);
  }

  async run(onFrame: (logs: LogLine[]) => void): Promise<boolean> {
    const L = (kind: LogKind, text: string) => onFrame([{ kind, text }]);
    try {
      this.phase = "executing";

      for (let ti = 0; ti < this.tasks.length; ti++) {
        if (this.aborted) return false;
        this.currentTask = ti;
        const task = this.tasks[ti]!;
        const turnTokensBefore = this.runtime.state.goal?.tokensUsed ?? 0;

        this.turn++;
        this.runtime.onTurnStart(this.totalTokens);
        L("turn_boundary", `TURN #${this.turn} 开始 ── Task ${ti + 1}/${this.tasks.length}: ${task.desc}`);
        await this.wait(this.speed);

        for (let si = 0; si < task.steps.length; si++) {
          if (this.aborted) return false;
          const step = task.steps[si]!;
          this.totalTokens += step.tokens;

          L("agent", `$${step.tool} ${step.args}`);
          await this.wait(step.ms);
          this.runtime.onToolDone(this.totalTokens);
          L("agent", `  → ${step.output.split("\n")[0]}`);

          if (si < task.steps.length - 1) await this.wait(Math.max(80, this.speed / 2));
        }

        this.runtime.onTurnEnd(this.totalTokens);
        const turnTokens = (this.runtime.state.goal?.tokensUsed ?? 0) - turnTokensBefore;
        const turnTime = this.runtime.state.goal?.timeUsedSeconds ?? 0;

        L("goal_sys", `goal({op:"get"}) → status: ACTIVE  tokens: ${this.runtime.state.goal?.tokensUsed ?? 0}  time: ${turnTime}s`);
        L("agent", `Turn #${this.turn} 完成 — +${turnTokens} tokens  (Task "${task.name}" done)`);

        if (ti < this.tasks.length - 1) {
          this.continuations++;
          L("goal_sys", `⏳ 自动续跑倒计时 …`);

          const steps = [800, 600, 400, 200];
          for (const ms of steps) {
            L("goal_sys", `⏳ 续跑倒计时 ${ms}ms — goal.enabled=true, goal.status=active, 无用户输入 →`);
            await this.wait(Math.max(50, this.speed / 4));
          }
          L("goal_sys", `→ Goal 系统注入 goal-continuation.md 隐藏消息`);
          await this.wait(this.speed / 2);
          L("goal_sys", `→ Agent 收到续跑指令，继续下一个任务`);
          await this.wait(this.speed);
        }
      }

      this.phase = "auditing";
      L("goal_sys", "╔══════════════════════════════════════════╗");
      L("goal_sys", "║  COMPLETION AUDIT — 完成审计守卫        ║");
      L("goal_sys", "╚══════════════════════════════════════════╝");
      await this.wait(this.speed);

      L("goal_sys", "Agent 调用 goal({op:\"complete\"}) …");
      await this.wait(this.speed);
      L("goal_sys", "→ 触发 assertCanCompleteCurrentGoal() 守卫 …");
      await this.wait(this.speed);

      const audit = runAudit(this.tasks);
      for (const c of audit.checks) {
        L("audit", c.passed ? `  ✓ ${c.deliverable}` : `  ✗ ${c.deliverable}`);
        await this.wait(this.speed / 2);
      }

      if (audit.allPassed) {
        await this.runtime.complete();
        this.phase = "done";
        L("goal_sys", "");
        L("goal_sys", "  Audit 通过！goal({op:\"complete\"}) 执行成功");
        L("goal_sys", "  GoalRuntime: status=complete  mode=exiting  reason=completed");
        L("goal_sys", "");
        L("goal_sys", "  ╔══════════════════════════════════════════╗");
        L("goal_sys", "  ║  🏁  GOAL COMPLETE  —  目标达成！🏁   ║");
        L("goal_sys", "  ╚══════════════════════════════════════════╝");
        return true;
      } else {
        L("goal_sys", "  Audit 未通过 — Agent 继续工作 …");
        return false;
      }
    } catch (err) {
      if ((err as Error).message === "ABORTED") return false;
      L("goal_sys", `错误: ${(err as Error).message}`);
      return false;
    }
  }
}

function fmtT(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function fmtD(s: number): string { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; }

function hdrBox(term: Terminal, r: number, c1: number, c2: number, box: typeof BOX, color: (t: string) => string, title: string) {
  const w = c2 - c1 - 1;
  const hline = box.h.repeat(Math.max(0, w));
  term.at(r, c1, color(box.tl + hline + box.tr));
  term.at(r + 1, c1, color(box.v) + S.bold(title) + color(" ".repeat(Math.max(0, w - title.length + 1)) + box.v));
  term.at(r + 2, c1, color(box.bl + hline + box.br));
}

function render(term: Terminal, runtime: GoalRuntime, ag: AgentLoop, logLines: LogLine[]) {
  const { rows, cols } = term.sz();
  term.cls();

  const st = runtime.state;
  const g = st.goal;

  term.at(1, 1, S.accent(S.bold(" GJC Goal 系统 — 自主 Agent 模拟 ")));
  term.at(1, cols - 25, S.dim("[q]退出  [p]暂停/继续"));
  term.at(2, 1, S.dim("━".repeat(cols - 1)));

  let r = 4;
  const gw = 48;
  hdrBox(term, r, 1, gw, DBOX, S.yellow, " GOAL ");
  r += 3;

  if (g) {
    const sc: Record<GoalStatus, (t: string) => string> = {
      active: S.green, paused: S.yellow, complete: S.accent, dropped: S.red,
    };
    term.at(r, 3, `${S.magenta("目标:")} ${S.white(g.objective)}`); r++;
    term.at(r, 3, `${S.magenta("状态:")} ${sc[g.status](g.status.toUpperCase())}${st.enabled ? S.green(" ●") : st.mode === "exiting" ? S.accent(" ◉ exiting") : S.dim(" ○")}`); r++;
    term.at(r, 3, `${S.magenta("Token:")} ${S.hiWhite(fmtT(g.tokensUsed))}    ${S.magenta("耗时:")} ${S.hiWhite(fmtD(g.timeUsedSeconds))}    ${S.magenta("ID:")} ${S.dim("#" + g.id.slice(-6))}`); r++;
  } else {
    term.at(r, 3, S.dim("无活跃目标")); r++;
  }
  if (ag) {
    term.at(r, 3, `${S.magenta("Phase:")} ${S.accent(ag.phase)}   ${S.magenta("Turn:")} ${ag.turn}   ${S.magenta("续跑:")} ${ag.continuations}   ${S.magenta("Task:")} ${ag.currentTask + 1}/${ag.tasks.length}`); r++;
  }

  r += 1;
  hdrBox(term, r, 1, cols - 1, BOX, S.gray, " Agent 执行日志 ");
  r += 3;

  const logStart = r;
  const logEnd = rows - 3;
  const maxLog = logEnd - logStart;
  const visible = logLines.slice(-maxLog);

  for (const line of visible) {
    let prefix: string;
    let color: (t: string) => string;
    switch (line.kind) {
      case "turn_boundary": prefix = "\n═══ "; color = S.accent; break;
      case "agent":         prefix = "  ";   color = S.white;  break;
      case "goal_sys":      prefix = "⚙  ";  color = S.yellow; break;
      case "audit":         prefix = "🔍 ";  color = S.blue;   break;
    }
    const text = line.text;
    if (text.includes("GOAL COMPLETE")) {
      term.at(r, 1, S.bold(S.green(text))); r++;
    } else if (text.startsWith("$")) {
      term.at(r, 1, prefix + S.accent(text.slice(1))); r++;
    } else if (text.includes("→")) {
      const parts = text.split("→");
      term.at(r, 1, prefix + S.white(parts[0]!) + S.green("→") + S.white(parts.slice(1).join("→"))); r++;
    } else {
      term.at(r, 1, prefix + color(text)); r++;
    }
    if (r >= logEnd) break;
  }

  term.at(rows, 1, S.gray("━".repeat(cols - 1)));
  term.at(rows, 1, S.dim(
    (st.enabled ? " Goal: ENABLED " : st.mode === "exiting" ? " Goal: EXITING " : " Goal: OFF ") +
    (g ? `| ${g.status.toUpperCase()} | tokens: ${fmtT(g.tokensUsed)} | time: ${fmtD(g.timeUsedSeconds)}` : "")
  ));
}

async function pickScenario(term: Terminal): Promise<string | null> {
  const scenarios = Object.keys(SCENARIOS);
  let sel = 0;
  const draw = () => {
    term.cls();
    let r = 3;
    term.at(r, 2, S.accent(S.bold("选择目标（或按 Esc 自定义）"))); r += 2;
    for (let i = 0; i < scenarios.length; i++) {
      term.at(r, 2, (i === sel ? S.accent("▶ ") : "  ") + (i === sel ? S.white(scenarios[i]!) : S.dim(scenarios[i]!))); r++;
    }
    r += 2;
    term.at(r, 2, S.dim("↑↓ 移动  Enter 确认  Esc 自定义  Ctrl+C 退出"));
  };
  draw();
  return new Promise((resolve) => {
    const h = (k: Buffer) => {
      const s = k.toString();
      if (s === "\x1b[A" || s === "k") { sel = Math.max(0, sel - 1); draw(); }
      else if (s === "\x1b[B" || s === "j") { sel = Math.min(scenarios.length - 1, sel + 1); draw(); }
      else if (s === "\r" || s === "\n") { process.stdin.removeListener("data", h); resolve(scenarios[sel]!); }
      else if (s === "\x1b") { process.stdin.removeListener("data", h); resolve(null); }
      else if (s === "\x03") { process.stdin.removeListener("data", h); term.leave(); process.exit(0); }
    };
    process.stdin.on("data", h);
  });
}

async function inputObjective(term: Terminal): Promise<string | null> {
  term.cls();
  term.at(5, 2, S.accent("输入目标（回车确认，Esc 取消）:"));
  term.at(7, 2, "> ");
  let input = "";
  const draw = () => term.at(7, 4, CLR_LINE + input);
  return new Promise((resolve) => {
    const h = (k: Buffer) => {
      const s = k.toString();
      if (s === "\r" || s === "\n") { process.stdin.removeListener("data", h); resolve(input); }
      else if (s === "\x1b") { process.stdin.removeListener("data", h); resolve(null); }
      else if (s === "\x03") { process.stdin.removeListener("data", h); term.leave(); process.exit(0); }
      else if (s === "\x7f" || s === "\b") { input = input.slice(0, -1); draw(); }
      else if (s[0] !== undefined && s[0] >= " " && s[0] <= "~") { input += s; draw(); }
    };
    process.stdin.on("data", h);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let speed = 500;
  let objective: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--speed" && args[i + 1]) { speed = parseInt(args[i + 1]!, 10) || 500; i++; }
    else if (!args[i]!.startsWith("-")) objective = args[i]!;
  }

  const term = new Terminal();
  term.enter();

  if (!objective) { objective = await pickScenario(term); }
  if (!objective) { objective = await inputObjective(term); }
  if (!objective) { term.leave(); console.log("取消。"); return; }

  let tasks = SCENARIOS[objective];
  if (!tasks) {
    tasks = [
      { name: "分析需求", desc: `分析: ${objective}`, deliverable: "方案明确",
        steps: [
          { tool: "read", args: "README.md", output: `项目已理解，目标"${objective}"可行。`, tokens: 150, ms: 200 },
          { tool: "web_search", args: objective, output: "找到 3 个方案，选最简实现。", tokens: 300, ms: 300 },
        ]},
      { name: "实现核心", desc: `实现 ${objective}`, deliverable: "核心代码完成",
        steps: [
          { tool: "write", args: "src/impl.ts", output: `Created impl.ts — ${objective} (120 lines)`, tokens: 500, ms: 350 },
          { tool: "bash", args: "bun check", output: "✓ 0 errors", tokens: 80, ms: 400 },
        ]},
      { name: "测试覆盖", desc: "编写测试", deliverable: "测试全部通过",
        steps: [
          { tool: "write", args: "test/impl.test.ts", output: "Created impl.test.ts (8 cases)", tokens: 350, ms: 300 },
          { tool: "bash", args: "bun test", output: "✓ 8 passed, 0 failed", tokens: 150, ms: 600 },
        ]},
      { name: "最终验证", desc: "审计交付物", deliverable: "目标完成",
        steps: [
          { tool: "read", args: "src/impl.ts", output: "[Audit] 代码完整，类型正确，边界处理到位。", tokens: 120, ms: 150 },
          { tool: "bash", args: "bun test --coverage", output: "✓ 100% coverage", tokens: 180, ms: 500 },
        ]},
    ];
  }

  const runtime = new GoalRuntime();
  await runtime.create(objective);

  const agent = new AgentLoop(runtime, tasks, speed);
  const logLines: LogLine[] = [];
  let done = false;

  process.stdin.on("data", (k: Buffer) => {
    const s = k.toString();
    if (s === "q" || s === "\x03") { agent.abort(); done = true; }
    else if (s === "p") {
      (agent as any).paused ? (agent.resume(), logLines.push({ kind: "goal_sys", text: "[用户] 继续" }))
                           : (agent.pause(), logLines.push({ kind: "goal_sys", text: "[用户] 暂停" }));
    }
  });

  const doRender = () => render(term, runtime, agent, logLines);
  try {
    const completed = await agent.run((newLines) => {
      logLines.push(...newLines);
      doRender();
    });
    if (completed) {
      logLines.push({ kind: "goal_sys", text: "" });
    } else if (!done) {
      logLines.push({ kind: "goal_sys", text: S.red("执行中断") });
    }
  } catch (err) {
    logLines.push({ kind: "goal_sys", text: S.red(`致命错误: ${(err as Error).message}`) });
  }
  doRender();

  if (!done) {
    term.at(term.sz().rows - 2, 2, S.dim("按 [q] 退出"));
    await new Promise<void>((resolve) => {
      const h = (k: Buffer) => {
        if (k.toString() === "q" || k.toString() === "\x03") {
          process.stdin.removeListener("data", h);
          resolve();
        }
      };
      process.stdin.on("data", h);
    });
  }

  term.leave();

  const g = runtime.state.goal;
  if (g) {
    console.log(`\n${"=".repeat(55)}`);
    console.log(`  目标: ${g.objective}`);
    console.log(`  状态: ${g.status}`);
    console.log(`  Token: ${fmtT(g.tokensUsed)}  耗时: ${fmtD(g.timeUsedSeconds)}`);
    console.log(`  自动续跑: ${agent.continuations} 次   Turn 数: ${agent.turn}`);
    console.log(`${"=".repeat(55)}\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  process.stdout.write(SHOW_CURSOR + ALT_OFF);
  console.error(e);
  process.exit(1);
});
export {};
