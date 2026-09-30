"use client";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import { PageHeader } from "@/components/page";
import { LoadingState } from "@/components/page/LoadingState";
import { ErrorState } from "@/components/page/ErrorState";
import { useTranslations } from "next-intl";
import { use } from "react";
import {
  dataSourceNodeStyleDetail,
  usecaseNodeStyleDetail,
  edgeLabelStyleDetail,
  edgeStrokeStyle,
} from "@/lib/data-lineage/graph-theme";

export default function DataLineageGraph({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("dataLineage");
  const {
    data: ds,
    isLoading,
    error,
    refetch,
  } = trpc.dataLineage.byId.useQuery({ id });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!ds) return;

    const dataSourceNode: Node = {
      id: ds.id,
      data: { label: `${ds.name}\n(${ds.sensitivity})` },
      position: { x: 100, y: 200 },
      style: dataSourceNodeStyleDetail,
    };

    const usecaseNodes: Node[] =
      ds.links?.map((link, i) => ({
        id: link.usecase.id,
        data: { label: `${link.usecase.name}\n(${link.direction})` },
        position: { x: 400 + i * 50, y: 80 + i * 80 },
        style: usecaseNodeStyleDetail,
      })) ?? [];

    const edgeList: Edge[] =
      ds.links?.map((link) => ({
        id: `e-${link.usecaseId}-${link.dataSourceId}-${link.direction}`,
        source: ds.id,
        target: link.usecase.id,
        label: link.direction,
        type: "smoothstep",
        labelStyle: edgeLabelStyleDetail,
        style: edgeStrokeStyle,
      })) ?? [];

    setNodes([dataSourceNode, ...usecaseNodes]);
    setEdges(edgeList);
  }, [ds]);

  if (isLoading) return <LoadingState />;
  if (error)
    return (
      <ErrorState
        title="Failed to load"
        description={error.message}
        onRetry={refetch}
      />
    );
  if (!ds) return null;

  return (
    <>
      <PageHeader
        title={t("lineageGraph")}
        description={`${ds.name} — ${ds.links?.length ?? 0} linked usecases`}
        breadcrumb={
          <Link
            href="/data-lineage"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <div
        className="rounded-xl border border-border-default"
        style={{ height: 450 }}
      >
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div className="text-xs text-tertiary flex gap-6">
        <span>Blue = Data Source</span>
        <span>Light blue = Usecase</span>
        <span>Arrow direction = Data flow direction</span>
      </div>
    </>
  );
}
