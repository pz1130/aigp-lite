import dgram from "node:dgram";
import net from "node:net";
import { safeFetch, assertSafeHost } from "@/lib/egress/guard";

export interface AuditPayload {
  ts: string;
  orgId: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

interface WebhookSink {
  type: "webhook";
  id: string;
  url: string;
  token?: string | null;
}

interface SyslogSink {
  type: "syslog";
  id: string;
  host: string;
  port: number;
  protocol: string;
}

interface DatadogSink {
  type: "datadog";
  id: string;
  url?: string;
  apiKey?: string | null;
}

type Sink = WebhookSink | SyslogSink | DatadogSink;

export interface AuditSinkRecord {
  type: string;
  id: string;
  url?: string | null;
  token?: string | null;
  apiKey?: string | null;
  host?: string | null;
  port?: number | null;
  protocol?: string | null;
}

/** Convert a persisted sink row into the stricter forwarding shape. */
export function toForwardSink(record: AuditSinkRecord): Sink | null {
  if (record.type === "webhook" && record.url) {
    return {
      type: "webhook",
      id: record.id,
      url: record.url,
      token: record.token,
    };
  }
  if (
    record.type === "syslog" &&
    record.host &&
    typeof record.port === "number" &&
    (record.protocol === "udp" ||
      record.protocol === "tcp" ||
      record.protocol == null)
  ) {
    return {
      type: "syslog",
      id: record.id,
      host: record.host,
      port: record.port,
      protocol: record.protocol ?? "udp",
    };
  }
  if (record.type === "datadog") {
    return {
      type: "datadog",
      id: record.id,
      url: record.url ?? undefined,
      apiKey: record.apiKey,
    };
  }
  return null;
}

/**
 * Forward audit event to a configured sink.
 */
export async function forwardToSink(
  sink: Sink,
  payload: AuditPayload,
): Promise<void> {
  if (sink.type === "webhook") {
    await forwardToWebhook(sink, payload);
  } else if (sink.type === "syslog") {
    await forwardToSyslog(sink, payload);
  } else if (sink.type === "datadog") {
    await forwardToDatadog(sink, payload);
  }
}

/**
 * POST to webhook endpoint (Splunk HEC compatible).
 */
async function forwardToWebhook(
  sink: WebhookSink,
  payload: AuditPayload,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sink.token) {
    headers["Authorization"] = `Splunk ${sink.token}`;
  }

  const body = JSON.stringify({
    time: new Date(payload.ts).getTime() / 1000,
    source: "aigp-lite",
    sourcetype: "audit",
    event: payload,
  });

  const res = await safeFetch(sink.url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Send RFC 5424 syslog message.
 */
async function forwardToSyslog(
  sink: SyslogSink,
  payload: AuditPayload,
): Promise<void> {
  await assertSafeHost(sink.host);

  const pri = 134; // facility=16 (local0), severity=6 (info)
  const version = 1;
  const timestamp = new Date(payload.ts).toISOString();
  const hostname = "aigp-lite";
  const appName = "audit";
  const procId = "-";
  const msgId = payload.action;
  const structuredData = "-";
  const msg = JSON.stringify(payload);

  const syslogMsg = `<${pri}>${version} ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${msg}`;

  if (sink.protocol === "tcp") {
    await sendTcp(sink.host, sink.port, syslogMsg);
  } else {
    await sendUdp(sink.host, sink.port, syslogMsg);
  }
}

/**
 * POST to Datadog Logs API (HEC-compatible format).
 */
async function forwardToDatadog(
  sink: DatadogSink,
  payload: AuditPayload,
): Promise<void> {
  const url = sink.url || "https://http-intake.logs.datadoghq.com/api/v2/logs";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sink.apiKey) {
    headers["DD-API-KEY"] = sink.apiKey;
  }

  const body = JSON.stringify({
    ddsource: "aigp-lite",
    ddtags: "audit,aigp-lite",
    hostname: "aigp-lite",
    service: "audit",
    message: payload,
  });

  const res = await safeFetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Datadog delivery failed: ${res.status} ${res.statusText}`);
  }
}

function sendUdp(host: string, port: number, msg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket("udp4");
    const buf = Buffer.from(msg, "utf8");
    client.send(buf, 0, buf.length, port, host, (err) => {
      client.close();
      if (err) reject(err);
      else resolve();
    });
    setTimeout(() => {
      client.close();
      reject(new Error("UDP send timeout"));
    }, 5000);
  });
}

function sendTcp(host: string, port: number, msg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(msg + "\n", () => {
        socket.end();
        resolve();
      });
    });
    socket.on("error", reject);
    setTimeout(() => {
      socket.destroy();
      reject(new Error("TCP connect timeout"));
    }, 5000);
  });
}
