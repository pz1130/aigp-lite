# AIGP-Lite 用户手册

> 适用版本：v0.22.0 起 · 界面语言：中文 / English（右上角切换）

本手册面向所有终端用户，涵盖登录、5 种角色能做什么、各模块的常见操作。
当前侧边栏共 22 个模块（另有「ASI 红队清单」作为「AI 信任」页内的卡片入口）。
管理员侧的部署、Provider 配置、连接器对接等内容见 [管理员手册](../admin/README.md)。

---

## 目录

- [1. 登录与界面](#1-登录与界面)
- [2. 角色与权限](#2-角色与权限)
- [3. 主导航与模块分组](#3-主导航与模块分组)
- [4. 各角色典型工作流](#4-各角色典型工作流)
- [5. 模块详解](#5-模块详解)
- [6. 常见问题](#6-常见问题)

---

## 1. 登录与界面

### 访问地址

部署完成后默认入口：`http://<host>:3000` → 自动跳转 `/zh/login`。
URL 前缀 `/zh` 表示中文界面，`/en` 表示英文界面，可在登录后通过右上角语言切换。

### 演示账号

种子数据自动创建以下 5 个账号（密码均为 `demo1234`）：

| 邮箱                      | 角色         | 用途                 |
| ------------------------- | ------------ | -------------------- |
| `admin@demo.local`        | admin        | 系统管理员，权限最大 |
| `risk_officer@demo.local` | risk_officer | 风险官 / 合规官      |
| `ai_owner@demo.local`     | ai_owner     | AI 业务负责人        |
| `auditor@demo.local`      | auditor      | 审计员               |
| `viewer@demo.local`       | viewer       | 只读用户             |

生产环境请删除或修改这些演示账号。新建用户需要管理员通过注册流程或直接调用 `auth.register` tRPC 接口。

### 登录后第一屏

登录后落在 **总览（Dashboard）**，显示当前组织的核心指标卡片：

- AI 用例总数（按生命周期阶段细分）
- 风险评估覆盖率
- 当月费用 / 预算占用
- 待处理事件
- 最近审批活动

侧边栏按 **govern / operate / connect / insight** 四个分组组织 22 个模块。

### 语言切换

右上角下拉菜单的 **Locale** 选项可在 `zh` / `en` 之间切换。注意：合规相关术语（EU AI Act 控制项编号、NIST 类别等）在两种语言下都保留英文原文。

### 用户头像

右上角圆形头像（默认显示邮箱首字母）打开下拉菜单：

- **当前账号** — 邮箱、角色
- **Logout / 退出** — 登出并跳回 `/login`

---

## 2. 角色与权限

权限矩阵定义在 `src/lib/rbac/roles.ts`。**所有 mutation 在服务端强制校验**，前端按钮的可见性只是辅助提示。

### 资源 × 角色 速查表

R = 读 · W = 写 · D = 删除

| 资源                     | admin | risk_officer | ai_owner | auditor | viewer |
| ------------------------ | ----- | ------------ | -------- | ------- | ------ |
| AI 资产登记（inventory） | RWD   | R            | RWD      | R       | R      |
| 风险与合规（risk）       | RWD   | RWD          | R        | R       | R      |
| 治理成熟度（maturity）   | RWD   | RW           | R        | R       | R      |
| 策略与运行时（policy）   | RWD   | RWD          | RWD      | R       | R      |
| 审批流程（workflow）     | RWD   | RW           | RW       | R       | R      |
| 证据管理（evidence）     | RWD   | RW           | RW       | R       | R      |
| 数据血缘（data_lineage） | RWD   | R            | RW       | R       | R      |
| 审计日志（audit）        | RWD   | R            | R        | R       | R      |
| 集成管理（integrations） | RWD   | R            | RW       | R       | R      |
| 服务商（provider）       | RWD   | R            | R        | R       | R      |
| 安全事件（incident）     | RWD   | RWD          | RW       | R       | R      |
| 合规报告（reports）      | RWD   | RWD          | R        | RW      | R      |
| 成本管理（finops）       | RWD   | RW           | R        | R       | R      |
| AI 信任（redteam）       | RWD   | RW           | RW       | R       | R      |
| 组织（org）              | RWD   | R            | R        | R       | R      |

### 角色画像

- **admin**：系统级配置，包括用户管理、Provider 连接、连接器、API Key 签发。权限最大但日常并不每天用。
- **risk_officer**：核心业务用户。制定策略、做风险评估、出合规报告、跑红队、处理事件。
- **ai_owner**：业务团队代表。登记自家 AI 用例、维护模型卡、申请上线审批、查看红队结果。
- **auditor**：第三方审计 / 内审。只读 + 出报告，不能改业务数据。
- **viewer**：只读。适合给业务高管、临时观察员。

---

## 3. 主导航与模块分组

侧边栏分四组，从左侧固定列表点击进入。

### Govern · 治理

| 模块                     | 路径         | 一句话                                  |
| ------------------------ | ------------ | --------------------------------------- |
| AI 资产登记（Inventory） | `/inventory` | 所有 AI 用例的中心目录                  |
| 风险与合规（Risk）       | `/risk`      | EU AI Act / NIST AI RMF 控制项评估      |
| 治理成熟度（Maturity）   | `/maturity`  | ISO 42001 6 支柱成熟度自评              |
| 策略与运行时（Policy）   | `/policy`    | LLM prompt/output 实时策略 + Playground |
| AI 信任（Redteam）       | `/redteam`   | 红队评估 + 模型卡生成                   |

### Operate · 运营

| 模块                     | 路径            | 一句话                       |
| ------------------------ | --------------- | ---------------------------- |
| 审批流程（Workflow）     | `/workflow`     | 多步骤上线审批               |
| 证据管理（Evidence）     | `/evidence`     | 证据文件管理（SHA-256 校验） |
| 安全事件（Incidents）    | `/incidents`    | 安全事件登记与处置           |
| 合规报告（Reports）      | `/reports`      | NIST / ISO / EU 报告生成     |
| 数据血缘（Data Lineage） | `/data-lineage` | 数据源 → 用例可视化          |

### Connect · 集成

| 模块                     | 路径                      | 一句话                              |
| ------------------------ | ------------------------- | ----------------------------------- |
| 集成管理（Integrations） | `/integrations`           | Slack / Teams / ServiceNow 等连接器 |
| 服务商（Providers）      | `/integrations/providers` | LLM 服务商连接管理                  |

### Insight · 洞察

| 模块               | 路径      | 一句话                 |
| ------------------ | --------- | ---------------------- |
| 成本管理（FinOps） | `/finops` | 成本看板 / 预算 / 价目 |
| 审计日志（Audit）  | `/audit`  | 全平台审计追踪         |

---

## 4. 各角色典型工作流

### 4.1 admin · 系统初始化

刚部署完一个新实例的标准步骤：

1. **改演示账号密码 / 创建真实账号**
   - 当前注册入口在 `/zh/register`，新注册用户默认 `viewer` 角色
   - 升级角色需要管理员在 Prisma Studio（`npm run prisma:studio`）改 `membership.role`，或编写一次性脚本
2. **配置至少一个 Provider 连接**
   - **集成管理 → 服务商 → 新建连接**，从目录选择（OpenAI / Anthropic / Azure / DeepSeek 等 13 种），粘贴 API Key
   - 创建后系统会自动 Ping 一次，状态显示 `ok` 才算可用
3. **创建一把运行时 API Key**
   - `/integrations/providers` 页面有 API Key 列表，**新建 API Key** 选择需要的 scope（一般是 `runtime.invoke` + `runtime.read`）
   - **Key 只显示一次**（aigp\_... 开头），必须当场复制，否则只能销毁重发
4. **配置 Slack / Teams / ServiceNow（可选）**
   - 见管理员手册的「连接器」一节
5. **熟悉策略与红队**
   - 在 `/policy/playground` 试一下 PII 检测
   - 在 `/redteam/runs/new` 发起一次 jailbreak 评估

### 4.2 risk_officer · 一周典型节奏

| 周一上午 | 检查上周新建用例，做风险初评（`/risk` → 选用例 → 评估各控制项） |
| -------- | --------------------------------------------------------------- |
| 周中     | 制定 / 调整策略（`/policy`），在 Playground 验证                |
| 周中     | 红队评估（`/redteam/runs/new`）+ 看 findings                    |
| 周五     | 处理事件（`/incidents`）、出周报（`/reports`）                  |

### 4.3 ai_owner · 新用例上线

1. **登记用例** — `/inventory/new`：填名称、autonomy level、deployment type、描述
2. **接 LLM 调用** — 拿到 admin 发的 API Key，调用 `POST /api/runtime/llm`：
   ```bash
   curl -X POST https://<host>/api/runtime/llm \
     -H "Authorization: Bearer aigp_xxx" \
     -H "Content-Type: application/json" \
     -d '{
       "connectionId": "<provider-conn-id>",
       "usecaseId":    "<your-usecase-id>",
       "model":        "gpt-4o-mini",
       "messages":     [{"role":"user","content":"hi"}]
     }'
   ```
3. **跟踪审批** — `/workflow` 看自家用例的审批进度
4. **维护模型卡** — `/redteam/model-cards` 选自家用例生成最新版本（Markdown / PDF）

### 4.4 auditor · 季度合规检查

1. `/audit` 浏览审计日志，按操作类型 / 时间筛选，导出 CSV
2. `/reports` → 选模板（NIST AI RMF / ISO 42001 / EU AI Act）→ 选时间段 → 生成 PDF / Markdown
3. `/incidents` 检查事件处置闭环

### 4.5 viewer · 看仪表盘

只能浏览，不能修改任何数据。常用页面：

- 总览 `/`
- `/inventory` 看 AI 用例清单
- `/finops/costs` 看费用趋势

---

## 5. 模块详解

### 5.1 AI 资产登记 · Inventory

**功能**：所有 AI 用例的中心目录。
**关键字段**：

| 字段     | 取值                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 名称     | 自由文本，组织内唯一                                                     |
| 生命周期 | `proposed` → `development` → `production` → `retired`                    |
| 自主性   | `assistant` / `simple_agent` / `collaborative_agent` / `agent_ecosystem` |
| 部署类型 | `built`（自建）/ `blended`（融合）/ `embedded`（嵌入）/ `byo`（自带）    |
| 所有者   | 自动绑定为创建人                                                         |

**常用操作**：

- 新建：`/inventory/new`
- 编辑模型卡：进入详情页 → 模型卡 tab
- 升级到生产：通过 `/workflow` 发起审批，不能直接改 lifecycle

### 5.2 风险与合规 · Risk

**功能**：基于 EU AI Act / NIST AI RMF / ISO 42001 的控制项评估。

**操作流程**：

1. `/risk` 选一个用例
2. 选择适用的合规框架
3. 对每个控制项打分：`covered` / `partial` / `not_covered` / `not_applicable`
4. 系统自动算出风险分（高 / 中 / 低）

种子数据已经导入 3 个框架，共 16 个控制项。

### 5.3 治理成熟度 · Maturity

**功能**：ISO 42001 推荐的 6 支柱组织级成熟度自评。
**6 支柱**：

1. AI Strategy
2. People & Culture
3. Risk Management
4. Data Governance
5. Model Lifecycle
6. Monitoring & Continuous Improvement

每个支柱评 0–4 分，提交后系统画雷达图并给改进建议。

### 5.4 策略与运行时 · Policy

**功能**：在 LLM 调用链上实时拦截 / 警告。

**策略类型**：

- `block` — 命中即拒绝（返回 422）
- `warn` — 命中只记录 + audit，调用照常返回
- `audit_only` — 仅记录

**策略规则**：用 [JSONLogic](https://jsonlogic.com/) 表达式，访问 `text`（prompt 文本）变量。例如：

```json
{ "and": [{ "regex_match": [{ "var": ["text"] }, "\\d{3}-\\d{2}-\\d{4}"] }] }
```

检测美国 SSN 格式。

**Playground**：`/policy/playground`

- 粘贴 API Key、选 Provider 连接、选用例、选模型、输入 prompt
- 实时流式返回，命中的策略以红色 / 黄色高亮

### 5.5 审批流程 · Workflow

**功能**：用例从开发到生产的多步审批。

**默认 3 步流程**（创建用例时自动启动）：

1. **风险评估** — risk_officer 批准
2. **策略对齐** — risk_officer 批准
3. **生产上线** — admin 批准

**操作**：`/workflow` → 选实例 → 在每个步骤点 **批准** 或 **驳回**。全部批准后用例的 lifecycle 自动升到 `production`。

### 5.6 证据管理 · Evidence

**功能**：上传任意文件作为合规证据。

- 上传时自动算 SHA-256，存到 `evidence/sha256:<hex>` 路径
- 同一份内容只存一份（哈希去重）
- 可关联到具体用例 / 控制项 / 事件

### 5.7 安全事件 · Incidents

**功能**：登记和处置 AI 相关的安全 / 合规事件。

**状态**：`open` → `investigating` → `mitigated` → `closed`
**严重性**：`low` / `medium` / `high` / `critical`

**自动入口**：

- 红队评估发现 `fail` 时自动建事件并关联
- ServiceNow 推过来的工单（通过连接器）

### 5.8 合规报告 · Reports

**功能**：基于审计日志、风险评估、控制项状态自动生成报告。

**支持模板**：

- NIST AI RMF
- ISO 42001
- ISO 27001（基础）
- EU AI Act 摘要

**操作**：`/reports` → **生成报告** → 选模板和时间段 → 几秒后出现在列表，可下 PDF / Markdown。

### 5.9 数据血缘 · Data Lineage

**功能**：可视化 数据源 → 用例 的关系图（React Flow）。

**操作**：

- `/data-lineage` 主页选用例，看节点图
- 节点：数据源（DataSource） / 用例（AiUsecase）
- 边：训练数据、推理输入、微调数据 …

### 5.10 集成管理 · Integrations

**功能**：连接器 + Webhook 端点 + 加密凭据。

**支持连接器**：

- **Slack** — 出站通知（事件、预算告警）
- **Microsoft Teams** — 出站通知
- **ServiceNow** — 双向同步（事件 ↔ 工单）

**Webhook 端点**：自定义出站 webhook，监听 usecase / incident / budget 事件。每个端点有自己的 secret，请求带 `X-AIGP-Signature` HMAC-SHA256。

### 5.11 服务商 · Providers

**功能**：管理 LLM Provider 连接 + API Key 签发。

**Provider 目录**：

- OpenAI, Anthropic, Azure OpenAI, Google Gemini
- DeepSeek, Qwen DashScope, Moonshot Kimi, Zhipu GLM
- MiniMax, Doubao Volcengine, Baidu Qianfan
- Ollama
- Custom OpenAI-compatible / Anthropic-compatible

凭据用 AES-256-GCM 加密存储，主密钥来自 `AIGP_ENCRYPTION_KEY` 环境变量。

### 5.12 成本管理 · FinOps

**三个子页**：

- **/finops/costs** — 每日费用趋势、按用例/API Key/Provider 切片
- **/finops/budgets** — 创建预算（hardCap 触发 429 阻断，softCap 仅告警）
- **/finops/pricing** — 价目浏览（按 token 计价）

**预算 scope**：

- `org` — 整个组织
- `api_key` — 单把 Key
- `usecase` — 单个用例

### 5.13 AI 信任 · Redteam

**两个核心动作**：

**1. 跑红队评估** — `/redteam/runs/new`

- 选 Provider 连接 + 模型名
- 选 prompt 库类别（jailbreak / prompt_injection / bias / harmful / pii_leak）
- 勾选具体 prompt（系统自带 201 条 built-in），或上传自定义
- 点击 **开始** → 跳转到运行详情页，SSE 实时刷新 findings 表
- 评估完后如果有 `fail`，自动创建 Incident

**2. 生成模型卡** — `/redteam/model-cards`

- 选一个用例
- 选格式（Markdown / PDF）
- 系统聚合该用例的：所有者、风险评估、最近 3 次红队结果，渲染成 7 章节模型卡

### 5.14 审计日志 · Audit

**功能**：所有 mutation 都自动写入审计日志。

**字段**：操作时间、行为人、动作（如 `redteam.run.start`）、资源类型 + ID、变更前 / 变更后 JSON。
**敏感字段**：API Key、密码、加密凭据等会被替换为 `[redacted]`。

**操作**：`/audit` → 按时间 / 行为人 / 动作类型过滤 → 导出 CSV。

### 5.15 测试与治理你自己的 Agent

如何把红队 / MCP 审计 / 合规评估指向你**自己搭建**的 AI Agent(嘴 / 手 / 合规 三层模型 +
接入步骤),见专题指南:[测试与治理你自己的 Agent](./testing-your-agent.zh.md)
（[English](./testing-your-agent.md)）。

---

## 6. 常见问题

### 提示 "您没有权限"

当前账号角色不允许该操作。看 §2 速查表，找 admin 申请升级，或换有权限的账号。

### 上传文件失败

- 单个文件大小默认上限 10 MB。
- Storage 卷 `aigp_storage` 可能满了 — 让 admin 清理。

### Provider Ping 显示 `error`

- API Key 无效 / 过期 — 重发一个
- 模型名拼错 — 看 Provider 文档
- Provider 地区受限 — 改 `baseUrl` 走代理（仅对 `openai_compatible` / `anthropic_compatible` 类型有效）

### LLM 调用返回 429

预算超额（`X-Budget-Exceeded` 响应头会说明 scope）。

- 联系 admin 提升预算
- 或等到下个周期（响应头 `Retry-After` 给出秒数）

### 浏览器不显示中文

URL 改成 `/zh/...`，或在右上角语言下拉选 `zh`。

### 找不到刚创建的用例 / 策略 / 报告

确认登录的账号属于同一个组织。系统多租户隔离 —— 不同组织的数据互相不可见。

---

## 反馈

GitHub Issues：<https://github.com/pz1130/aigp-lite/issues>
