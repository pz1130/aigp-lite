/**
 * Tiny SSE-capable mock for OpenAI-compatible /chat/completions.
 *
 * Replaces Prism (which can only serve a fixed YAML example and does not
 * stream). The redteam runner and runtime LLM route both consume real SSE
 * frames via eventsource-parser; using this mock means tests can exercise
 * the streaming path end-to-end instead of polling the DB.
 *
 * Endpoints:
 *   GET  /models             → JSON catalog
 *   POST /chat/completions   → text/event-stream chunks then [DONE]
 *   GET  /health             → 200 ok
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_OPENAI_PORT ?? 4010);

const REFUSAL_REPLY =
  "I'm sorry, but I cannot help with that request. Please ask something else.";

const INVENTORY_REPLY = JSON.stringify({
  domain: "other",
  containsPii: false,
  dataSensitivity: "low",
  automatedDecisionMaking: false,
  euAiActCategory: "minimal",
  complianceTags: [],
  suggestedRisks: [],
  summary: "Deterministic mock classification for the inventory E2E suite.",
  confidence: 0.9,
  riskScoreInt: 10,
});

interface ChatRequest {
  messages?: Array<{ content?: unknown }>;
}

async function readChatRequest(
  req: AsyncIterable<Uint8Array>,
): Promise<ChatRequest> {
  let body = "";
  for await (const chunk of req) body += Buffer.from(chunk).toString("utf8");
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return {};
    const messages = (parsed as { messages?: unknown }).messages;
    return Array.isArray(messages)
      ? { messages: messages as ChatRequest["messages"] }
      : {};
  } catch {
    return {};
  }
}

function isInventoryAnalysis(request: ChatRequest): boolean {
  return (
    request.messages?.some(
      (message) =>
        typeof message?.content === "string" &&
        message.content.includes("AI governance analyst"),
    ) ?? false
  );
}

function streamChunks(reply: string): string[] {
  // Split into 4-character pieces so consumers see a real stream rather
  // than one large blob — exercises the eventsource-parser path.
  const chunks: string[] = [];
  for (let i = 0; i < reply.length; i += 4) chunks.push(reply.slice(i, i + 4));
  return chunks;
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && (url === "/health" || url === "/")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && url === "/models") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    return;
  }

  if (req.method === "POST" && url.startsWith("/chat/completions")) {
    const request = await readChatRequest(req);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    });
    // Inventory analysis needs schema-valid JSON so the async classification
    // path can complete. Other callers (playground/redteam) keep the refusal
    // response used by their safety assertions.
    const reply = isInventoryAnalysis(request)
      ? INVENTORY_REPLY
      : REFUSAL_REPLY;
    const pieces = streamChunks(reply);
    for (const piece of pieces) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
      );
    }
    res.write(
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 8, completion_tokens: pieces.length },
      })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // Serve embedding requests deterministically so dedup tests can control
  // cosine similarity.  Input containing "Auth bypass" → vector [1,0,0];
  // everything else → [0,1,0].  This gives similarity=1.0 between "Auth
  // bypass" incidents, far above the default 0.85 threshold.
  if (req.method === "POST" && url.startsWith("/v1/embeddings")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || "{}") as { input?: string | string[] };
    const text = Array.isArray(parsed.input)
      ? parsed.input.join(" ")
      : (parsed.input ?? "");
    const vec: number[] = String(text).includes("Auth bypass")
      ? [1, 0, 0]
      : [0, 1, 0];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: [{ embedding: vec, index: 0 }],
        usage: { prompt_tokens: 5 },
        model: "text-embedding-3-small",
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ error: "not_found", path: url, method: req.method }),
  );
});

server.listen(PORT, () => {
  console.log(`[mock-openai] listening on http://localhost:${PORT}`);
});
