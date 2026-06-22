# Deep-Interview（模糊需求 → 具体规格）

## 核心机制

苏格拉底式追问 + 数学化歧义评分。每次只问一个问题，对 4 个维度（目标/约束/成功标准/上下文）打分，歧义降到阈值以下才放行。

流水线位置：`deep-interview → ralplan → ultragoal (或 team)`

输出产物：`.gjc/specs/deep-interview-{slug}.md`

## 重点文件（按优先级）

### ★★★ SKILL.md（核心 Prompt 定义）

**文件**：`packages/coding-agent/src/defaults/gjc/skills/deep-interview/SKILL.md`（752 行）

关键段落：

| 段落 | 行号 | 内容 |
|------|------|------|
| Phase 0 | L76-96 | 歧义阈值解析（设置文件 → CLI flag → 默认 0.05） |
| Round 0 | L168-229 | 拓扑枚举门：在评分之前锁定顶层组件列表 |
| Phase 2 评分 Prompt | L296-339 | 歧义评分 JSON Schema + 本体论提取 |
| 歧义计算公式 | L343-344 | Greenfield: `1-(goal×0.40 + constraints×0.30 + criteria×0.30)` / Brownfield: 加 context×0.15 |
| Phase 3 挑战者模式 | L400-416 | Contrarian(R4) / Simplifier(R6) / Ontologist(R8+且歧义>0.3) |
| Phase 4 Spec 模板 | L432-521 | 最终规格文档结构 |
| 维度权重定义 | L821-828 | Greenfield vs Brownfield 权重对比表 |
| 自动研究片段 | L58-65 | Internal Auto Mode Protocol（auto-research-greenfield / auto-answer-uncertain） |

### ★★☆ Runtime（状态机 + CLI 实现）

**文件**：`packages/coding-agent/src/gjc-runtime/deep-interview-runtime.ts`（647 行）

关键函数：

| 函数 | 行号 | 作用 |
|------|------|------|
| `resolveConfiguredAmbiguityThreshold` | L216-227 | 阈值来源优先级：modern config.yml → 项目 .gjc/settings.json → 用户 ~/.gjc/settings.json |
| `resolveDeepInterviewArgs` | L322-385 | 解析 CLI 参数，合并阈值，检测语言（韩文/英文） |
| `seedDeepInterviewState` | L465-503 | 写入 `.gjc/state/deep-interview-state.json` |
| `persistDeepInterviewSpec` | L387-463 | 写入 `.gjc/specs/deep-interview-{slug}.md`，可选 handoff 到 ralplan |
| `resolveDeepInterviewLanguagePreference` | L239-256 | 从 idea 文本检测用户语言偏好 |
| `handleSpecWrite` | L536-598 | 处理 `--write` 调用，支持 `--deliberate` 自动桥接 ralplan |

### ★☆☆ Command（CLI 入口）

**文件**：`packages/coding-agent/src/commands/deep-interview.ts`（40 行）

Flag 定义：`--quick/--standard/--deep`（分辨率）、`--threshold`（阈值覆盖）、`--write --stage final --slug <slug> --spec <path>`（持久化）、`--deliberate`（快捷 ralplan 桥接）

### ★★☆ 配套文件

| 文件 | 作用 |
|------|------|
| `src/skill-state/deep-interview-mutation-guard.ts` | 安全守卫：防止 Agent 绕过 CLI 直接改 `.gjc/state/` |
| `src/deep-interview/render-middleware.ts` | TUI 渲染中间件 |
| `src/defaults/gjc/skills/deep-interview/auto-research-greenfield.md` | 内部 fragment：绿场项目自动调研 |
| `src/defaults/gjc/skills/deep-interview/auto-answer-uncertain.md` | 内部 fragment：用户跳过问题时自动回答 |

## 魔改切入点

| 想改什么 | 改哪里 |
|----------|--------|
| 评分算法 / 维度定义 | `SKILL.md` L296-339（scoring prompt）+ L343-344（加权公式） |
| 加新的挑战者模式 | `SKILL.md` L400-416，加新模式 + 激活阈值 |
| 改阈值来源 / 优先级 | `deep-interview-runtime.ts` L216-227 + L322-385 |
| 改 Spec 输出格式 | `SKILL.md` L432-521（Phase 4 模板） |
| 改自动研究 / 自动回答策略 | `SKILL.md` L58-65 + 对应的 fragment 文件 |
| 改拓扑枚举逻辑 | `SKILL.md` L168-229（Round 0 gate） |
| 改本体论稳定性追踪 | `SKILL.md` L346-361 |

## 数据流

```
用户输入 idea
  → Phase 0: 解析歧义阈值（settings.json → CLI flag → 默认）
  → Phase 1: 初始化状态文件 .gjc/state/deep-interview-state.json
  → Round 0: 拓扑枚举（锁定顶层组件列表）
  → Phase 2: 循环（问 → 答 → 评分 → 报告），直到歧义 ≤ 阈值
    → 自动研究（绿场 + research:true）
    → 自动回答（用户跳过）
    → 挑战者模式（R4/R6/R8）
  → Phase 4: 结晶 Spec → .gjc/specs/deep-interview-{slug}.md
  → Phase 5: 执行桥接（用户选择 ralplan / ultragoal / team）
```
