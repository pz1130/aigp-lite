type OpenApiPathItem = Record<string, unknown>;

const cookieSecurity = [{ cookieAuth: [] }];
const bearerSecurity = [{ bearerAuth: [] }];
const serviceNowSecurity = [{ serviceNowWebhookSecret: [] }];

const jsonResponse = (description = "Successful response") => ({
  description,
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: true },
    },
  },
});

const errorResponses = {
  "400": { description: "Bad request" },
  "401": { description: "Unauthorized" },
  "403": { description: "Forbidden" },
  "404": { description: "Not found" },
  "500": { description: "Internal server error" },
};

const idPathParam = (name = "id", description = "Resource ID") => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
});

export const restOpenApiTags = [
  { name: "Audit" },
  { name: "Evidence" },
  { name: "Runtime" },
  { name: "Red Team Runtime" },
  { name: "Reports Download" },
  { name: "ServiceNow" },
];

export const restOpenApiPaths: Record<string, OpenApiPathItem> = {
  "/api/audit/export": {
    get: {
      tags: ["Audit"],
      summary: "Export audit logs as CSV",
      security: cookieSecurity,
      parameters: [
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 5000 },
        },
        { name: "action", in: "query", schema: { type: "string" } },
        { name: "resourceType", in: "query", schema: { type: "string" } },
        {
          name: "startDate",
          in: "query",
          schema: { type: "string", format: "date-time" },
        },
        {
          name: "endDate",
          in: "query",
          schema: { type: "string", format: "date-time" },
        },
      ],
      responses: {
        "200": {
          description: "CSV export",
          content: { "text/csv": { schema: { type: "string" } } },
        },
        ...errorResponses,
      },
    },
  },
  "/api/evidence/upload": {
    post: {
      tags: ["Evidence"],
      summary: "Upload evidence file",
      security: cookieSecurity,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string", format: "binary" },
                usecaseId: { type: "string" },
                controlId: { type: "string" },
                notes: { type: "string", maxLength: 1000 },
              },
            },
          },
        },
      },
      responses: { "200": jsonResponse("Evidence record"), ...errorResponses },
    },
  },
  "/api/evidence/download": {
    get: {
      tags: ["Evidence"],
      summary: "Download evidence file",
      security: cookieSecurity,
      parameters: [
        { name: "id", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Evidence file stream",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/runtime/llm": {
    post: {
      tags: ["Runtime"],
      summary: "Invoke LLM through governed runtime gateway",
      security: bearerSecurity,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["connectionId", "model", "messages"],
              properties: {
                connectionId: { type: "string" },
                model: { type: "string" },
                usecaseId: { type: "string" },
                messages: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Server-sent event stream from provider",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
        ...errorResponses,
      },
    },
  },
  "/api/redteam/runs": {
    post: {
      tags: ["Red Team Runtime"],
      summary: "Create red-team evaluation run",
      security: cookieSecurity,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      responses: {
        "200": jsonResponse("Created evaluation run"),
        ...errorResponses,
      },
    },
  },
  "/api/redteam/runs/{id}/abort": {
    post: {
      tags: ["Red Team Runtime"],
      summary: "Abort red-team evaluation run",
      security: cookieSecurity,
      parameters: [idPathParam()],
      responses: { "200": jsonResponse("Abort status"), ...errorResponses },
    },
  },
  "/api/redteam/runs/{id}/stream": {
    get: {
      tags: ["Red Team Runtime"],
      summary: "Stream red-team evaluation progress",
      security: cookieSecurity,
      parameters: [idPathParam()],
      responses: {
        "200": {
          description: "Server-sent evaluation events",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
        ...errorResponses,
      },
    },
  },
  "/api/reports/{id}/{format}": {
    get: {
      tags: ["Reports Download"],
      summary: "Download generated report",
      security: cookieSecurity,
      parameters: [
        idPathParam(),
        {
          name: "format",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["pdf", "xlsx"] },
        },
      ],
      responses: {
        "200": {
          description: "Report file",
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/integrations/servicenow/inbound/{id}": {
    post: {
      tags: ["ServiceNow"],
      summary: "Receive ServiceNow inbound webhook",
      security: serviceNowSecurity,
      parameters: [idPathParam("id", "Integration ID")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      responses: {
        "200": jsonResponse("Webhook handling result"),
        ...errorResponses,
      },
    },
  },
};
