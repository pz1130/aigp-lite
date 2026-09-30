"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/page/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/format/intl";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";
  joinedAt: Date;
}

const ROLE_BADGE_VARIANT: Record<
  MemberRow["role"],
  "danger" | "warn" | "info" | "neutral"
> = {
  admin: "danger",
  risk_officer: "warn",
  ai_owner: "info",
  auditor: "neutral",
  viewer: "neutral",
};

const ALL_ROLES: MemberRow["role"][] = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
];

export function MembersTable({
  members,
  canEditRole,
  canRemove,
  currentUserId,
}: {
  members: MemberRow[];
  canEditRole: boolean;
  canRemove: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("members");
  const locale = useLocale() as "zh" | "en";
  const utils = trpc.useUtils();
  const updateRole = trpc.members.updateRole.useMutation({
    onSuccess: () => utils.members.list.invalidate(),
  });
  const remove = trpc.members.remove.useMutation({
    onSuccess: () => utils.members.list.invalidate(),
    onError: (err) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("last admin")) alert(t("remove.error.lastAdmin"));
      else if (msg.includes("yourself")) alert(t("remove.error.self"));
      else alert(err.message);
    },
  });
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const columns: DataTableColumn<MemberRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      render: (row) => <span>{row.name || "—"}</span>,
    },
    {
      key: "email",
      header: t("col.email"),
      render: (row) => <span className="text-secondary">{row.email}</span>,
    },
    {
      key: "role",
      header: t("col.role"),
      width: "180px",
      render: (row) => {
        if (!canEditRole || row.userId === currentUserId) {
          return (
            <Badge variant={ROLE_BADGE_VARIANT[row.role]} size="sm">
              {t(`role.${row.role}`)}
            </Badge>
          );
        }
        return (
          <Select
            value={row.role}
            onValueChange={(newRole) => {
              setPendingUserId(row.userId);
              startTransition(async () => {
                await updateRole.mutateAsync({
                  userId: row.userId,
                  role: newRole as MemberRow["role"],
                });
                setPendingUserId(null);
              });
            }}
            disabled={isPending && pendingUserId === row.userId}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`role.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "joinedAt",
      header: t("col.joinedAt"),
      width: "140px",
      render: (row) => (
        <span className="whitespace-nowrap text-secondary">
          {formatDate(row.joinedAt, locale)}
        </span>
      ),
    },
  ];

  if (canRemove) {
    columns.push({
      key: "actions",
      header: t("col.actions"),
      width: "80px",
      render: (row) => {
        if (row.userId === currentUserId) return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() =>
              setRemoveTarget({
                userId: row.userId,
                name: row.name || row.email,
              })
            }
          >
            <Trash2 size={14} />
          </Button>
        );
      },
    });
  }

  return (
    <>
      <DataTable
        rows={members}
        columns={columns}
        rowKey={(r) => r.userId}
        emptyTitle={t("noMembers")}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={
          removeTarget
            ? t("remove.confirmBody", { name: removeTarget.name })
            : ""
        }
        confirmLabel={t("remove.confirm")}
        variant="danger"
        onConfirm={() => {
          if (removeTarget) {
            remove.mutate({ userId: removeTarget.userId });
          }
          setRemoveTarget(null);
        }}
      />
    </>
  );
}
