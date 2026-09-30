import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient as GeneratedPrismaClient,
  Prisma,
} from "@/generated/prisma/client";

// Single import surface for Prisma types, enums, and the client class.
// Everything that used to come from "@prisma/client" (removed as a direct
// import target in Prisma 7's generated-client model) is re-exported here.
export * from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter on every client. Wrapping the generated
// class keeps the familiar `new PrismaClient()` shape at all construction
// sites (seeds, tests, scripts) instead of threading an adapter through each.
// PrismaClientOptions is a union discriminated on adapter-vs-accelerateUrl;
// callers here only ever pass the common knobs, so accept just those.
type PrismaClientBaseOptions = {
  errorFormat?: Prisma.ErrorFormat;
  log?: (Prisma.LogLevel | Prisma.LogDefinition)[];
  transactionOptions?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  };
  omit?: Prisma.GlobalOmitConfig;
};

export class PrismaClient extends GeneratedPrismaClient {
  constructor(options?: PrismaClientBaseOptions) {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? "",
      }),
      ...options,
    });
  }
}
