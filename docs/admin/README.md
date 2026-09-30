# AIGP-Lite 管理员手册

> 适用版本：v0.6.0 起

本手册面向 **系统管理员 / DevOps / 平台运维**，包含部署、配置、用户管理、
集成对接、日常维护、备份恢复、升级和故障排查。终端用户使用方法见
[用户手册](../user/README.md)。

---

## 目录

- [1. 环境要求](#1-环境要求)
- [2. 部署](#2-部署)
- [3. 环境变量](#3-环境变量)
- [4. 用户与组织](#4-用户与组织)
- [5. Provider 连接 与 API Key](#5-provider-连接-与-api-key)
- [6. 集成连接器（Slack / Teams / ServiceNow）](#6-集成连接器slack--teams--servicenow)
- [7. 数据迁移与种子](#7-数据迁移与种子)
- [8. 备份与恢复](#8-备份与恢复)
- [9. 升级](#9-升级)
- [10. 监控与日志](#10-监控与日志)
- [11. 多副本部署](#11-多副本部署)
- [12. 安全](#12-安全)
- [13. 故障排查](#13-故障排查)

---

## 1. 环境要求

### 最小化（POC / 内测）

- 操作系统：Linux / macOS（Docker Desktop 也行）
- Docker：24+，Docker Compose plugin v2+
- 端口：3000（web）、5432（Postgres，可不对外）
- 资源：2 vCPU / 4 GB RAM / 20 GB 磁盘

### 推荐（生产）

- Kubernetes 或托管容器服务（ECS / Fly.io / Cloud Run）
- 独立的托管 Postgres（RDS / Cloud SQL / Supabase）— **不要用容器里的 db 卷做生产数据**
- HTTPS + 反向代理（Nginx / Caddy / Cloud Load Balancer）
- 资源：每副本 1 vCPU / 1 GB RAM；DB 按业务量
- Object Storage（S3 兼容）替代本地 `aigp_storage` 卷 — 多副本部署应启用 S3-compatible 存储（见下方存储配置）

---

## 2. 部署

### 2.1 Docker Compose（推荐用于本地 / POC）

```bash
git clone https://github.com/pz1130/aigp-lite.git
cd aigp-lite

cp .env.example .env
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "AIGP_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

docker compose up --build -d
```

容器组：

- `aigovernance-db-1` — Postgres 17，挂 `aigp_pg` 卷
- `aigovernance-migrate-1` — 一次性容器，跑 `prisma migrate deploy` + `prisma:seed`，退出码 0 才允许 web 启动
- `aigovernance-web-1` — Next.js 应用，对外 3000 端口

```bash
# 查看启动状态
docker ps --filter "name=aigovernance-"

# 查看日志
docker compose logs -f web
docker compose logs migrate
```

### 2.2 仅 dockerize Postgres，本机跑 web（开发模式）

```bash
docker compose up -d db
cp .env.example .env
sed -i.bak 's|@db:5432|@localhost:5432|' .env && rm .env.bak
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "AIGP_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

npm install
npm run prisma:migrate -- --name init   # 首次
npm run prisma:seed                     # 首次
npm run dev
```

### 2.3 Kubernetes（生产参考）

仓库未带 Helm chart，自行包装时注意：

- Web 容器：`aigovernance-web:<tag>`，命令 `node server.js`，端口 3000，挂载 `EmptyDir` 给 `/app/storage` 或换 S3
- Init Container 跑 migrate stage 镜像，命令 `sh -c "npm run prisma:deploy && npm run prisma:seed"`
- ConfigMap：所有非敏感环境变量；Secret：`AIGP_ENCRYPTION_KEY` / `NEXTAUTH_SECRET` / `DATABASE_URL` 中的密码
- Probe：`/api/health`（如未实现可用 `/zh` GET，期望 200 / 307）
- HPA：CPU 70% 触发扩容，副本数请配合 §11 多副本注意事项

---

## 3. 环境变量

完整参考 `.env.example`。下面是按场景的最小集：

### 必须

| 变量                  | 说明                                         | 例子                                                |
| --------------------- | -------------------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`        | Postgres 连接串                              | `postgresql://aigp:aigp@db:5432/aigp?schema=public` |
| `NEXTAUTH_SECRET`     | NextAuth JWT 加密 secret，**32 字节 base64** | `openssl rand -base64 32` 产出                      |
| `NEXTAUTH_URL`        | 用户访问应用的入口 URL                       | `http://localhost:3000` 或 `https://aigp.acme.com`  |
| `AIGP_ENCRYPTION_KEY` | Provider 凭据加密主密钥，**32 字节 base64**  | 与 NEXTAUTH_SECRET 不同的随机串                     |

### 可选

| 变量                           | 默认               | 用途                                                                |
| ------------------------------ | ------------------ | ------------------------------------------------------------------- |
| `AIGP_ENCRYPTION_SEED`         | `aigp-dev-default` | dev 环境的退路；**生产必须把 `AIGP_ENCRYPTION_KEY` 设上，忽略此项** |
| `AIGP_ABORT_REDIS_REST_URL`    | —                  | 多副本下红队 abort 标志的共享存储（Upstash Redis REST）             |
| `AIGP_ABORT_REDIS_REST_TOKEN`  | —                  | 同上                                                                |
| `AIGP_ABORT_REDIS_TTL_SECONDS` | `3600`             | abort flag TTL                                                      |

### 关键约束

- **`AIGP_ENCRYPTION_KEY` 一旦换，所有 Provider 凭据 / 连接器 secret 全部解密失败**。轮换前必须先把所有连接的 `credentialsEncrypted` 重新加密（当前版本无内置脚本，参见 §13 故障排查）。
- **`NEXTAUTH_SECRET` 换会把所有已登录用户踢下线**，但不影响数据。
- **`.env` 文件不要进 Git**。仓库的 `.gitignore` 已经排除。

---

## 4. 用户与组织

### 4.1 模型

- **Organization** — 多租户最外层；所有业务表都通过 `orgId` 隔离（`withOrg(prisma, orgId)` Prisma 扩展强制 `where: { orgId }` 注入）
- **User** — 全局唯一邮箱，密码用 argon2id 哈希
- **Membership** — `User × Org × Role`，一个用户可以在多个组织有不同角色

种子默认创建 1 个 `Demo Org`，5 个用户每人 1 个 membership。

### 4.2 新建用户

**方法 A · UI 注册**（最简单）

1. 用户访问 `/zh/register`，自助注册
2. 默认 membership 加到第一个 Organization，角色 `viewer`
3. 管理员需要升级角色：见方法 C

**方法 B · 直接调用 tRPC**

```bash
# 通过有权限的 session cookie 调用 auth.register（参考浏览器 DevTools 抓包）
```

**方法 C · Prisma Studio（最直接）**

```bash
npm run prisma:studio   # 打开 http://localhost:5555
```

打开 `User` 表 → New record → 填 email + name + passwordHash（用 `npx tsx -e 'import("argon2").then(a => a.hash("yourpassword", { type: a.argon2id })).then(console.log)'` 算）→ 保存
然后 `Membership` 表 → New record → 选 user / org / role → 保存

### 4.3 修改角色

Prisma Studio → `Membership` 表 → 找到对应行 → 改 `role` 字段（`admin` / `risk_officer` / `ai_owner` / `auditor` / `viewer`）。

### 4.4 删除用户

**软删除**（推荐）：把该用户在所有组织的 Membership 删除，但保留 User 行。**审计日志、用例所有者关系不受影响**。

**硬删除**：会触发外键级联（Incident.openedBy / AiUsecase.owner 等会失败），需要先迁移这些关系或接受错误。建议永远不做硬删除。

### 4.5 新建组织

当前 UI 不提供组织自助创建。流程：

1. Prisma Studio → `Organization` → New record，填 `name` + `plan`
2. 把要加入的用户在 `Membership` 表里建一条新行

---

## 5. Provider 连接 与 API Key

### 5.1 创建 Provider 连接

**UI 路径**：`/integrations/providers` → **新建连接**

支持目录（13 种）：

- OpenAI / Anthropic / Azure OpenAI / Google Gemini
- DeepSeek / Qwen DashScope / Moonshot Kimi / Zhipu GLM
- MiniMax / Doubao Volcengine / Baidu Qianfan
- Ollama
- 自定义 OpenAI-compatible / Anthropic-compatible

填完表单点 **创建**，系统：

1. 用 AES-256-GCM 加密凭据存到 `provider_connection.credentialsEncrypted`
2. 异步 Ping 一次，结果写到 `lastValidationStatus` + `lastValidatedAt`
3. UI 列表显示状态（绿 `ok` / 红 `error` / 灰 `never`）

### 5.2 自定义 baseUrl（走代理 / 私有部署）

- 在新建表单里展开 **高级 / Advanced** → 填 baseUrl
- 仅 `openai_compatible` / `anthropic_compatible` 两种类型支持自定义 baseUrl
- 用于本地 Ollama（`http://localhost:11434/v1`）、走 CloudFlare AI Gateway、企业代理等场景

### 5.3 签发 API Key

**UI 路径**：`/integrations/providers` 页面右侧 **API Keys** → **新建 API Key**

- 选 label（自己看）
- 选 scopes：
  - `runtime.invoke` — 调用 `/api/runtime/llm`（必须）
  - `runtime.read` — 读取自家用例的调用记录
  - `runtime.admin` — 管理（一般不发给业务方）
- 创建后 **完整 Key 只显示一次**（`aigp_` 开头），必须当场复制
- 后续只能看到 `prefix`（前 8 位），完整 Key 不可恢复，丢了只能销毁重发

### 5.4 调用约束

业务方调 `POST /api/runtime/llm` 时：

```http
Authorization: Bearer aigp_<rest-of-key>
Content-Type:  application/json

{
  "connectionId": "<provider-connection-id>",
  "usecaseId":    "<usecase-id-the-key-org-owns>",
  "model":        "gpt-4o-mini",
  "messages":     [...]
}
```

- API Key 的 `orgId` 必须等于 connection 的 `orgId`，否则返回 404
- `usecaseId` 可选；如果传，系统按用例计算预算占用
- 响应是 `text/event-stream`，每行 `data: <json>` 是一个事件（chunk / done / blocked / error）

---

## 6. 集成连接器（Slack / Teams / ServiceNow）

### 6.1 入口

`/integrations/connectors` → **新建连接器** → 选择类型

### 6.2 Slack

1. 在 Slack 创建 Incoming Webhook（Workspace settings → Apps → Custom Integrations）
2. 复制 Webhook URL
3. AIGP 里填：name + Webhook URL，选订阅事件（`incident.*` / `budget.*` / `usecase.*`）

### 6.3 Microsoft Teams

1. 频道 → ⋯ → Connectors → Incoming Webhook → Create
2. 复制 Webhook URL
3. AIGP 里填同 Slack

### 6.4 ServiceNow（双向同步）

详细步骤见仓库 README 的 **Setting up ServiceNow bidirectional sync** 一节。
核心：

- 在 ServiceNow incident 表加 `u_aigp_incident_id` 字符串字段（一次性）
- AIGP 出站：事件创建 / 状态变更 → POST ServiceNow REST API
- AIGP 入站：ServiceNow Business Rule → POST `/api/integrations/servicenow/inbound/<integration-id>`，请求头带 `X-Webhook-Secret: <secret>`
- 防止回环：每条 payload 算 hash，相同 hash 60s 内不再处理（写 `skipped_echo` 到同步日志）

### 6.5 自定义 Webhook 端点

`/integrations` → **新建 Webhook 端点**：用于把 AIGP 内部事件转发到任意 HTTP 接收方（你自己的事件总线、ELK、自动化平台等）。

- 创建时生成一个 secret
- AIGP 出站请求带 `X-AIGP-Signature: sha256=<hmac>`
- 接收方算同样的 HMAC-SHA256（key = secret，body = 原始请求体）应当一致

---

## 7. 数据迁移与种子

### 7.1 模块化 schema 构建

Prisma schema 拆成多个 `prisma/modules/*.prisma`，构建脚本（`prisma/build-schema.mjs`）拼成最终的 `prisma/schema.prisma`。

```bash
npm run prisma:generate   # build-schema + prisma generate
npm run prisma:migrate    # build-schema + prisma migrate dev（开发用）
npm run prisma:deploy     # build-schema + prisma migrate deploy（生产用）
```

新增模型：写到对应 `prisma/modules/<module>.prisma` → 跑 `prisma:migrate` 自动生成迁移文件。

### 7.2 种子数据

`npm run prisma:seed` 跑 `prisma/seed.ts`。**幂等**：

- Demo Org 存在就跳过
- 框架、Provider Connection、API Key、demo 用例、demo 事件都用 `findFirst` 判存在

**生产部署后**：建议先清掉种子（Prisma Studio 删 Demo Org + 5 个 demo 用户），再让真实管理员注册。

---

## 8. 备份与恢复

### 8.1 数据库

```bash
# 备份
docker exec aigovernance-db-1 pg_dump -U aigp aigp | gzip > backup-$(date +%F).sql.gz

# 恢复
gunzip -c backup-2026-05-19.sql.gz | docker exec -i aigovernance-db-1 psql -U aigp aigp
```

**注意**：恢复前确保 `AIGP_ENCRYPTION_KEY` 仍是当时备份的那把，否则所有加密凭据无法解开。建议把这把密钥和备份一起放在受控的 KMS / Vault 里。

### 8.2 证据存储

```bash
docker run --rm -v aigovernance_aigp_storage:/data -v $PWD:/backup alpine \
  tar czf /backup/storage-$(date +%F).tar.gz -C /data .
```

### 8.3 完整恢复流程（新机器）

```bash
git clone https://github.com/pz1130/aigp-lite.git
cd aigp-lite
cp .env.example .env
# 把保管的 NEXTAUTH_SECRET / AIGP_ENCRYPTION_KEY 写进 .env
docker compose up -d db
# 等 db healthy
gunzip -c backup.sql.gz | docker exec -i aigovernance-db-1 psql -U aigp aigp
# 恢复 storage 卷
docker run --rm -v aigovernance_aigp_storage:/data -v $PWD:/backup alpine \
  tar xzf /backup/storage.tar.gz -C /data
docker compose up -d web
```

---

## 9. 升级

### 9.1 拉新代码 + 重 build

```bash
git pull
docker compose build web
docker compose up -d migrate   # migrate 会自动跑新 schema
docker compose up -d web
```

`migrate` 容器退出码 0 才表示数据库迁移成功。如果失败：

- 看 `docker compose logs migrate`
- 常见原因：schema 与现有数据不兼容（如新增 `NOT NULL` 字段无默认值）— 需要写一个手动迁移先回填数据

### 9.2 回滚

数据库迁移不可自动回滚。回滚策略：

1. 部署前先 backup（§8.1）
2. 出问题时：停 web、还原 DB、checkout 旧 commit、re-build

---

## 10. 监控与日志

### 10.1 应用日志

容器日志：

```bash
docker compose logs -f web
docker compose logs -f db
```

应用用 [`pino`](https://github.com/pinojs/pino) 输出结构化 JSON：

- `event: "llm_invocation"` — 每次 LLM 调用
- `event: "llm_invocation_save_failed"` — DB 写入失败（不阻断响应）
- `event: "policy_evaluation"` — 策略命中
- `event: "redteam_finding"` — 红队 finding

接到 ELK / Loki / Datadog 直接转发标准输出即可。

### 10.2 关键业务指标

当前版本没有内置 Prometheus 端点。建议接入方式：

- 在反向代理（Nginx / Caddy）层抓 HTTP 状态码 + 延迟
- 在 Postgres 用 `pg_stat_statements` 看慢查询
- 直接对 `audit_log` 表做查询，按 `action` 聚合（如 `redteam.run.start` 每天多少次）

### 10.3 健康检查

- DB：`docker compose ps` 看 healthcheck 状态
- Web：`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/zh` 应返回 200
- 存活：`GET /api/health` 只确认 Web 进程可响应，适合 liveness probe
- 就绪：`GET /api/ready` 检查 Postgres，并在配置 `REDIS_URL` 时检查 Redis；未就绪返回 503
- Mock LLM（如果跑了）：`curl http://localhost:4010/health` 应返回 `ok`

---

## 11. 多副本部署

当前版本支持有限的水平扩展。注意点：

### 11.1 数据库

共享同一个 Postgres，没问题。

### 11.2 文件存储

`/app/storage` 当前是本地卷。单实例可以继续使用；多副本建议配置 S3-compatible：

- S3 / 兼容对象存储（应用通过 `AIGP_STORAGE_DRIVER=s3` 使用） OR
- 共享文件系统（EFS / Filestore，性能要求高）

S3 配置示例：

```env
AIGP_STORAGE_DRIVER=s3
AIGP_S3_BUCKET=aigp-evidence
AIGP_S3_REGION=us-east-1
AIGP_S3_PREFIX=evidence
# MinIO / other S3-compatible providers:
# AIGP_S3_ENDPOINT=https://minio.example.com
# AIGP_S3_FORCE_PATH_STYLE=true
```

上传记录仍保存对象 key 和 SHA-256；下载会重新计算并校验哈希。

### 11.3 红队 abort 标志

默认是 Node 进程内 Map。多副本场景下用户在副本 A 发起 run，在副本 B 点 abort，B 无法通知 A。

解决：配置 Upstash Redis REST：

```env
AIGP_ABORT_REDIS_REST_URL=https://<your>.upstash.io
AIGP_ABORT_REDIS_REST_TOKEN=<token>
```

应用会自动用 Redis 共享 abort flag。

### 11.4 Webhook 出站

任意副本都可以出，没问题（每个 webhook 端点的 secret 是数据库里读的）。

### 11.5 NextAuth session

JWT 模式，stateless，多副本无需共享 session 存储。

---

## 12. 安全

### 12.1 网络

- 生产必须前置 HTTPS（反代终端，不在 Node 起 TLS）
- 数据库端口不要对外
- Mock LLM 服务器仅用于测试，**不要部署到生产**

### 12.2 凭据

- `.env` 不要进 Git
- 用 KMS / Vault / Secret Manager 注入 `AIGP_ENCRYPTION_KEY` 和 `NEXTAUTH_SECRET`
- API Key 完整值只显示一次，丢了销毁重发，不要尝试反向恢复

### 12.3 内容安全策略

所有路由由中间件注入 nonce-based CSP，禁止外部脚本。前端如果要接 GA / Hotjar 等三方，需要修改 `src/proxy.ts` 的 CSP 头。

### 12.4 RBAC

服务端在每个 tRPC procedure 强制校验权限。**永远不要把 RBAC 检查放到客户端**。

### 12.5 审计

所有 mutation 自动写 `audit_log`，敏感字段 scrub。生产保留期建议 ≥ 180 天，按合规要求调整。

### 12.6 速率限制

公开 Trust Center 和 external-report 接口支持 Redis-backed 应用层限流；认证和
runtime LLM 仍建议在反代层（Nginx limit_req / Cloudflare）做：

- `/api/auth/*`：每 IP 10 次 / 分钟
- `/api/runtime/llm`：按 API Key 维度，通过预算控制

配置 `REDIS_URL` 后，公开接口的限流状态会在多个 web 副本之间共享；未配置时
退回进程内限流，适合本地开发和单实例部署。生产环境如果已配置 Redis 但 Redis
暂时不可用，公开接口会 fail-closed 返回受限响应，避免多副本限流被绕过；恢复
Redis 后自动恢复服务。

---

## 13. 故障排查

### 13.1 web 容器一直 restart

看日志：

```bash
docker compose logs --tail=100 web
```

常见原因：

- **`AIGP_ENCRYPTION_KEY` 未设** — Production 模式下应用会拒绝启动
- **`DATABASE_URL` 不通** — 看 db 容器 healthcheck，看网络
- **Prisma client 没生成** — migrate 容器没成功跑完，应用启动前必须先 migrate

### 13.2 登录后看到「您没有权限」/ 跳回 login

- 检查浏览器有没有 `authjs.session-token` cookie
- 重启浏览器（清掉 cookie）再试
- 看 web 日志有没有 `UNAUTHENTICATED` 错误

### 13.3 Provider Ping 报 `error`

- API Key 错 / 过期 / 无 quota
- baseUrl 错（漏 https，多了尾部 `/`）
- Provider 地区受限（部分模型不在中国大陆 IP 可用）→ 走代理或换模型

### 13.4 LLM 调用 422 / 阻断

策略命中。检查响应体的 `hit.policyName`，去 `/policy` 看规则，必要时把策略改成 `audit_only`。

### 13.5 LLM 调用 429

预算超额。`X-Budget-Exceeded` 头指明 scope。

- 立即放行：`/finops/budgets` 找到对应预算，调高 amountUsd
- 等周期重置：响应头 `Retry-After` 给出秒数

### 13.6 Prisma 报 FK 约束错

通常发生在测试 / Prisma Studio 手动删数据时。删用户前先删 `Incident.openedBy` / `AiUsecase.owner` 关联行，或者用 `TRUNCATE ... CASCADE`：

```bash
docker exec aigovernance-db-1 psql -U aigp -d aigp -c \
  'TRUNCATE incident, ai_usecase, "user" CASCADE'
```

### 13.7 加密凭据轮换（AIGP_ENCRYPTION_KEY）

内置脚本 `pnpm crypto:rotate-key` 会在数据库内原地重加密全部 4 个加密列
（`audit_sink.secretsEncrypted`、`provider_connection.credentialsEncrypted`、
`enterprise_integration.credentialsEncrypted`、`sso_connection.clientSecretEncrypted`）。
脚本幂等：已用新 key 加密的行报 `already`，可安全重跑 / 中断后续跑。

流程（离线操作，需要短暂停机）：

1. 停止应用和 worker
2. `openssl rand -base64 32` 生成新 key
3. `.env`：把当前 `AIGP_ENCRYPTION_KEY` 的值挪到 `AIGP_ENCRYPTION_KEY_OLD`，
   `AIGP_ENCRYPTION_KEY` 设为新值
4. `pnpm crypto:rotate-key --dry-run` — 核对各表 rotated/already/failed 计数，期望 failed=0
5. `pnpm crypto:rotate-key` — 原地重加密
6. 从 `.env` 删除 `AIGP_ENCRYPTION_KEY_OLD`
7. 重启应用，验证 provider 连接 / SSO / audit sink 仍可解密

两把 key 都解不开的行会被报为 `failed`（打印表名 + 行 id），脚本继续处理其余行，
最后以退出码 1 结束，由运维决定如何处置这些行（通常是在 UI 里重新录入该凭据）。

### 13.8 还原一个被错删的用例

如果是软删（lifecycle = `retired`）— 直接 Prisma Studio 改回原值。
如果是硬删（DELETE FROM ai_usecase ...）— 只能从最近备份恢复。

---

## 14. 卸载

```bash
docker compose down --volumes  # 删 db / storage 卷，数据全没
docker rmi aigovernance-web    # 删镜像
git clean -fdx                 # 清仓库工作区
```

---

## 相关文档

- [用户手册](../user/README.md)
- [仓库 README](../../README.md)
- 版本历史：[`CHANGELOG.md`](../../CHANGELOG.md)
