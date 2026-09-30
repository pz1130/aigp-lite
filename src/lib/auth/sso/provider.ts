import type { OAuthConfig } from "@auth/core/providers/oauth";
import type { SsoConfig } from "./config";

export type OidcProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export type OidcMappedUser = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
};

export function oidcProvider(cfg: SsoConfig): OAuthConfig<OidcProfile> {
  return {
    id: "oidc",
    name: cfg.buttonLabel,
    type: "oauth",
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    authorization: { params: { scope: "openid profile email" } },
    checks: ["pkce", "state"],
    idToken: true,
    profile(p): OidcMappedUser {
      return {
        id: p.sub,
        email: p.email ? p.email.toLowerCase().trim() : null,
        name: p.name ?? null,
        emailVerified: Boolean(p.email_verified),
      };
    },
  } as OAuthConfig<OidcProfile>;
}
