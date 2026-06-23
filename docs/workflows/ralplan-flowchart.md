# Ralplan 流程图

> 三角色共识规划 — Planner → Architect → Critic 迭代直到共识

---

## 2a: 总览 — 预执行门 + 共识工作流

```mermaid
flowchart TD
    START(["用户输入<br/>/skill:ralplan [flags] <任务>"]) --> GATE["预执行门检查"]
    
    GATE --> GATE_CHECK{"Prompt 是否足够具体?"}
    GATE_CHECK -->|"具体信号存在:<br/>文件路径/Issue编号<br/>函数名/类名/测试目标<br/>编号步骤/验收标准<br/>错误引用/代码块<br/>force: 或 ! 前缀"| PASS["门通过 → 直接执行"]
    GATE_CHECK -->|"模糊信号:<br/>≤15有效词<br/>无具体锚点"| REDIRECT["门拦截 → 重定向到 ralplan"]
    
    REDIRECT --> RALPLAN["启动 ralplan 共识工作流"]
    PASS --> EXEC["交给 ultragoal/team 执行"]
    
    RALPLAN --> CHECK_MODE{"模式?"}
    CHECK_MODE -->|"高危自动检测:<br/>认证/安全/迁移<br/>破坏性更改/生产事件<br/>合规/PII/API破坏"| DELIBERATE["强制 Deliberate 模式"]
    CHECK_MODE -->|"--deliberate 标志"| DELIBERATE
    CHECK_MODE -->|"默认短模式"| CONSENSUS["标准共识循环"]
    
    DELIBERATE --> CONSENSUS
    
    CONSENSUS --> P1["Step 1: Planner 创建初始计划<br/>+ RALPLAN-DR 摘要"]
    P1 --> INTERACTIVE{"--interactive?"}
    INTERACTIVE -->|"是"| USER_FB["Step 2: 用户反馈<br/>呈现草案计划 + 原则/驱动因素/选项<br/>继续审查 / 请求更改 / 跳过审查"]
    INTERACTIVE -->|"否"| P3["Step 3: Architect 审查"]
    USER_FB -->|"继续"| P3
    USER_FB -->|"请求更改"| P1
    
    P3 --> P4["Step 4: Critic 评估"]
    P4 --> P5{"Critic 判决?"}
    P5 -->|"APPROVE"| P6["Step 6: 标记为待批准<br/>持久化 ADR + 最终计划"]
    P5 -->|"ITERATE / REJECT"| P5_LOOP{"迭代次数 < 5?"}
    P5_LOOP -->|"是"| P5_REVISE["Step 5: 修订循环<br/>1. 收集 A+C 反馈<br/>2. 恢复持久化 Planner<br/>3. 修订计划<br/>4. 返回 Architect<br/>5. 返回 Critic"]
    P5_LOOP -->|"否"| P5_BEST["呈现最佳版本<br/>标记为待批准"]
    P5_REVISE --> P3
    
    P6 --> P6_INTERACTIVE{"--interactive?"}
    P6_INTERACTIVE -->|"是"| P6_ASK["呈现计划 + 批准选项:<br/>1. 批准通过 ultragoal<br/>2. 批准通过 team<br/>3. 等待执行批准<br/>4. 请求更改<br/>5. 拒绝"]
    P6_INTERACTIVE -->|"否"| P6_OUTPUT["输出最终计划<br/>停止，不执行变更"]
    
    P6_ASK --> P6_CHOICE{"用户选择?"}
    P6_CHOICE -->|"ultragoal"| P6_U["交接 → /skill:ultragoal"]
    P6_CHOICE -->|"team"| P6_T["交接 → /skill:team"]
    P6_CHOICE -->|"等待"| P6_WAIT["计划标记待批准<br/>停止"]
    P6_CHOICE -->|"更改"| P1
    P6_CHOICE -->|"拒绝"| DONE(["结束"])
    
    P5_BEST --> DONE
    P6_OUTPUT --> DONE
    P6_U --> DONE
    P6_T --> DONE
    P6_WAIT --> DONE
```

---

## 2b: 共识循环 — Planner / Architect / Critic / 修订

