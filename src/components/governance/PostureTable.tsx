"use client";

import Link from "next/link";
import type { PosturePayload } from "@/lib/governance/posture";

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function PostureTable({ data }: { data: PosturePayload }) {
  const sorted = [...data.usecases].sort(
    (a, b) => a.overallScore - b.overallScore,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 px-2">Usecase</th>
            <th className="py-2 px-2">Controls</th>
            <th className="py-2 px-2">Open Incidents</th>
            <th className="py-2 px-2">SLA Breaches</th>
            <th className="py-2 px-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.usecaseId} className="border-b hover:bg-muted/40">
              <td className="py-2 px-2">
                <Link className="underline" href={`/inventory/${u.usecaseId}`}>
                  {u.usecaseName}
                </Link>
              </td>
              <td
                className={`py-2 px-2 tabular-nums ${scoreColor(u.controlScore)}`}
              >
                {u.controlScore}
              </td>
              <td className="py-2 px-2 tabular-nums">{u.openIncidents}</td>
              <td className="py-2 px-2 tabular-nums">{u.slaBreaches}</td>
              <td
                className={`py-2 px-2 tabular-nums font-medium ${scoreColor(u.overallScore)}`}
              >
                {u.overallScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
