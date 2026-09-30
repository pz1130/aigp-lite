"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  SUBSCRIBABLE_EVENTS,
  type SubscribableEvent,
} from "@/lib/integrations-ext/types";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

function statusVariant(s: string): "success" | "neutral" | "critical" {
  if (s === "ok") return "success";
  if (s === "skipped_echo") return "neutral";
  return "critical";
}

export function ConnectorDetail({ id }: { id: string }) {
  const t = useTranslations();
  const tConn = useTranslations("integrations.connector");
  const router = useRouter();

  const q = trpc.integrationsExt.get.useQuery({ id });
  const upd = trpc.integrationsExt.update.useMutation();
  const del = trpc.integrationsExt.delete.useMutation();
  const test = trpc.integrationsExt.test.useMutation();
  const utils = trpc.useUtils();

  const [editingEvents, setEditingEvents] = useState<
    SubscribableEvent[] | null
  >(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading || !q.data)
    return <p className="text-sm text-secondary">{t("common.loading")}</p>;
  const r = q.data;
  const subs = editingEvents ?? (r.subscribedEvents as SubscribableEvent[]);

  async function saveEvents() {
    setError(null);
    try {
      await upd.mutateAsync({ id, subscribedEvents: subs as never });
      await utils.integrationsExt.get.invalidate({ id });
      setEditingEvents(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function doDelete() {
    try {
      await del.mutateAsync({ id });
      await utils.integrationsExt.list.invalidate();
      router.push("/integrations/connectors" as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShowConfirmDelete(false);
    }
  }

  function toggleEvent(ev: SubscribableEvent, checked: boolean) {
    setEditingEvents((cur) => {
      const next = (cur ?? (r.subscribedEvents as SubscribableEvent[])).slice();
      if (checked) {
        if (!next.includes(ev)) next.push(ev);
      } else {
        const i = next.indexOf(ev);
        if (i > -1) next.splice(i, 1);
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title={r.name}
        description={r.integrationType}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={test.isPending}
              onClick={() => test.mutate({ id })}
            >
              {test.isPending ? tConn("testing") : tConn("action.test")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowConfirmDelete(true)}
            >
              {tConn("action.delete")}
            </Button>
          </div>
        }
      />

      <section className="grid gap-2 rounded-lg border border-border-default bg-surface p-4 text-sm md:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-tertiary">
            {tConn("field.health")}
          </div>
          {r.healthStatus ? (
            r.healthStatus.startsWith("ok") ? (
              <Badge variant="success">{tConn("health.ok")}</Badge>
            ) : (
              <Badge variant="danger" title={r.healthStatus}>
                {tConn("health.failed")}
              </Badge>
            )
          ) : (
            <Badge variant="neutral">{tConn("health.never")}</Badge>
          )}
        </div>
        <div>
          <div className="text-xs uppercase text-tertiary">
            {tConn("field.lastDelivery")}
          </div>
          <span className="text-sm text-secondary">
            {r.lastDeliveryAt
              ? new Date(r.lastDeliveryAt).toLocaleString()
              : "—"}
          </span>
        </div>
        <div>
          <div className="text-xs uppercase text-tertiary">
            {tConn("field.inboundSecret")}
          </div>
          <span className="font-mono text-xs text-secondary">
            {r.inboundSecret ?? "—"}
          </span>
        </div>
      </section>

      <fieldset className="space-y-1.5 rounded-lg border border-border-default bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-primary">
          {tConn("field.events")}
        </legend>
        {SUBSCRIBABLE_EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={subs.includes(ev)}
              onCheckedChange={(v) => toggleEvent(ev, v === true)}
            />
            <span className="font-mono text-xs">{ev}</span>
          </label>
        ))}
        {editingEvents && (
          <div className="pt-2">
            <Button
              size="sm"
              variant="primary"
              onClick={saveEvents}
              disabled={upd.isPending}
            >
              {upd.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        )}
      </fieldset>

      <section>
        <h3 className="mb-2 text-sm font-medium text-primary">
          {tConn("syncLog")}
        </h3>
        {r.recentLogs.length === 0 ? (
          <p className="text-sm text-secondary">—</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{tConn("field.direction")}</Th>
                <Th>{tConn("field.eventType")}</Th>
                <Th>{tConn("field.status")}</Th>
                <Th>{tConn("field.time")}</Th>
                <Th>{tConn("field.detail")}</Th>
              </Tr>
            </THead>
            <TBody>
              {r.recentLogs.map((l) => (
                <Tr key={l.id}>
                  <Td className="text-xs">{l.direction}</Td>
                  <Td className="text-xs font-mono">{l.eventType ?? "—"}</Td>
                  <Td>
                    <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
                  </Td>
                  <Td className="text-xs text-secondary">
                    {new Date(l.occurredAt).toLocaleString()}
                  </Td>
                  <Td className="text-xs max-w-md truncate">
                    {l.errorMessage ?? l.externalRef ?? ""}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Dialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <DialogContent>
          <p className="text-sm">{tConn("deleteConfirm")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowConfirmDelete(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={doDelete}
              disabled={del.isPending}
            >
              {tConn("action.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
