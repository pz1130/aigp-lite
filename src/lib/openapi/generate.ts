import { restOpenApiPaths, restOpenApiTags } from "./rest-paths";
import { getTrpcOpenApiPaths, trpcOpenApiTags } from "./trpc-paths";

export function getOpenApiDocument() {
  const tags = [...restOpenApiTags, ...trpcOpenApiTags].filter(
    (tag, index, all) =>
      all.findIndex((candidate) => candidate.name === tag.name) === index,
  );

  return {
    // swagger-ui-react 5.x currently parses the 3.0 dialect reliably in both
    // Turbopack dev and production. The generated document uses no 3.1-only
    // keywords, so advertise the compatible 3.0 dialect to keep /api-docs
    // usable instead of failing in the browser's Apidom parser.
    openapi: "3.0.3",
    info: {
      title: "AIGP-Lite API",
      version: "0.6.0",
      description:
        "API reference for AIGP-Lite. REST routes are executable as documented. tRPC entries describe the canonical procedures exposed via /api/trpc/{procedure} and are intended as integration reference.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local development" },
    ],
    tags,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "authjs.session-token",
          description:
            "NextAuth session cookie used by browser-authenticated API routes.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description:
            "Runtime API key, for example Authorization: Bearer aigp_...",
        },
        serviceNowWebhookSecret: {
          type: "apiKey",
          in: "header",
          name: "x-webhook-secret",
          description:
            "Shared secret configured for the ServiceNow inbound integration.",
        },
      },
    },
    paths: {
      ...restOpenApiPaths,
      ...getTrpcOpenApiPaths(),
    },
  };
}
