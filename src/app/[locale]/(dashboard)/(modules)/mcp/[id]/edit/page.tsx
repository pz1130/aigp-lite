"use client";
import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import { McpServerForm } from "@/components/mcp/McpServerForm";

export default function McpEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: server, isLoading } = trpc.mcp.byId.useQuery({ id });
  if (isLoading || !server) return <div>Loading…</div>;
  return <McpServerForm mode="edit" server={server} />;
}