```mermaid
flowchart TD
    START(["开始共识循环"]) --> PLANNER["Planner (持久化子Agent)<br/>创建初始计划"]
    
    PLANNER --> PLANNER_OUT["生成内容:<br/>- 实现计划<br/>- RALPLAN-DR 摘要<br/>  - 原则 (3-5条)<br/>  - 决策驱动因素 (前3)<br/>  - 可行选项 (≥2)<br/>  - 优缺点分析<br/>- 若仅剩1个选项: 说明排除理由"]
    
    PLANNER_OUT --> PLANNER_WRITE["持久化: gjc ralplan --write<br/>--stage planner --stage_n 1<br/>--artifact '...'"]
    PLANNER_WRITE --> PLANNER_RETURN["仅返回收据:<br/>run_id, path, sha256<br/>(不粘贴完整正文)"]
    
    PLANNER_RETURN --> ARCHITECT["Architect (每次新鲜生成)<br/>审查架构合理性"]
    ARCHITECT --> ARCHITECT_DO["必须提供:<br/>- 最强 Steelman 反题<br/>- 至少1个真实权衡张力<br/>- 可能时提供综合<br/>- Deliberate: 标记原则违反"]
    ARCHITECT_DO --> ARCHITECT_WRITE["持久化: gjc ralplan --write<br/>--stage architect --stage_n N"]
    ARCHITECT_WRITE --> ARCHITECT_RETURN["返回收据 + 判决:<br/>CLEAR / WATCH / BLOCK<br/>APPROVE / COMMENT / REQUEST_CHANGES<br/>(不粘贴完整审查正文)"]
    
    ARCHITECT_RETURN --> CRITIC["Critic (每次新鲜生成)<br/>评估质量标准"]
    CRITIC --> CRITIC_DO["强制执行:<br/>- 原则-选项一致性<br/>- 公平的替代方案<br/>- 风险缓解清晰度<br/>- 可测试验收标准<br/>- 具体验证步骤<br/>- Deliberate: 拒绝缺失预mortem"]
    CRITIC_DO --> CRITIC_WRITE["持久化: gjc ralplan --write<br/>--stage critic --stage_n N"]
    CRITIC_WRITE --> CRITIC_RETURN["返回收据 + 判决:<br/>OKAY / ITERATE / REJECT<br/>(不粘贴完整评估正文)"]
    
    CRITIC_RETURN --> JUDGE{"判决?"}
    JUDGE -->|"OKAY=APPROVE"| APPROVED(["共识达成 → Step 6"])
    
    JUDGE -->|"ITERATE / REJECT"| ITER_COUNT{"迭代次数 < 5?"}
    ITER_COUNT -->|"是"| REVISE["修订计划"]
    ITER_COUNT -->|"否, 已达上限"| BEST(["呈现最佳版本 → 待批准"])
    
    REVISE --> REVISE_ACTION["1. 收集 Architect + Critic 反馈<br/>2. 尝试恢复持久化 Planner"]
    REVISE_ACTION --> RESUME_CHECK{"Planner 恢复结果?"}
    RESUME_CHECK -->|"running"| STEER["steer/注入反馈<br/>到同一 Planner"]
    RESUME_CHECK -->|"queued"| WAIT["保留/更新排队消息<br/>等待同一 ID"]
    RESUME_CHECK -->|"context_unavailable<br/>not_found<br/>no_runner<br/>resume_failed"| FALLBACK["新鲜生成 Planner<br/>记录回退元数据"]
    RESUME_CHECK -->|"终端 + 修订消息"| RESUME_CTX{"上下文可用?"}
    RESUME_CTX -->|"是"| STEER
    RESUME_CTX -->|"否"| FALLBACK
    
    STEER --> REVISE_WRITE["持久化修订: gjc ralplan --write<br/>--stage revision --stage_n N<br/>--planner-id / --planner-resumable"]
    WAIT --> REVISE_WRITE
    FALLBACK --> REVISE_WRITE_FB["持久化修订 + 回退标志:<br/>--fallback-reason<br/>--fallback-attempted-id<br/>--fallback-stage-n"]
    
    REVISE_WRITE --> ARCHITECT
    REVISE_WRITE_FB --> ARCHITECT
```

---

## 2c: Deliberate 模式 — 高风险工作

