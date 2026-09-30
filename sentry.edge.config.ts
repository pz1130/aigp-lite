import * as Sentry from "@sentry/nextjs";

// NOTE: no `registerEsmLoaderHooks` here (unlike sentry.server.config.ts).
// That option only affects Node's ESM loader, and the Edge runtime has no
// `process.versions` binding at all — probing it makes the module fail to
// compile under `next dev` ("Ecmascript file had an error").
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  debug: false,
});
