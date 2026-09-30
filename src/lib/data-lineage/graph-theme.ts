import type { CSSProperties } from "react";

/** Shared node/edge styles for ReactFlow lineage graphs. */

const nodeBase: CSSProperties = {
  borderRadius: 8,
  fontSize: 12,
};

export const dataSourceNodeStyle: CSSProperties = {
  ...nodeBase,
  background: "#eff6ff",
  border: "2px solid #3b82f6",
  padding: 12,
  minWidth: 150,
};

export const dataSourceNodeStyleDetail: CSSProperties = {
  ...nodeBase,
  background: "#fff",
  border: "2px solid #3b82f6",
  padding: 12,
  fontSize: 13,
  minWidth: 160,
};

export const usecaseNodeStyle: CSSProperties = {
  ...nodeBase,
  background: "#f0fdf4",
  border: "1px solid #86efac",
  padding: 10,
  minWidth: 130,
};

export const usecaseNodeStyleDetail: CSSProperties = {
  ...nodeBase,
  background: "#f0f9ff",
  border: "1px solid #93c5fd",
  padding: 10,
  minWidth: 140,
};

export const edgeLabelStyle: CSSProperties = { fontSize: 9, fill: "#6b7280" };
export const edgeLabelStyleDetail: CSSProperties = {
  fontSize: 10,
  fill: "#6b7280",
};
export const edgeStrokeStyle: CSSProperties = {
  stroke: "#9ca3af",
  strokeWidth: 1.5,
};
