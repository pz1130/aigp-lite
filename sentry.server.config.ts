import * as Sentry from "@sentry/nextjs";

const nodeMajor = Number(process.versions.node.split(".")[0]);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  registerEsmLoaderHooks: nodeMajor < 26,
  debug: false,
});
