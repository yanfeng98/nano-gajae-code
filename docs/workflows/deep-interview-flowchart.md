# Deep-Interview 流程图

> 苏格拉底式深度访谈 — 将模糊需求通过追问转化为具体规格

---

## 1a: 总览 — Phase 0 → Phase 5 顶层流程

```mermaid
flowchart TD
    START(["用户输入模糊想法<br>/skill:deep-interview"]) --> P0["Phase 0: 解析歧义阈值"]
    P0 --> P1["Phase 1: 初始化"]
    P1 --> R0["Round 0: 拓扑枚举门"]
    R0 --> P2["Phase 2: 访谈循环"]
    P2 --> P2_CHECK{"歧义 ≤ 阈值<br>或提前退出<br>或第20轮硬上限?"}
    P2_CHECK -->|"否"| P2
    P2_CHECK -->|"是"| P3_CHECK{"第4+轮?<br>且挑战模式未用?"}
    P3_CHECK -->|"是"| P3["Phase 3: 挑战Agent模式"]
    P3 --> P2
    P3_CHECK -->|"否"| P4["Phase 4: 结晶化 Spec"]
    P4 --> P5["Phase 5: 执行桥接"]
    P5 --> CHOICE{"用户选择执行路径?"}
    CHOICE -->|"1. ralplan 精炼(推荐)"| RALPLAN["/skill:ralplan<br/>→ 共识规划 → 待批准"]
    CHOICE -->|"2. ultragoal 执行"| ULTRA["/skill:ultragoal<br/>→ 目标跟踪执行"]
    CHOICE -->|"3. team 执行"| TEAM["/skill:team<br/>→ tmux 并行 worker"]
    CHOICE -->|"4. 进一步精炼"| P2
    RALPLAN --> DONE(["待明确执行批准"])
    ULTRA --> DONE
    TEAM --> DONE
```

---

## 1b: Phase 0-1 — 阈值解析 + 初始化

```mermaid
flowchart TD
    START(["开始"]) --> P0_1["读取用户设置:<br/>$GJC_CONFIG_DIR/settings.json"]
    P0_1 --> P0_2["读取项目设置:<br/>./.gjc/settings.json"]
    P0_2 --> P0_3{"项目设置有效?"}
    P0_3 -->|"是"| P0_4["使用项目值"]
    P0_3 -->|"否"| P0_5{"用户设置有效?"}
    P0_5 -->|"是"| P0_6["使用用户值"]
    P0_5 -->|"否"| P0_7["使用默认值: 0.05"]
    P0_4 --> P0_8["设定 resolvedThreshold<br/>resolvedThresholdPercent<br/>resolvedThresholdSource"]
    P0_6 --> P0_8
    P0_7 --> P0_8
    P0_8 --> P0_9["输出第一行公告:<br/>Deep Interview threshold: X%"]
    
    P0_9 --> P1_1["解析用户想法<br/>从 ARGUMENTS"]
    P1_1 --> P1_2["检测绿场 vs 棕场:<br/>运行 explore agent"]
    P1_2 --> P1_3{"源文件存在<br/>且涉及修改?"}
    P1_3 -->|"是"| P1_4["棕场: 运行 explore 映射代码库<br/>查询 .gjc/specs/deep-*.md<br/>查询 .gjc/plans/*.md<br/>构建 codebase_context"]
    P1_3 -->|"否"| P1_5["绿场: 无需代码库上下文"]
    
    P1_4 --> P1_6["验证 Phase 0 阈值已解析"]
    P1_5 --> P1_6
    P1_6 --> P1_7{"阈值值完整?"}
    P1_7 -->|"否"| P0_1
    P1_7 -->|"是"| P1_8{"初始上下文超大?"}
    P1_8 -->|"是"| P1_9["生成 prompt 安全摘要<br/>保留决策/约束/未知项<br/>不将原始大上下文粘贴到下游"]
    P1_8 -->|"否"| P1_10["使用原始想法"]
    P1_9 --> P1_10
    
    P1_10 --> P1_11["通过 gjc state write<br/>初始化状态 JSON"]
    P1_11 --> P1_12["向用户宣布访谈:<br/>- 阈值行<br/>- 开始提示<br/>- 你的想法<br/>- 项目类型<br/>- 当前歧义: 100%"]
    P1_12 --> R0_START(["进入 Round 0"])
```

