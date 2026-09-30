"use client";
import { useTranslations } from "next-intl";
import { McpRiskBadge } from "./McpRiskBadge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

interface Tool {
  id: string;
  name: string;
  description: string | null;
  riskTier: string;
}

export function McpToolTable({ tools }: { tools: Tool[] }) {
  const t = useTranslations("mcp.tools");

  if (tools.length === 0) {
    return <EmptyState icon="shield" title={t("empty")} />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <Tr>
            <Th>{t("name")}</Th>
            <Th>{t("description")}</Th>
            <Th>Risk</Th>
          </Tr>
        </THead>
        <TBody>
          {tools.map((tool) => (
            <Tr key={tool.id}>
              <Td className="font-medium">{tool.name}</Td>
              <Td className="text-secondary truncate max-w-xs">
                {tool.description ?? "—"}
              </Td>
              <Td>
                <McpRiskBadge tier={tool.riskTier} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
