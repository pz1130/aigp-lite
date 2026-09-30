# SSO / OIDC Single Sign-On

AIGP supports OpenID Connect (OIDC) single sign-on so members can authenticate
through your corporate identity provider (Okta, Entra ID, Auth0, Google
Workspace, Keycloak, …). Users who sign in via SSO are provisioned
just-in-time (JIT) into the org with a role derived from their IdP groups.

There are two ways to configure a connection:

1. **Admin self-service (recommended)** — an org admin enters the connection in
   the UI; the client secret is encrypted at rest in the database.
2. **Environment variables** — a single-tenant bootstrap path for deployments
   that prefer to inject config at deploy time.

The env path takes precedence when set. See [Resolution order](#resolution-order).

---

## 1. Admin self-service

**Settings → Single Sign-On** (`/settings/sso`, admin-only).

| Field                 | Notes                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Issuer URL            | The IdP's OIDC issuer (e.g. `https://acme.okta.com`). Discovery is read from `<issuer>/.well-known/openid-configuration`.             |
| Client ID             | The OIDC application's client ID.                                                                                                     |
| Client Secret         | Write-only. Stored AES-256-GCM-encrypted; never returned to the browser. Once saved it shows as `••••••••` with a **Rotate** control. |
| Sign-in button label  | What the login button reads (defaults to "Sign in with SSO").                                                                         |
| Allowed email domains | Comma-separated allow-list. Blank means any domain. A login is rejected if the IdP email's domain is not on the list.                 |
| Enable SSO sign-in    | Toggle the connection on/off without deleting it.                                                                                     |

The secret never crosses the server boundary: reads return a redacted view
(`hasSecret: true`), and the value is only decrypted server-side when building
the provider for a login. Rotating replaces just the ciphertext.

**Redirect / callback URL** to register in your IdP:

```
https://<your-host>/api/auth/callback/oidc
```

One IdP connection per org (`SsoConnection.orgId` is unique).

### Group → role mapping

A connection may carry a `groupRoleMap` that maps an IdP claim's values to AIGP
roles. On each SSO login the user's role is resolved from their claims; if no
mapping matches, they get `viewer`.

```json
{
  "groups": {
    "platform-admins": "admin",
    "risk-team": "risk_officer",
    "model-owners": "ai_owner"
  }
}
```

The outer key is the claim name (e.g. `groups`), the inner map is claim-value →
role. Valid roles: `admin`, `risk_officer`, `ai_owner`, `auditor`, `viewer`.
Have your IdP include the groups claim in the ID token.

---

## 2. Environment variables

For a single-tenant bootstrap, set:

| Variable                   | Required | Description                              |
| -------------------------- | -------- | ---------------------------------------- |
| `SSO_OIDC_ISSUER`          | yes      | OIDC issuer URL.                         |
| `SSO_OIDC_CLIENT_ID`       | yes      | Client ID.                               |
| `SSO_OIDC_CLIENT_SECRET`   | yes      | Client secret.                           |
| `SSO_OIDC_ORG_ID`          | yes      | Org that JIT-provisioned users join.     |
| `SSO_OIDC_BUTTON_LABEL`    | no       | Login button label.                      |
| `SSO_OIDC_ALLOWED_DOMAINS` | no       | Comma-separated email-domain allow-list. |

When all four required vars are present, the env connection is active and takes
precedence over any DB connection.

---

## Resolution order

**At login (which button + label to show):**

1. If the login URL carries an `?org=<slug>` hint → that org's enabled DB
   connection.
2. Otherwise the env bootstrap config, if set.
3. Otherwise, for a single-tenant deployment, the sole enabled DB connection.
4. Otherwise no SSO button is shown.

**When NextAuth builds the OIDC provider** (request-independent, e.g. the
callback leg), it uses the env config, or — if exactly one enabled DB
connection exists — that connection.

> **v1 limitation — one IdP per deployment for the actual auth flow.** The OIDC
> provider is registered request-independently, so a deployment with _multiple_
> enabled DB connections is ambiguous and the provider is not built (the button
> still renders per-org, but the callback can't disambiguate). Per-org provider
> dispatch — selecting the IdP from the `?org=` hint through the full
> authorize/callback round-trip — is a planned follow-up. SAML is out of scope.

The `?org=<slug>` hint is forwarded through the SSO round-trip via the
`callbackUrl` so the post-login landing keeps tenant context.

---

## Just-in-time provisioning

On a successful SSO sign-in:

- A user is created (or matched by email) and added to the connection's org.
- Their role is resolved from `groupRoleMap` against the ID-token claims, or
  `viewer` if nothing matches.
- If an email-domain allow-list is set and the email's domain isn't on it, the
  login is denied (`AccessDenied`).

---

## Security notes

- Client secrets are encrypted at rest with AES-256-GCM (the same envelope as
  `ProviderConnection.credentialsEncrypted`); plaintext never touches the DB.
- The secret is never logged and never returned to the client — audit entries
  for `sso.connection.*` actions record metadata only.
- All admin SSO mutations require the `org.write` permission (admin role).
