"use client";

import type { PosturePayload } from "@/lib/governance/posture";

const WEIGHT_PCT: Record<string, number> = {
  controls: 40,
  incidents: 25,
  drift: 20,
  budget: 15,
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function DimensionTile({ dim }: { dim: PostureDimension }) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{dim.label}</span>
        <span className="text-xs text-muted-foreground">
          {WEIGHT_PCT[dim.key]}%
        </span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${scoreColor(dim.score)}`}>
        {dim.score}
      </p>
    </div>
  );
}

type PostureDimension = PosturePayload["dimensions"][number];

export function PostureSummary({ data }: { data: PosturePayload }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p
            className={`text-4xl font-bold tabular-nums ${scoreColor(data.score)}`}
          >
            {data.score}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Overall posture</p>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {data.dimensions.map((d) => (
            <div key={d.key}>
              {d.label}: {d.score} × {WEIGHT_PCT[d.key]}%
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.dimensions.map((dim) => (
          <DimensionTile key={dim.key} dim={dim} />
        ))}
      </div>
    </div>
  );
}
