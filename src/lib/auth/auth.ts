import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { consumeLoginAttempt, LoginRateLimited } from "./login-rate-limit";
import { oidcProvider } from "./sso/provider";
import { provisionOidcUser } from "./sso/jit";
import { resolveProviderConfig } from "./sso/store";

const credentialsProvider = Credentials({
  name: "Email + Password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(creds, request) {
    const email = String(creds?.email ?? "")
      .toLowerCase()
      .trim();
    const password = String(creds?.password ?? "");
    if (!email || !password) return null;
    if (!(await consumeLoginAttempt(email, request))) {
      throw new LoginRateLimited();
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return null;
    if (!(await verifyPassword(user.passwordHash, password))) return null;
    return { id: user.id, email: user.email, name: user.name ?? undefined };
  },
});

/**
 * Functional config so the OIDC provider is resolved per request from the
 * DB-backed connection (env config remains the bootstrap fallback). The provider
 * is built from a request-independent config (env or a sole DB connection) so the
 * authorize and callback legs agree; per-org IdP dispatch is a documented follow-up.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const ssoCfg = await resolveProviderConfig();
  return {
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    // Allow localhost / docker / behind-proxy hosts. Auth.js v5 rejects unknown hosts by default.
    trustHost: true,
    providers: ssoCfg
      ? [credentialsProvider, oidcProvider(ssoCfg)]
      : [credentialsProvider],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "oidc") return true;
        const cfg = ssoCfg ?? (await resolveProviderConfig());
        if (!cfg) return false;
        const claims = (profile ?? {}) as Record<string, unknown>;
        const result = await provisionOidcUser(
          {
            sub: String((profile as { sub?: string })?.sub ?? ""),
            email: String((profile as { email?: string })?.email ?? "")
              .toLowerCase()
              .trim(),
            name: (profile as { name?: string })?.name ?? null,
            emailVerified: Boolean(
              (profile as { email_verified?: boolean })?.email_verified,
            ),
            claims,
          },
          cfg,
        );
        if (!result.ok) return false;
        (user as { id?: string }).id = result.userId;
        return true;
      },
      async jwt({ token, user }) {
        if (user) token.userId = (user as { id?: string }).id;
        return token;
      },
      async session({ session, token }) {
        if (token.userId)
          (session.user as { id?: string }).id = token.userId as string;
        return session;
      },
    },
  } satisfies NextAuthConfig;
});