```mermaid
flowchart TD
    START(["触发 Deliberate 模式"]) --> TRIGGER{"触发方式?"}
    
    TRIGGER -->|"--deliberate 标志"| DELIB["显式 Deliberate"]
    TRIGGER -->|"自动检测高危信号"| AUTO["自动 Deliberate:<br/>- 认证/安全<br/>- 数据迁移<br/>- 破坏性更改<br/>- 生产事件<br/>- 合规/PII<br/>- 公共 API 破坏"]
    
    DELIB --> DELIB_FEAT["Deliberate 增强功能"]
    AUTO --> DELIB_FEAT
    
    DELIB_FEAT --> PREMORTEM["预 Mortem (3个场景):<br/>Planner 必须分析<br/>- 场景1: 最可能失败模式<br/>- 场景2: 最坏情况<br/>- 场景3: 意外后果"]
    
    PREMORTEM --> TEST_PLAN["扩展测试计划:<br/>- 单元测试策略<br/>- 集成测试策略<br/>- E2E 测试策略<br/>- 可观测性计划"]
    
    TEST_PLAN --> ARCH_CHECK["Architect 额外职责:<br/>明确标记原则违反<br/>审查预 mortem 完整性"]
    
    ARCH_CHECK --> CRITIC_CHECK["Critic 额外职责:<br/>拒绝缺失/薄弱的预 mortem<br/>拒绝缺失扩展测试计划<br/>验证风险缓解充分性"]
    
    CRITIC_CHECK --> RESULT{"通过?"}
    RESULT -->|"是"| APPROVED(["继续标准流程"])
    RESULT -->|"否"| REVISE(["回到 Planner 修订"])
```

---

## 2d: 执行桥接 — 批准门控 + 交接

```mermaid
flowchart TD
    START(["共识达成 / Critic APPROVE"]) --> FINAL_WRITE["持久化最终计划:<br/>gjc ralplan --write --stage final<br/>--stage_n N --artifact '...'"]
    
    FINAL_WRITE --> ADR["ADR 包含:<br/>- 决策<br/>- 驱动因素<br/>- 考虑的替代方案<br/>- 为什么选择<br/>- 后果<br/>- 后续事项"]
    
    ADR --> CHECK_MODE{"运行模式?"}
    CHECK_MODE -->|"--interactive"| INTERACTIVE["呈现计划 + 批准选项<br/>通过 ask 工具"]
    CHECK_MODE -->|"非交互"| AUTO["输出最终计划<br/>标记为 待批准<br/>停止，不执行变更"]
    
    INTERACTIVE --> CHOICE{"用户选择?"}
    CHOICE -->|"批准 ultragoal (推荐)"| U_HANDOFF["标记 ralplan 就绪:<br/>gjc state ralplan write handoff<br/>→ /skill:ultragoal<br/>Skill 链守卫原子降级/提升"]
    CHOICE -->|"批准 team"| T_HANDOFF["标记 ralplan 就绪:<br/>gjc state ralplan write handoff<br/>→ /skill:team<br/>仅 tmux 并行化需要"]
    CHOICE -->|"压缩后等待"| WAIT["计划标记待批准<br/>停止等待"]
    CHOICE -->|"请求更改"| REVISE(["返回 Planner 修订"])
    CHOICE -->|"拒绝"| REJECT(["结束，不执行"])
    
    U_HANDOFF --> EXEC_DONE(["执行开始"])
    T_HANDOFF --> EXEC_DONE
    WAIT --> WAIT_DONE(["待批准状态"])
    AUTO --> AUTO_DONE(["待批准状态"])
```

---

## 预执行门：好 vs 坏 Prompt

| 状态 | 示例 | 原因 |
|------|------|------|
| 通过 | `team fix src/hooks/bridge.ts:326` | 引用特定文件 |
| 通过 | `team implement issue #42` | 具体工作项 |
| 通过 | `team fix processKeywordDetector` | 命名特定函数 |
| 通过 | `team add validation to UserModel` | 命名特定类 |
| 通过 | `team do:\n1. Add X\n2. Test Y` | 结构化交付物 |
| 通过 | `force: team refactor auth` | 显式覆盖 |
| 拦截 | `team fix this` | 无锚点 |
| 拦截 | `team build the app` | 过于宽泛 |
| 拦截 | `team improve performance` | 无具体目标 |
| 拦截 | `team add authentication` | 无具体规格 |
