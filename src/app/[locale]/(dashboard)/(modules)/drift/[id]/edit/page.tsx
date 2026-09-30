"use client";
import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import { DriftBenchmarkForm } from "@/components/drift/DriftBenchmarkForm";

export default function DriftEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: benchmark, isLoading } = trpc.drift.byId.useQuery({ id });
  if (isLoading || !benchmark) return <div>Loading…</div>;
  return <DriftBenchmarkForm mode="edit" benchmark={benchmark} />;
}
