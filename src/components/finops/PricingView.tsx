"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface ConnectionOverride {
  id: string;
  name: string;
  providerType: string;
  override: Record<
    string,
    { inputPerMillion: number; outputPerMillion: number }
  >;
}

export function PricingView() {
  const t = useTranslations();
  const q = trpc.finops.pricing.catalog.useQuery();

  if (q.isLoading)
    return <p className="text-sm text-tertiary">{t("common.loading")}</p>;
  if (!q.data) return null;

  const { builtIn, connections } = q.data;

  return (
    <div className="space-y-10">
      <ConnectionOverridesSection
        connections={connections}
        onChanged={() => q.refetch()}
      />

      <section>
        <h2 className="mb-1 text-lg font-semibold">
          {t("finops.pricing.builtIn")}
        </h2>
        <p className="mb-3 text-xs text-tertiary">
          {t("finops.pricing.builtInHint")}
        </p>
        {Object.entries(builtIn).map(([providerType, models]) => (
          <div key={providerType} className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-tertiary">
              {providerType}
            </h3>
            <Table>
              <THead>
                <Tr>
                  <Th>{t("finops.pricing.col.model")}</Th>
                  <Th className="text-right">
                    {t("finops.pricing.col.inputPrice")}
                  </Th>
                  <Th className="text-right">
                    {t("finops.pricing.col.outputPrice")}
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {Object.entries(models).map(([model, prices]) => (
                  <Tr key={model}>
                    <Td className="font-mono text-xs">{model}</Td>
                    <Td className="text-right">
                      ${prices.inputPerMillion.toFixed(2)}
                    </Td>
                    <Td className="text-right">
                      ${prices.outputPerMillion.toFixed(2)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        ))}
      </section>
    </div>
  );
}

function ConnectionOverridesSection({
  connections,
  onChanged,
}: {
  connections: ConnectionOverride[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t("finops.pricing.connectionOverrides")}
        </h2>
        <Link
          href="/integrations/providers"
          className="text-xs text-accent underline"
        >
          {t("finops.pricing.configureProviders")} →
        </Link>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon="chart"
          title={t("finops.pricing.noConnections")}
          description={t("finops.pricing.noConnectionsHint")}
        />
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} conn={c} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConnectionCard({
  conn,
  onChanged,
}: {
  conn: ConnectionOverride;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const set = trpc.finops.pricing.setOverride.useMutation();
  const clear = trpc.finops.pricing.clearOverride.useMutation();
  const utils = trpc.useUtils();

  const [adding, setAdding] = useState(false);
  const [model, setModel] = useState("");
  const [inputP, setInputP] = useState("");
  const [outputP, setOutputP] = useState("");
  const [error, setError] = useState("");
  const [_removeTarget, setRemoveTarget] = useState<string | null>(null);

  async function refresh() {
    await utils.finops.pricing.catalog.invalidate();
    onChanged();
  }

  async function saveNew(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const i = parseFloat(inputP);
    const o = parseFloat(outputP);
    if (!model || isNaN(i) || isNaN(o) || i < 0 || o < 0) {
      setError("invalid");
      return;
    }
    try {
      await set.mutateAsync({
        connectionId: conn.id,
        model,
        inputPerMillion: i,
        outputPerMillion: o,
      });
      setModel("");
      setInputP("");
      setOutputP("");
      setAdding(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeOne(modelName: string) {
    setRemoveTarget(modelName);
  }

  const entries = Object.entries(conn.override);

  return (
    <Card className="hover:shadow-md hover:border-border-strong/60 transition-all duration-200 hover:-translate-y-px">
      <CardBody className="p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <span className="font-medium">{conn.name}</span>
            <span className="ml-2 font-mono text-xs text-tertiary">
              {conn.providerType}
            </span>
          </div>
          {!adding && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding(true)}
            >
              + {t("finops.pricing.addModel")}
            </Button>
          )}
        </div>

        {entries.length === 0 && !adding ? (
          <p className="text-xs text-tertiary">
            {t("finops.pricing.noOverrides")}
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{t("finops.pricing.col.model")}</Th>
                <Th className="text-right">
                  {t("finops.pricing.col.inputPrice")}
                </Th>
                <Th className="text-right">
                  {t("finops.pricing.col.outputPrice")}
                </Th>
                <Th className="text-right">
                  {t("finops.pricing.col.actions")}
                </Th>
              </Tr>
            </THead>
            <TBody>
              {entries.map(([m, p]) => (
                <Tr key={m}>
                  <Td className="font-mono text-xs">{m}</Td>
                  <Td className="text-right">
                    ${p.inputPerMillion.toFixed(2)}
                  </Td>
                  <Td className="text-right">
                    ${p.outputPerMillion.toFixed(2)}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOne(m)}
                      disabled={clear.isPending}
                      className="text-danger hover:text-danger"
                    >
                      {t("finops.pricing.remove")}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}

        {adding && (
          <form
            onSubmit={saveNew}
            className="mt-3 grid grid-cols-12 gap-2 border-t border-border-default pt-3 text-sm"
          >
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("finops.pricing.modelPlaceholder")}
              className="col-span-5 font-mono text-xs"
              required
            />
            <Input
              value={inputP}
              onChange={(e) => setInputP(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="col-span-2 text-right"
              required
            />
            <Input
              value={outputP}
              onChange={(e) => setOutputP(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="col-span-2 text-right"
              required
            />
            <Button
              type="submit"
              size="sm"
              disabled={set.isPending}
              className="col-span-2"
            >
              {set.isPending
                ? t("finops.pricing.saving")
                : t("finops.pricing.save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              className="col-span-1 text-xs"
            >
              {t("common.cancel")}
            </Button>
            {error && (
              <p className="col-span-12 text-xs text-danger">{error}</p>
            )}
          </form>
        )}
      </CardBody>
    </Card>
  );
}
