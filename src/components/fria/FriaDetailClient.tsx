"use client";
import { trpc } from "@/lib/trpc/client";
import { FriaSectionsForm } from "./FriaSectionsForm";
import { FriaActionsBar } from "./FriaActionsBar";
import { FriaStatusBadge } from "./FriaStatusBadge";
import type { FriaSections } from "@/lib/fria/sections-schema";

export function FriaDetailClient({
  friaId,
  status,
  userRole,
  isCreator,
  initialSections,
}: {
  friaId: string;
  status: "draft" | "submitted" | "approved" | "archived";
  userRole: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";
  isCreator: boolean;
  initialSections: FriaSections;
}) {
  const utils = trpc.useUtils();
  const refetch = () => {
    utils.fria.listForUsecase.invalidate();
    utils.fria.get.invalidate({ id: friaId });
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <FriaStatusBadge status={status} />
        <FriaActionsBar
          friaId={friaId}
          status={status}
          userRole={userRole}
          isCreator={isCreator}
          onAnyAction={refetch}
        />
      </div>
      <FriaSectionsForm
        friaId={friaId}
        initial={initialSections}
        readOnly={status !== "draft"}
      />
    </div>
  );
}
