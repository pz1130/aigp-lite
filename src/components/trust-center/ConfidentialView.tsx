import type { TrustConfidentialPayload } from "@/lib/trust-center/aggregate";

export interface ConfidentialViewProps {
  slug: string;
  displayName: string;
  version: number;
  versions: number[];
  locale: string;
  payload: TrustConfidentialPayload;
  labels: {
    heading: string;
    notice: string;
    versions: string;
    readiness: string;
    attestations: string;
    download: string;
    sbom: string;
    transparency: string;
  };
}

export function TrustConfidentialView(props: ConfidentialViewProps) {
  const { payload, labels } = props;
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{props.displayName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{labels.heading}</p>
      <p className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        {labels.notice}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.versions}</h2>
        <ul className="mt-2 flex flex-wrap gap-3 text-sm">
          {props.versions.map((v) => (
            <li key={v}>
              <a
                className="underline"
                href={`/${props.locale}/trust/${props.slug}/full/v/${v}`}
              >
                v{v}
                {v === props.version ? " (current view)" : ""}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.readiness}</h2>
        {payload.readiness.map((r) => (
          <div key={r.systemId} className="mt-4">
            <div className="font-medium">{r.systemId}</div>
            <ul className="mt-1 space-y-1 text-sm">
              {r.checks.map((c) => (
                <li key={c.id}>
                  {c.id} — {c.status} ({c.severity})
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.attestations}</h2>
        <ul className="mt-2 space-y-3 text-sm">
          {payload.attestations.map((a) => (
            <li key={a.id}>
              <div className="font-medium">
                {a.attesterName} — {a.attesterOrg}
              </div>
              <div className="text-muted-foreground">{a.scope}</div>
              <div className="font-mono text-xs">{a.reportSha256}</div>
              <a
                className="underline"
                href={`/api/trust/${props.slug}/attestation/${a.id}`}
              >
                {labels.download}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.transparency}</h2>
        <ul className="mt-2 space-y-3 text-sm">
          {payload.transparencyReports.map((t) => (
            <li key={t.id}>
              <div className="font-medium">
                {t.title} — {t.periodLabel} (v{t.version})
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-xs">
                {JSON.stringify(t.sections, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.sbom}</h2>
        <p className="mt-2 text-sm">
          {payload.sbom.available
            ? `${payload.sbom.componentCount} components`
            : "—"}
        </p>
      </section>
    </main>
  );
}
