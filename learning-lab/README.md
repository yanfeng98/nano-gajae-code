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
