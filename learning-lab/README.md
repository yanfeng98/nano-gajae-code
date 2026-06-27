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
