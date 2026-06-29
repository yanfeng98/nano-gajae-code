# Learning Lab

从 GJC 项目提取的独立功能实现，用于学习核心机制。每个脚本完全自包含，不依赖项目源码。

## 运行

```bash
bun run learning-lab/<script>.ts
```

## 脚本列表

| 脚本 | 说明 |
|------|------|
| `ask-selector.ts` | 多选项交互式 TUI 选择器（ask 工具核心） |
| `goal-lab.ts` | Goal 目标系统 — 完整自主 Agent 模拟（状态机 / 记账 / 自动续跑 / 完成审计） |
| `compaction-lab.ts` | 上下文压缩 — 切割点检测算法演示（反向累积 / 有效切割点 / Split Turn） |

## ask-selector.ts 学习要点

### 1. 原始终端控制

```ts
// 进入备用屏幕缓冲区（不污染滚动历史）
process.stdout.write("\x1b[?1049h");

// 隐藏光标
process.stdout.write("\x1b[?25l");

// stdin 设为 raw mode（逐字节读取，不回显，不缓冲行）
process.stdin.setRawMode(true);
```

### 2. ANSI 转义序列速查

| 序列 | 作用 |
|------|------|
| `\x1b[<row>;<col>H` | 移动光标 |
| `\x1b[K` | 清除到行尾 |
| `\x1b[J` | 清除到屏幕尾 |
| `\x1b[0m` | 重置样式 |
| `\x1b[1m` | 加粗 |
| `\x1b[2m` | 暗色 |
| `\x1b[3<color>m` | 前景色 (30-37, 90-97) |

### 3. 选择器渲染流程

```
┌─ 计算布局 ─┐
│ 1. 获取终端尺寸
│ 2. 减去 chrome（标题行+帮助行+间距+外框）
│ 3. 计算 maxVisible 可见选项数
│ 4. 计算滚动窗口 [startIndex, endIndex)
└────────────┘
       ↓
┌─ 清屏渲染 ─┐
│ 1. cursorTo(1,1) + clearScreenEnd
│ 2. 逐行写入：外框→标题→空行→选项→帮助→外框
│ 3. 当前选中项：▶ + accent 色
│ 4. 多选项：☑/☐ checkbox
│ 5. 位置提示：(3/8)
└────────────┘
       ↓
┌─ 键盘事件 ─┐
│ ↑/k → selectedIndex-- (上移)
│ ↓/j → selectedIndex++ (下移)
│ Enter → 选中/切换/完成
│ Esc → 取消
│ Ctrl+D → 多选完成
└────────────┘
       ↓
    重新渲染（循环）
```

### 4. 与项目源码的对应关系

| 本脚本 | 项目源码 | 职责 |
|--------|----------|------|
| `Terminal` 类 | `@gajae-code/tui` 中的 TUI 类 | 终端管理 |
| `askSelector()` | `packages/coding-agent/src/tools/ask.ts` → `askSingleQuestion()` | 选择逻辑 |
| `render()` 中的选项列表 | `HookSelectorComponent.#updateList()` | 列表渲染 |
| `render()` 中的外框 | `OutlinedList.render()` | 外框绘制 |
| checkbox 前缀 | `theme.checkbox.checked/unchecked` | 多选标记 |
| `handleInput()` | `HookSelectorComponent.handleInput()` | 键盘导航 |
| `inputMode` / 内联输入 | `HookSelectorComponent.#enterInputMode()` | 自定义输入 |

### 5. 关键设计决策

- **不重新渲染整个屏幕 → 只清屏重绘**：比 diff 算法简单，终端尺寸下足够快
- **备用屏幕缓冲区**：退出时恢复原始终端内容，不污染滚动历史
- **内联输入 vs 弹窗**：自定义输入嵌入选项列表下方，不遮挡问题上下文
- **倒计时显示在标题**：`"Which auth method? (12s)"`，而不是独立的计时器行


## goal-lab.ts 使用方式

```bash
# 交互选择预设场景
bun run learning-lab/goal-lab.ts

# 直接指定预设目标
bun run learning-lab/goal-lab.ts "实现用户登录 API"
bun run learning-lab/goal-lab.ts "修复分页 Bug"
bun run learning-lab/goal-lab.ts "添加 API 限流中间件"

# 自定义任意目标（系统自动规划任务序列）
bun run learning-lab/goal-lab.ts "重构数据库连接池"

# 加速模拟（默认 500ms/步，数字越小越快）
bun run learning-lab/goal-lab.ts "修复分页 Bug" --speed 100
```

