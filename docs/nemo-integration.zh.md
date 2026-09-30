# NeMo Guardrails 集成指南

## 概述

本文档说明 [NVIDIA NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails)（Python 护栏工具包，Apache-2.0 许可）如何集成进 AIGP-Lite。NeMo 作为内部 Docker 边车（sidecar）运行，并承担**两个不同的角色**：

1. **红队评判器（judge）** —— 红队运行的一种可选*评判器*。评判器的选择与运行*引擎*正交：使用 NeMo 评判的运行仍保留在 builtin 引擎上。NeMo **不会**替代 Moonshot 作为引擎；Moonshot 引擎与 NeMo 评判器互斥（Moonshot 自带其评判逻辑）。
2. **HITL / 终止开关（kill-switch）参考控制** —— 一个参考性的 Colang 配置（`nemo-configs/hitl-killswitch/`），演示针对高风险操作的审批闸门（approval gate）和一个终止开关，并映射到《欧盟人工智能法案》第 14 条。这是一个**参考实现与证据制品**，而非置于模型前端的运行时网关。

## 架构

AIGP-Lite（Next.js 15 / TypeScript / Prisma）与 NeMo Guardrails（Python 3.12）在 compose 网络中作为独立服务运行。

### 评判器角色（运行时）

当某次红队运行选择 NeMo 评判器时，SSE 运行器会将每个 `(prompt, response)` 对通过 NeMo 评判器（`judgeWithNemo`）处理，而不是 builtin 检查器。评判调用是针对边车 `aigp_judge` 配置的 OpenAI 兼容 `POST /v1/chat/completions`。该运行仍在 builtin 引擎上继续 —— 对于 NeMo 评判的运行，会跳过 Moonshot 自动路由。

### HITL / 终止开关角色（参考 + 证据）

`nemo-configs/hitl-killswitch/` 配置是一个自包含的 Colang 示例，演示审批闸门加终止开关。它由一个脚本化的"验证演示"（verify-demo）按需执行，产生结构化的对话记录，随后作为《欧盟人工智能法案》第 14 条的证据持久化。它并未接入任何受治理系统的实时请求路径 —— 它的存在是为了被演示并被采集为可审计的证据。

### 边车（docker compose）

- 内部 compose 服务 **`nemo`**，由 `docker/nemo/Dockerfile` 构建（在 `python:3.12-slim` 上 pip 安装 `nemoguardrails[server]`，以 `--default-config-id aigp_judge` 在 **9000** 端口运行 `nemoguardrails server`）。
- **不发布任何主机端口。** 它通过 compose 网络以 `nemo:9000` 被 `web` 与 `worker` 访问。挂载 `./nemo-configs:/config:ro`。
- **默认开启。** `web` 与 `worker` 均把 `AIGP_NEMO_URL` 默认设为 `http://nemo:9000`，因此评判器开箱即用。如需禁用，请在 `.env` 中设置 `AIGP_NEMO_URL=`（留空）。
- **LLM 后端。** 内置的 `aigp_judge` 与 `hitl-killswitch` 配置的 rails 使用 `openai`/`gpt-4o-mini`，因此 `nemo` 服务的环境中需要 `OPENAI_API_KEY` 才能真正完成评判。若缺少密钥，AIGP 仍会将该集成视为已启用，但调用会安全降级——评判器返回 `judgment: "error"`（运行绝不会被静默判为通过），而 verify-demo 的 rails 会报错。请为 `nemo` 服务提供 `OPENAI_API_KEY`、将配置指向其他引擎，或设置 `AIGP_NEMO_URL=` 使其保持禁用。

## 环境变量

| 变量                   | 默认值             | 说明                                                                                                                  |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `AIGP_NEMO_URL`        | `http://nemo:9000` | NeMo 边车的基础 URL。其**存在与否**决定集成是否启用（`isNemoEnabled()` 当且仅当此项已设置时返回 true）。留空 = 禁用。 |
| `AIGP_NEMO_API_KEY`    | （空）             | 可选的 bearer 令牌。设置后以 `Authorization: Bearer <key>` 发送。                                                     |
| `AIGP_NEMO_CONFIG_ID`  | `aigp_judge`       | 用作评判器的 NeMo 配置 id（即 `nemo-configs/aigp_judge/` 配置）。                                                     |
| `AIGP_NEMO_TIMEOUT_MS` | `60000`            | 请求超时（毫秒）。                                                                                                    |

## 在一次运行中使用 NeMo 评判器

在红队运行表单（`RunWizard`）中，有一个**"评判器（Judge）"**选择器，提供：

- **Built-in checkers（内置检查器）**（默认）—— 现有的离线检查器。
- **NeMo Guardrails** —— 通过边车进行评判。

