import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import type { NextRequest } from "next/server";
import { appRouter } from "@/lib/trpc/router";
import { createContext } from "@/lib/trpc/server";
import { withAudit } from "@/middleware/audit";

const tRPCAppHandler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError({ error }) {
      // Let the error propagate to the audit wrapper — it detects TRPCError/FORBIDDEN
      if (error.code === "FORBIDDEN") {
        throw new TRPCError({ code: "FORBIDDEN", message: error.message });
      }
    },
  });

const wrappedHandler = withAudit(async (req: NextRequest) => {
  const res = await tRPCAppHandler(req as unknown as Request);
  return res;
});

export const GET = (req: NextRequest) => wrappedHandler(req);
export const POST = (req: NextRequest) => wrappedHandler(req);
