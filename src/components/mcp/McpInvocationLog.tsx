"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

interface Invocation {
  id: string;
  toolName: string;
  outcome: string;
  consentGiven: boolean;
  createdAt: Date;
}

export function McpInvocationLog({
  invocations,
}: {
  invocations: Invocation[];
}) {
  const t = useTranslations("mcp.invocations");

  if (invocations.length === 0) {
    return <EmptyState icon="activity" title={t("empty")} />;
  }

  const outcomeVariant = (o: string) =>
    o === "success" ? "success" : o === "denied" ? "warn" : "danger";

  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <Tr>
            <Th>{t("timestamp")}</Th>
            <Th>{t("toolName")}</Th>
            <Th>{t("outcome")}</Th>
            <Th>{t("consent")}</Th>
          </Tr>
        </THead>
        <TBody>
          {invocations.map((inv) => (
            <Tr key={inv.id}>
              <Td className="text-secondary">
                {new Date(inv.createdAt).toLocaleString()}
              </Td>
              <Td className="font-medium">{inv.toolName}</Td>
              <Td>
                <Badge variant={outcomeVariant(inv.outcome)} size="sm">
                  {inv.outcome}
                </Badge>
              </Td>
              <Td>{inv.consentGiven ? "✓" : "✗"}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