**运行时按键**：`q` 退出  `p` 暂停/继续

**预设场景覆盖**：
| 场景 | 任务数 | 演示重点 |
|------|--------|----------|
| 实现用户登录 API | 3 | 多文件创建 + 测试 |
| 修复分页 Bug | 2 | 定位 → 修复 → 验证 |
| 添加 API 限流中间件 | 3 | web_search + 集成 + E2E 验证 |
| 自定义目标 | 4 | 通用规划序列 |

## goal-lab.ts 学习要点

### 1. Goal 状态机

```
                    createGoal()
                    ┌─────────┐
                    │  active  │────── pauseGoal() ────► paused
                    └────┬─────┘         resumeGoal()
                         │
              ┌──────────┼──────────┐
              │          │          │
         completeGoal  dropGoal   (continue)
              │          │
              ▼          ▼
          complete    dropped
          (exiting)   (cleared)
```

四种 GoalStatus：`active` ↔ `paused`，`active` → `complete`，`active` → `dropped`。
`complete` 后进入 `mode: "exiting"` 过渡态，防止 Agent 在完成回调中继续操作。

### 2. 串行化记账：`#withAccounting`

```ts
// Promise 尾链模式 → 无锁异步串行化
async #withAccounting<T>(fn: () => T): Promise<T> {
  const previous = this.#accountingTail;
  const { promise, resolve } = Promise.withResolvers<void>();
  this.#accountingTail = previous.then(() => promise, () => promise);
  await previous.catch(() => {});
  try { return await fn(); }
  finally { resolve(); }
}
```

每次工具调用后触发 `flushUsage`，计算 token delta（当前 - baseline）和 wall-clock delta（now - lastAccountedAt），累加到 `goal.tokensUsed` / `goal.timeUsedSeconds`。

### 3. 自动续跑 (Auto-continuation)

实际系统中，交互模式在 `getUserInput()` 后 800ms 空闲期检测：
- Goal 是否 active
- 用户是否有输入在编辑器中
- 是否有 pending submitted input

满足条件则注入隐藏消息（`customType: "goal-continuation"`）驱动 Agent 继续工作。

### 4. Completion Audit 守卫

`completeGoalFromTool` 前必须通过 `assertCanCompleteCurrentGoal`：
- Ultragoal 场景：检查所有子 goal 是否都有 verified receipt
- 提示词模板要求 Agent 逐条验证交付物

本 demo 简化为用户确认 `y/N`。

### 5. 与项目源码的对应关系

| 本脚本 | 项目源码 | 职责 |
|--------|----------|------|
| `GoalRuntime` | `goals/runtime.ts` → `GoalRuntime` | 核心状态机 |
| `Goal` / `GoalModeState` | `goals/state.ts` | 数据类型 |
| `GoalTool.executeGoalOperation` | `goals/tools/goal-tool.ts` | agent 工具接口 |
| `#flushUsage` | `GoalRuntime.#flushUsageLocked` | token/time 记账 |
| `#withAccounting` | `GoalRuntime.#withAccounting` | 串行化保证 |
| TUI 日志分类（agent/goal_sys/audit） | TUI 状态行 `segments.ts` + 隐藏消息注入 | 视觉分层 |
| `⚙ goal({op:"get"})` 调用 | `GoalTool.execute` → `runtime.getState()` | Agent 自查进度 |
| `⚙ ⏳ 续跑倒计时 → 注入` | `#scheduleGoalContinuation` + `goal-continuation.md` | 自动续跑 |
| `🔍 COMPLETION AUDIT` 守卫 | `assertCanCompleteCurrentGoal` (ultragoal-guard) | 完成审计 |


## compaction-lab.ts 学习要点

### 1. 上下文压缩问题

LLM 会话在不断增长。当累积 token 超过模型上下文窗口时，必须压缩旧消息让出新空间。compaction-lab 演示了 GJC 的核心切割点检测算法 — 这是压缩决策中最关键的一步。

```
完整会话 (142K tokens)
┌──────────────────────────────────────────────────┐
│  Turn 1-6  旧对话历史                            │  ← 将被摘要
│  ─────────────────────────────────────────────── │
│  Turn 7  (split turn prefix)                     │  ← 部分摘要
│  ─────────────────────────────────────────────── │
│  Turn 8-N  最近对话                              │  ← 保留原文
└──────────────────────────────────────────────────┘
      ↓ 压缩后
  [LLM 摘要: "用户请求实现登录系统..."] + Turn 7-N 原文
```

