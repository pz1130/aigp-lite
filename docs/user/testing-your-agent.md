# Testing & Governing Your Own AI Agent

This platform can red-team and govern an AI agent **you built**. Testing it well
means looking at three different layers. Each maps to a module in the product.

## The three layers

### 1. Mouth — language behavior (live test)

What the agent _says_. Adversarial prompts go in, the text response is scored.
This is a black-box, single-turn test: jailbreak, toxicity, prompt injection, bias,
and PII leakage. It runs in the **Red-team** module (`/redteam`), powered by the
Moonshot engine.

It does **not** see which tools the agent called or what actions it took — only the
text it produced.

### 2. Hands — tool / action behavior (live observation)

What the agent _does_. Whether it invokes tools it should not (OWASP LLM08 —
Excessive Agency). A text scorer cannot see this; it needs tool-call observability.
The **MCP** module (`/mcp`) records every tool invocation (which tool, by whom, with
what outcome), so you can detect unauthorized or excessive tool use.

### 3. Compliance — governance (assessment)

Whether the agent is _accounted for_. Register it as a use-case in **Inventory**
(`/inventory`) and assess it against the framework catalogs (EU AI Act, NIST AI RMF,
ISO 42001, FINOS, and more) under **Risk** (`/risk`). This is an assessment, not a
live test.

## Prerequisites

| Layer      | Your agent must expose                                                             |
| ---------- | ---------------------------------------------------------------------------------- |
| Mouth      | An OpenAI-compatible HTTP API and an API key, registered as a Provider connection. |
| Hands      | Its tools through MCP (or otherwise instrumented so invocations are recorded).     |
| Compliance | Nothing technical — you describe the agent.                                        |

## Connecting your agent

1. **Connect the API (mouth entry point).** Go to **Providers**
   (`/integrations/providers`) → _New connection_. Choose the OpenAI-compatible
   type, paste your agent's base URL and API key. The platform pings it once;
   `ok` means it is reachable.
2. **Run a red-team (mouth).** Go to **Red-team** (`/redteam/runs/new`), pick the
   connection and model, choose attack categories (jailbreak, toxicity, prompt
   injection, bias, PII leakage), and start. Findings stream in live; any `fail`
   auto-creates an incident.
3. **Audit tool use (hands).** Register your agent's tool surface in **MCP**
   (`/mcp/new`). As the agent runs, the invocation log shows which tools were
   called — review it for calls the agent should not have made.
4. **Register & assess (compliance).** Add the agent as a use-case in **Inventory**
   (`/inventory/new`), then open **Risk** (`/risk`) to score it against the
   applicable framework controls.

## Boundaries & safety

- **Moonshot tests the mouth, not the hands.** It scores text responses only. Use
  the MCP invocation log to reason about tool misuse.
- **Test tool use against sandboxed or fake tools**, never live production tools — a
  red-team prompt that succeeds in making the agent call a tool should not be able
  to cause real-world side effects.
- **Compliance is an assessment, not a live test.** A passing assessment records that
  the agent is governed; it does not prove runtime safety on its own.

See also the [User Manual](./README.md).