该选择以 `judge: "builtin" | "nemo"` 发送给 `POST /api/redteam/runs`，并持久化到 `Evaluation.judge`。

- 当 `judge = "nemo"` 时，每个 `(prompt, response)` 对通过 `judgeWithNemo` 评判，而非 builtin 检查器。
- 若 `judge = "nemo"` 但边车**未**配置，该运行会**以 409 快速失败**，且 `Evaluation` 被标记为 failed。
- NeMo 评判的运行仍保留在 **builtin 引擎**上（跳过 Moonshot 自动路由）。Moonshot 引擎与 NeMo 评判器互斥。

## HITL / 终止开关参考配置与验证演示

参考配置位于 `nemo-configs/hitl-killswitch/`：

```
nemo-configs/hitl-killswitch/
  config.yml
  rails/kill-switch.co
  rails/approval-gate.co
  README.md            — 第 14(4)(d)/(e) 条映射
```

关于《欧盟人工智能法案》第 14 条的映射，请参阅该目录下的 `README.md`。

`runHitlDemo`（`src/lib/redteam/nemo/hitl-demo.ts`）驱动该配置经历两个脚本化的回合：

1. 一次**高风险操作**请求 → 被闸门拦截 / 未执行（审批闸门）。
2. 一次**停止**请求 → 被中止（终止开关）。

它返回一份结构化的对话记录：

```ts
HitlDemoResult {
  approvalGate: { passed, detail };
  killSwitch:  { passed, detail };
  transcript:  HitlTurn[];
  ranAt:       string;
}
```

该演示通过 tRPC 变更（mutation）**`redteam.nemoHitl.run`** 触发（输入 `{ obligationCode: string }`，默认 `"ART-14"`）。它要求具备 `redteam.write` 权限，**并且**边车已配置 —— 否则返回 `PRECONDITION_FAILED`。

## 第 14 条证据流

`redteam.nemoHitl.run` 变更会将演示结果持久化为一条 `NemoGuardrailEvidence` 记录，并写入一条审计条目 `redteam.nemo.hitl_demo`。

`NemoGuardrailEvidence`（Prisma）字段：

```
orgId, obligationCode, configRef,
approvalGatePassed, killSwitchPassed,
transcript (JSON), capturedAt, createdBy
```

《欧盟人工智能法案》合规报告的 `eu_obligation` 控制项（第 14 条及其他已映射条款）会将这些记录作为**附加证据项**呈现，类型为 `nemo_guardrail`。这**仅用于可追溯性** —— 该证据**不会**改变所推导出的控制状态。证据的 `ref` 形如：

```
nemo-configs/hitl-killswitch (approval gate: pass, kill switch: pass)
```

## API 契约

NeMo 的 HTTP 契约是内置的 **NeMo Guardrails 0.22.0** OpenAI 兼容端点 `POST /v1/chat/completions`。该契约已针对真实边车进行实时验证，并完整记录在以下文档中 —— 包括请求/响应信封、`guardrails` 扩展以及护栏触发日志：

➡️ **`docs/nemo-real-api-contract.md`**

请参阅该文档以获取确切的信封细节，而非依赖此处的概述。

## 文件索引

```
docker/nemo/Dockerfile                  — 边车镜像（nemoguardrails[server]，服务运行于 :9000）
nemo-configs/aigp_judge/                — 评判器配置（config.yml）
nemo-configs/hitl-killswitch/           — HITL/终止开关参考配置 + 第 14 条 README
src/lib/redteam/nemo/config.ts          — isNemoEnabled() + getNemoConfig()（环境变量处理）
src/lib/redteam/nemo/client.ts          — 评判器适配器（judgeWithNemo）—— 0.22.0 契约
src/lib/redteam/nemo/hitl-demo.ts       — runHitlDemo() 脚本化两回合演示
src/lib/redteam/nemo/evidence.ts        — NemoGuardrailEvidence 持久化辅助函数
src/lib/redteam/router.ts               — nemoHitl.run tRPC 变更
src/lib/reports/aggregator.ts           — eu_obligation 控制项呈现 nemo_guardrail 证据
src/components/redteam/RunWizard.tsx     — 评判器选择器（builtin | nemo）
src/app/api/redteam/runs/route.ts        — judge 持久化 + 引擎路由（nemo 时强制 builtin）
src/app/api/redteam/runs/[id]/stream/route.ts — SSE 运行器；路由至 NeMo 评判器 + 边车未配置时 409 快速失败
docker-compose.yml                       — nemo 边车服务 + AIGP_NEMO_URL 默认值
docs/nemo-real-api-contract.md           — 已验证的实时 HTTP 契约（0.22.0）
```