---

## 1c: Round 0 — 拓扑枚举门

```mermaid
flowchart TD
    START(["Phase 1 完成"]) --> R0_1["从初始想法 + 棕场上下文<br/>枚举候选顶层组件<br/>（1-6个，提取独立动词/名词）"]
    R0_1 --> R0_2{"恢复旧状态<br/>且缺少 topology?"}
    R0_2 -->|"是"| R0_2A["标记 status: legacy_missing<br/>若无最终 spec 则运行 Round 0<br/>若有最终 spec 则注明并继续"]
    R0_2 -->|"否"| R0_3["问确认问题:<br/>Round 0 | 拓扑确认"]
    R0_2A --> R0_3
    
    R0_3 --> R0_4["展示 N 个顶层组件<br/>每个带一句话描述<br/>选项: Looks right /<br/>Add/remove/merge /<br/>Defer components"]
    R0_4 --> R0_5{"用户回答?"}
    R0_5 -->|"确认"| R0_6["锁定拓扑到状态:<br/>status: confirmed<br/>confirmed_at: 时间戳<br/>每个组件含 id/name/desc<br/>status: active|deferred"]
    R0_5 -->|"修改"| R0_7["根据反馈调整组件列表<br/>重新确认"]
    R0_7 --> R0_4
    
    R0_6 --> R0_8{"活跃组件数?"}
    R0_8 -->|"1个"| R0_9["单组件穿透:<br/>Phase 2 以该组件为目标"]
    R0_8 -->|">1个"| R0_10["多组件模式:<br/>Phase 2 跨组件轮换定位<br/>每个组件独立评分"]
    R0_9 --> P2(["进入 Phase 2"])
    R0_10 --> P2
```

---

## 1d: Phase 2 — 访谈循环（核心）