### 2. 核心算法：findCutPoint

```ts
function findCutPoint(entries, start, end, keepRecentTokens) {
  // 1. 找到所有合法切割点（绝不切割 toolResult）
  const cutPoints = findValidCutPoints(entries, start, end);

  // 2. 从最新消息反向遍历，累积 token
  let accumulated = 0;
  for (let i = end - 1; i >= start; i--) {
    accumulated += entries[i].tokens;
    if (accumulated >= keepRecentTokens) {
      // 3. 找到距离当前位置最近的合法切割点
      cutIndex = closestCutPoint(cutPoints, i);
      break;
    }
  }

  // 4. 反向扫描，拉入非消息条目（设置变更等），停止于 compaction 边界
  while (cutIndex > start) {
    if (prev.type === "compaction") break;
    if (prev.type === "message") break;
    cutIndex--;
  }

  // 5. 检测 split turn（切割点在 assistant 消息上，不是完整 turn）
  const isSplitTurn = cutEntry.role !== "user";
  if (isSplitTurn) turnStart = findTurnStart(entries, cutIndex, start);

  return { cutIndex, turnStart, isSplitTurn };
}
```

### 3. 有效切割点规则

| 条目类型 | 可作为切割点？ | 原因 |
|----------|---------------|------|
| `user` | 可以 | 完整 turn 边界 |
| `assistant` | 可以 | 可能产生 split turn，其 toolResult 跟着保留 |
| `toolResult` | **绝不** | 必须紧跟其 tool call，否则 LLM 看到孤立的工具结果 |
| `compaction` | 可以 | 前一次压缩的边界 |
| `custom_message` | 可以 | 视为 user 角色消息 |

### 4. Split Turn 处理

当切割点落在 assistant 消息上（而非 user 消息），意味着切割点不是一个完整的 turn 边界：

```
Turn 5:
  User: "现在写测试"           ← turn start
  Assistant: "我来写 12 个用例"  ← cutIndex (切割点)
  ──── 切割线 ────
  ToolResult: [测试文件]        ← 跟着 assistant 保留
  ToolResult: [测试结果 ✓]
```

这部分 turn prefix（User + Assistant 开头）需要单独生成"turn prefix 摘要"，告诉模型这个 turn 在做什么。剩余的 toolResult 完整保留。

### 5. 两种压缩策略

| 策略 | 机制 | 适用场景 |
|------|------|----------|
| `context-full` | 旧消息 → LLM 摘要 + 新消息原文 | 默认策略，保留连续性 |
| `handoff` | 生成结构化交接文档 + toolChoice:none | 任务交接给新的 Agent 实例 |

### 6. 运行时交互

按 `Space` 逐步推进算法各阶段：
1. **查看完整会话** — 上下文溢出状态
2. **扫描有效切割点** — 绿色 ◆ = 可切割，红色 ✕ = toolResult（不可切割）
3. **反向累积** — 动画展示从最新消息反向累加 token
4. **切割点确定** — 展示切割位置
5. **Split Turn 检测** — 如果切割在 assistant 上，展示 turn prefix
6. **结果展示** — 绿色 = 保留，黄色 = turn prefix，灰色 = 摘要

按 `s` 切换策略（context-full / handoff），`↑↓/jk` 滚动条目列表。

### 7. 与项目源码的对应关系

| 本脚本 | 项目源码 | 职责 |
|--------|----------|------|
| `findValidCutPoints()` | `compaction.ts:findValidCutPoints()` | 合法切割点扫描 |
| `findCutPoint()` | `compaction.ts:findCutPoint()` | 核心切割算法 |
| `findTurnStart()` | `compaction.ts:findTurnStartIndex()` | 回溯找 turn 起点 |
| `estimateTokens()` | `compaction.ts:estimateMessageTokensHeuristic()` | 启发式 token 估算 |
| `context-full` 策略 | `compaction.ts:compact()` | 摘要 + 保留完整流程 |
| `handoff` 策略 | `compaction.ts:generateHandoff()` | 交接文档生成 |
| Phase walkthrough | `SessionManager.#compactInternal()` | 压缩触发 → 准备 → 执行 → 写入 |
