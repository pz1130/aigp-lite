"use client";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
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
import {
  dataSourceNodeStyle,
  usecaseNodeStyle,
  edgeLabelStyle,
  edgeStrokeStyle,
} from "@/lib/data-lineage/graph-theme";

export default function LineageGraphPage() {
  const t = useTranslations("dataLineage");
  const {
    data: sources,
    isLoading,
    error,
    refetch,
  } = trpc.dataLineage.list.useQuery();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!sources) return;

    const dsNodes: Node[] = sources.map((ds, i) => ({
      id: ds.id,
      data: { label: `${ds.name}\n(${ds.sensitivity})` },
      position: { x: 50 + i * 220, y: 100 },
      style: dataSourceNodeStyle,
    }));

    const usecases = new Map<string, string>();
    for (const ds of sources) {
      for (const link of ds.links) {
        usecases.set(link.usecaseId, link.usecase.name);
      }
    }
    const usecaseNodes: Node[] = Array.from(usecases).map(
      ([usecaseId, name], i) => ({
        id: usecaseId,
        data: { label: name },
        position: { x: 50 + i * 180, y: 280 },
        style: usecaseNodeStyle,
      }),
    );

    const edgeList: Edge[] = sources.flatMap((ds) =>
      ds.links.map((link) => ({
        id: `e-${ds.id}-${link.usecaseId}`,
        source: ds.id,
        target: link.usecaseId,
        label: link.direction,
        type: "smoothstep",
        labelStyle: edgeLabelStyle,
        style: edgeStrokeStyle,
      })),
    );

    setNodes([...dsNodes, ...usecaseNodes]);
    setEdges(edgeList);
  }, [sources]);

  if (isLoading) return <LoadingState />;
  if (error)
    return (
      <ErrorState
        title="Failed to load"
        description={error.message}
        onRetry={refetch}
      />
    );
  if (!sources) return null;

  return (
    <>
      <PageHeader
        title={t("lineageGraph")}
        description={t("lineageGraphDescription")}
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
        style={{ height: 520 }}
      >
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div className="text-xs text-tertiary flex gap-6">
        <span>Blue = Data Source</span>
        <span>Green = Usecase</span>
        <span>Arrow direction = Data flow direction</span>
      </div>
    </>
  );
}