```mermaid
flowchart TD
    START(["Round 0 完成"]) --> P2_LOOP["Step 2a: 生成下一个问题"]
    
    P2_LOOP --> P2_STRATEGY["定位策略:<br/>1. 找最弱活跃组件+维度<br/>2. N>1 时跨组件轮换<br/>3. 生成针对性问题<br/>4. 范围模糊→本体论风格"]
    
    P2_STRATEGY --> P2A_CHECK{"绿场且标记<br/>research: true?"}
    P2A_CHECK -->|"是"| P2A_AUTO["Step 2a': 自动研究<br/>加载 auto-research-greenfield.md<br/>架构师返回 2-3 排名候选<br/>纳入问题选项"]
    P2A_CHECK -->|"否"| P2B
    P2A_AUTO --> P2A_VALID{"响应有效?"}
    P2A_VALID -->|"是"| P2B["Step 2b: 使用 ask 工具提问<br/>Round {n} | 组件: {name}<br/>定位: {dimension} | 歧义: {score}%"]
    P2A_VALID -->|"否"| P2A_FAIL["递增 architect_failures<br/>回退到正常问题"]
    P2A_FAIL --> P2B
    
    P2B --> P2B_ANSWER["用户回答 / 跳过"]
    P2B_ANSWER --> P2B_CHECK{"用户跳过<br/>或要求 agent 决定?"}
    P2B_CHECK -->|"是"| P2B_AUTO["Step 2b': 自动回答<br/>加载 auto-answer-uncertain.md<br/>架构师返回决定性答案<br/>清晰度上限: 0.85"]
    P2B_CHECK -->|"否"| P2C
    P2B_AUTO --> P2B_VALID{"响应有效?"}
    P2B_VALID -->|"是"| P2B_CAP["应用清晰度上限<br/>若跨阈值则要求用户确认"]
    P2B_VALID -->|"否"| P2B_FAIL["递增 architect_failures<br/>视为未解决差距"]
    P2B_CAP --> P2C
    P2B_FAIL --> P2C
    
    P2C["Step 2c: 评分歧义<br/>使用 opus 模型, temp 0.1"]
    P2C --> P2C_SCORE["评分每个活跃组件每维度:<br/>- 目标清晰度 (0-1)<br/>- 约束清晰度 (0-1)<br/>- 成功标准 (0-1)<br/>- 上下文清晰度 (仅棕场)"]
    
    P2C_SCORE --> P2C_CALC["计算歧义:<br/>绿场: 1-(goal×0.40 + constraints×0.30 + criteria×0.30)<br/>棕场: 1-(goal×0.35 + constraints×0.25 + criteria×0.25 + context×0.15)"]
    
    P2C_CALC --> P2C_ONTO["本体论提取:<br/>- 识别所有关键实体<br/>- Round 1: 所有实体为 new<br/>- Round 2+: 比较稳定性<br/>  stable/changed/new/removed<br/>  stability_ratio = (stable+changed)/total"]
    
    P2C_ONTO --> P2D["Step 2d: 报告进度<br/>- 维度分数表<br/>- 拓扑状态<br/>- 本体论稳定性<br/>- 下一个目标"]
    
    P2D --> P2E["Step 2e: 更新状态<br/>通过 gjc state write"]
    
    P2E --> P2F["Step 2f: 检查软限制"]
    P2F --> P2F_CHECK{"当前轮次?"}
    P2F_CHECK -->|"第3+轮, 用户说够了"| P2F_EARLY["允许提前退出<br/>歧义>阈值时警告"]
    P2F_CHECK -->|"第10轮"| P2F_SOFT["软警告: 已10轮<br/>继续还是前进?"]
    P2F_CHECK -->|"第20轮"| P2F_HARD["硬上限: 以当前清晰度继续"]
    P2F_CHECK -->|"其他"| P2F_NEXT{"歧义 ≤ 阈值?"}
    
    P2F_SOFT --> P2F_NEXT
    P2F_NEXT -->|"是"| P3_CHECK(["进入 Phase 3 检查"])
    P2F_NEXT -->|"否"| P2F_STAG{"连续3轮<br/>歧义停滞?"}
    P2F_STAG -->|"是"| P2F_ONTO["激活本体论模式<br/>重新框架"]
    P2F_STAG -->|"否"| P2F_DIM{"所有维度 ≥0.9?"}
    P2F_DIM -->|"是"| P3_CHECK
    P2F_DIM -->|"否"| P2_LOOP
    P2F_ONTO --> P2_LOOP
```

---

## 1e: Phase 3 — 挑战 Agent 模式

```mermaid
flowchart TD
    START(["Phase 2 循环中<br/>检查挑战模式"]) --> C1{"轮次 ≥ 4<br/>反向模式未用?"}
    C1 -->|"是"| C1_ACT["激活 CONTRARIAN 模式<br/>注入: '如果相反的情况是真的呢?'<br/>挑战用户核心假设"]
    C1 -->|"否"| C2{"轮次 ≥ 6<br/>简化模式未用?"}
    C1_ACT --> NEXT_ROUND(["返回 Phase 2<br/>恢复正常提问"])
    
    C2 -->|"是"| C2_ACT["激活 SIMPLIFIER 模式<br/>注入: '最简单的版本是什么?'<br/>探究复杂性是否可移除"]
    C2 -->|"否"| C3{"轮次 ≥ 8<br/>歧义 > 0.3<br/>本体论模式未用?"}
    C2_ACT --> NEXT_ROUND
    
    C3 -->|"是"| C3_ACT["激活 ONTOLOGIST 模式<br/>注入: '这本质上是什么?'<br/>检查核心实体, 寻找本质"]
    C3 -->|"否"| C3_SKIP["所有模式已用或条件不满足<br/>继续正常苏格拉底式提问"]
    C3_ACT --> NEXT_ROUND
    C3_SKIP --> NEXT_ROUND
    
    NEXT_ROUND --> TRACK["在 state.challenge_modes_used<br/>中记录已用模式<br/>每个模式仅用一次"]
```

