import { TRPCError } from "@trpc/server";
import {
  assertSafeDestination,
  assertSafeHost,
  EgressBlockedError,
} from "./guard";

export async function assertSafeDestinationInput(url: string): Promise<void> {
  try {
    await assertSafeDestination(url);
  } catch (err) {
    if (err instanceof EgressBlockedError)
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    throw err;
  }
}

export async function assertSafeHostInput(host: string): Promise<void> {
  try {
    await assertSafeHost(host);
  } catch (err) {
    if (err instanceof EgressBlockedError)
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    throw err;
  }
}
