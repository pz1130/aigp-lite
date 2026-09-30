import type { TrustPublicPayload } from "@/lib/trust-center/aggregate";

export interface PublicViewProps {
  displayName: string;
  contactEmail: string | null;
  version: number;
  publishedAt: Date | null;
  payload: TrustPublicPayload;
  labels: {
    heading: string;
    dataAsOf: string;
    frameworks: string;
    systems: string;
    goLivePassed: string;
    goLivePending: string;
    redteam: string;
    redteamSummary: string;
    transparency: string;
    sbom: string;
    sbomStatus: string;
    contact: string | null;
  };
}

export function TrustPublicView(props: PublicViewProps) {
  const { payload, labels } = props;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{props.displayName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{labels.heading}</p>
      <p className="mt-1 text-xs text-muted-foreground">{labels.dataAsOf}</p>
      {payload.org.intro ? (
        <p className="mt-6 whitespace-pre-wrap text-sm">{payload.org.intro}</p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.frameworks}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {payload.frameworks.map((f) => (
            <li key={f.framework}>
              {f.framework} — {f.version}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.systems}</h2>
        <ul className="mt-2 space-y-3 text-sm">
          {payload.systems.map((s) => (
            <li key={s.id}>
              <div className="font-medium">{s.name}</div>
              <div className="text-muted-foreground">{s.intendedUse}</div>
              <div className="text-xs">
                {s.goLivePassed ? labels.goLivePassed : labels.goLivePending}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.redteam}</h2>
        <p className="mt-2 text-sm">{labels.redteamSummary}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.transparency}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {payload.transparencyReports.map((t) => (
            <li key={t.id}>
              {t.title} — {t.periodLabel} (v{t.version})
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">{labels.sbom}</h2>
        <p className="mt-2 text-sm">{labels.sbomStatus}</p>
      </section>

      {labels.contact ? (
        <p className="mt-12 text-sm text-muted-foreground">{labels.contact}</p>
      ) : null}
    </main>
  );
}