---

## 1f: Phase 4-5 — Spec 结晶化 + 执行桥接

```mermaid
flowchart TD
    START(["歧义 ≤ 阈值<br/>或硬上限/提前退出"]) --> P4_1["Phase 4: 生成 Spec<br/>使用 opus 模型<br/>配合 prompt 安全的转录"]
    
    P4_1 --> P4_2["写入最终 Spec:<br/>.gjc/specs/deep-interview-{slug}.md<br/>通过 gjc deep-interview --write"]
    
    P4_2 --> P4_STRUCT["Spec 结构:<br/>- 元数据 (ID/轮次/分数/类型)<br/>- 清晰度分解<br/>- 拓扑 (每组件覆盖/推迟说明)<br/>- 目标 / 约束 / 非目标<br/>- 验收标准<br/>- 已揭示和解决的假设<br/>- 技术上下文<br/>- 本体论 (关键实体)<br/>- 本体论收敛表<br/>- 访谈转录 (折叠)"]
    
    P4_STRUCT --> P5["Phase 5: 执行桥接<br/>标记 spec 为 待批准<br/>通过 ask 工具呈现选项"]
    
    P5 --> P5_CHOICE{"用户选择?"}
    
    P5_CHOICE -->|"1. ralplan 精炼 (推荐)"| P5_RALPLAN["交接: gjc state deep-interview write<br/>→ /skill:ralplan<br/>流水线: spec → ralplan → 待批准<br/>→ 单独执行批准"]
    P5_CHOICE -->|"2. ultragoal 执行"| P5_ULTRA["交接: gjc state deep-interview write<br/>→ /skill:ultragoal<br/>仅当 spec 实现就绪且简单"]
    P5_CHOICE -->|"3. team 执行"| P5_TEAM["交接: gjc state deep-interview write<br/>→ /skill:team<br/>仅当需要 tmux 并行化"]
    P5_CHOICE -->|"4. 进一步精炼"| P5_REFINE["返回 Phase 2<br/>继续访谈"]
    
    P5_RALPLAN --> P5_GATE["3阶段批准门控:<br/>Stage 1: 深度访谈 (清晰度)<br/>Stage 2: ralplan 共识 (可行性)<br/>Stage 3: 单独批准 (同意)"]
    P5_GATE --> DONE(["完成"])
    P5_ULTRA --> DONE
    P5_TEAM --> DONE
    P5_REFINE --> LOOP(["返回 Phase 2"])
```

---

## 维度权重参考

| 维度 | 绿场权重 | 棕场权重 |
|------|---------|---------|
| 目标清晰度 | 40% | 35% |
| 约束清晰度 | 30% | 25% |
| 成功标准 | 30% | 25% |
| 上下文清晰度 | N/A | 15% |

## 挑战 Agent 模式触发条件

| 模式 | 激活轮次 | 条件 | 目的 |
|------|---------|------|------|
| 反向 (Contrarian) | 第 4+ 轮 | 未使用 | 挑战核心假设 |
| 简化 (Simplifier) | 第 6+ 轮 | 未使用 | 寻找最小可行规格 |
| 本体论 (Ontologist) | 第 8+ 轮 | 歧义 > 0.3 且未使用 | 寻找本质核心概念 |

## 停止条件

| 条件 | 动作 |
|------|------|
| 歧义 ≤ 阈值 | 正常进入 Phase 4 |
| 第 3+ 轮用户说"够了" | 允许提前退出，歧义>阈值时警告 |
| 第 10 轮 | 软警告：继续或前进 |
| 第 20 轮 | 硬上限：以当前清晰度继续 |
| 连续 3 轮歧义停滞 (±0.05) | 激活本体论模式 |
| 所有维度 ≥ 0.9 | 即使未达最小轮次也跳到 spec 生成 |
| 用户说"停止/取消/中止" | 立即停止，保存状态 |
| 代码库探索失败 | 作为绿场继续，注明限制 |
