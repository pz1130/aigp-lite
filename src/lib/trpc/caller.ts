import { experimental_nextAppDirCaller } from "@trpc/server/adapters/next-app-dir";

export const caller = experimental_nextAppDirCaller({
  createContext: async () => {
    const { getSessionContext } = await import("@/lib/auth/session");
    return getSessionContext();
  },
});
