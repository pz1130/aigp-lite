"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

type Scope = "org" | "api_key" | "usecase";
type Period = "daily" | "weekly" | "monthly";

export function BudgetList() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const listQ = trpc.finops.budget.list.useQuery();
  const deleteM = trpc.finops.budget.delete.useMutation({
    onSuccess: () => utils.finops.budget.list.invalidate(),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function onDelete(id: string) {
    setDeleteTarget(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          {t("finops.budget.new")}
        </Button>
      </div>

      {showCreate && (
        <BudgetForm
          onClose={() => {
            setShowCreate(false);
            void utils.finops.budget.list.invalidate();
          }}
        />
      )}

      {listQ.isLoading ? (
        <p className="text-sm text-tertiary">{t("common.loading")}</p>
      ) : listQ.data?.length === 0 ? (
        <EmptyState
          icon="chart"
          title={t("finops.budget.empty")}
          description={t("finops.budget.emptyHint")}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t("finops.budget.col.scope")}</Th>
              <Th>{t("finops.budget.col.period")}</Th>
              <Th className="text-right">{t("finops.budget.col.amount")}</Th>
              <Th className="text-center">{t("finops.budget.col.hardCap")}</Th>
              <Th className="text-center">{t("finops.budget.col.active")}</Th>
              <Th className="text-right">{t("finops.budget.col.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {listQ.data!.map((b) => (
              <Tr key={b.id}>
                <Td>
                  {t(`finops.budget.scope.${b.scope}`)}
                  {b.scopeRefId && (
                    <span className="ml-1 text-tertiary">({b.scopeRefId})</span>
                  )}
                </Td>
                <Td>{t(`finops.budget.period.${b.period}`)}</Td>
                <Td className="text-right font-mono">
                  ${Number(b.amountUsd).toFixed(2)}
                </Td>
                <Td className="text-center">{b.hardCap ? "🔒" : "—"}</Td>
                <Td className="text-center">{b.isActive ? "✓" : "✗"}</Td>
                <Td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(b.id)}
                    className="text-danger hover:text-danger"
                  >
                    {t("common.delete")}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("finops.budget.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteM.mutateAsync({ id: deleteTarget });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

interface BudgetFormProps {
  onClose: () => void;
}

export function BudgetForm({ onClose }: BudgetFormProps) {
  const t = useTranslations();
  const createM = trpc.finops.budget.create.useMutation({ onSuccess: onClose });

  const [scope, setScope] = useState<Scope>("org");
  const [scopeRefId, setScopeRefId] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const [amountUsd, setAmountUsd] = useState("");
  const [hardCap, setHardCap] = useState(false);
  const [error, setError] = useState("");

  const usecasesQ = trpc.inventory.list.useQuery();
  const apiKeysQ = trpc.policy.apiKeys.list.useQuery();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseFloat(amountUsd);
    if (isNaN(amount) || amount <= 0) {
      setError(t("finops.budget.invalidAmount"));
      return;
    }
    if (scope !== "org" && !scopeRefId) {
      setError(t("finops.budget.scopeRefRequired"));
      return;
    }
    await createM.mutateAsync({
      scope,
      scopeRefId: scope !== "org" ? scopeRefId : undefined,
      period,
      amountUsd: amount,
      hardCap,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{t("finops.budget.createTitle")}</DialogTitle>
        <DialogDescription>{t("finops.budget.createDesc")}</DialogDescription>

        <form onSubmit={onSubmit} className="space-y-4 mt-2">
          {/* Scope */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("finops.budget.form.scope")}
              <Select
                value={scope}
                onValueChange={(v) => {
                  setScope(v as Scope);
                  setScopeRefId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">
                    {t("finops.budget.scope.org")}
                  </SelectItem>
                  <SelectItem value="api_key">
                    {t("finops.budget.scope.api_key")}
                  </SelectItem>
                  <SelectItem value="usecase">
                    {t("finops.budget.scope.usecase")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {/* Conditional ref selector */}
          {scope === "usecase" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("finops.budget.form.usecase")}
                <Select value={scopeRefId} onValueChange={setScopeRefId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("finops.budget.form.selectUsecase")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {usecasesQ.data?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          )}
          {scope === "api_key" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("finops.budget.form.apiKey")}
                <Select value={scopeRefId} onValueChange={setScopeRefId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("finops.budget.form.selectApiKey")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {apiKeysQ.data?.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          )}

          {/* Period */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("finops.budget.form.period")}
              <Select
                value={period}
                onValueChange={(v) => setPeriod(v as Period)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">
                    {t("finops.budget.period.daily")}
                  </SelectItem>
                  <SelectItem value="weekly">
                    {t("finops.budget.period.weekly")}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {t("finops.budget.period.monthly")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("finops.budget.form.amount")}
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
              />
            </label>
          </div>

          {/* Hard cap */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="hardCap"
              checked={hardCap}
              onCheckedChange={(v) => setHardCap(v === true)}
            />
            <label htmlFor="hardCap" className="text-sm">
              {t("finops.budget.form.hardCap")}
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={createM.isPending}>
              {createM.isPending
                ? t("common.loading")
                : t("finops.budget.createBtn")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
