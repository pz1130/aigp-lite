import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    Resources: [
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        description:
          "AIGP-Lite SCIM User resource (Users only — no Groups in v1)",
        attributes: [
          {
            name: "userName",
            type: "string",
            required: true,
            multiValued: false,
          },
          {
            name: "name",
            type: "complex",
            required: false,
            multiValued: false,
          },
          {
            name: "emails",
            type: "complex",
            required: true,
            multiValued: true,
          },
          {
            name: "active",
            type: "boolean",
            required: false,
            multiValued: false,
          },
        ],
      },
    ],
  });
}
