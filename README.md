# AIGP-Lite (Core Edition)

[![CI](https://github.com/pz1130/aigp-lite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pz1130/aigp-lite/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/pz1130/aigp-lite)](https://github.com/pz1130/aigp-lite/releases/latest)

A focused, lightweight AI governance workspace aligned with the EU AI Act, NIST AI RMF, and ISO/IEC 42001. It covers the essential closed loop needed to govern an AI use case from intake to go-live:

`inventory → risk & controls → evidence → approval → reports / Trust Center`

## Core Modules (8 Modules)

- **Organization & Members (`members`)** — Multi-tenant isolation, authentication, and 5-role RBAC (`admin`, `risk_officer`, `ai_owner`, `auditor`, `viewer`)
- **AI Inventory & Dossier (`inventory`)** — Use-case registry, lifecycle management, manual EU AI Act classification, readiness checks, next-step guidance (`NextActions`), and personal task dashboard (`MyTasks`)
- **Risk & Controls (`risk`)** — Risk assessments, built-in framework catalogs (EU AI Act, NIST AI RMF, ISO 42001, MITRE ATLAS, FINOS AIGF), control mapping, and FRIA for high-risk systems
- **Evidence Repository (`evidence`)** — Content-addressed SHA-256 evidence storage and verification
- **Approval Workflows (`workflow`)** — Multi-step approval routing and go-live decision records
- **Audit Log (`audit`)** — Tamper-evident hash-chained audit trail with CSV export
- **Governance Reports (`reports`)** — Executive PDF and XLSX compliance reports
- **Trust Center (`trust-center`)** — Public and NDA-gated external trust portal

> **Note:** Enterprise runtime capabilities (LLM runtime proxy/gateway, FinOps, automated red-teaming, drift monitoring, AI copilots, MCP server governance, SCIM, and specialized framework checklists) belong to the full **AIGP Enterprise** edition and are intentionally excluded from this lightweight distribution.

## Quickstart with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. The Compose stack contains only PostgreSQL, migrations, and the web application (no Redis or background worker required).

## Local Development

Requires Node.js 22 or newer.

```bash
docker compose up -d db
cp .env.example .env
# For host-side development, change @db:5432 to @localhost:5432 in .env.
npm ci
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

The development server runs at <http://localhost:3001>.

The seed creates a Demo Org and demo users. All demo users use the password `demo1234`; use `admin@demo.local` for the administrator account.

## Scripts

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `npm run dev`                 | Start the development server                 |
| `npm run build` / `npm start` | Build and serve the production app           |
| `npm test`                    | Run unit tests                               |
| `npm run e2e`                 | Run the core Playwright suite                |
| `npm run typecheck`           | Run TypeScript checks                        |
| `npm run lint`                | Run ESLint and formatting checks             |
| `npm run prisma:migrate`      | Build the merged schema and run migrations   |
| `npm run prisma:seed`         | Seed the demo organization and risk catalogs |
| `npm run prisma:studio`       | Open Prisma Studio                           |

## License

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for third-party catalog attributions.
