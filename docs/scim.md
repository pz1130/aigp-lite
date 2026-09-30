# SCIM Provisioning

AIGP-Lite supports SCIM 2.0 push provisioning so an identity provider (Okta, Azure AD, etc.) can automatically create, update, and deactivate members in your org.

## Scope (v1)

- **Users only.** There is no `/Groups` endpoint — group-based role assignment is done by mapping a custom user attribute, not by syncing group membership as its own resource.
- **Deactivation removes org membership, not the person.** A SCIM deactivate or delete request removes the user's `Membership` row for this org. Their account is never deleted — if they belong to other orgs, or are re-provisioned later, nothing else is affected.
- **One connection per org.** Each org has exactly one bearer token, configured on `/settings/scim`.
- **SCIM never grants login credentials.** SCIM-provisioned users still log in via your org's SSO/OIDC connection (`/settings/sso`) — SCIM must be configured alongside SSO, not instead of it. On a user's first real SSO login, their account is linked automatically by matching email address.

## Setup

1. As an org admin, go to `/settings/scim`.
2. Optionally configure a **role attribute** (a dot-path into the SCIM user payload, e.g. `department` or `urn:custom.department`) and a **role value map** (one `attribute-value: role` pair per line, e.g. `eng: admin`). Users provisioned without a role match default to `viewer`.
3. Click **Save** — this issues the org's bearer token. **Copy it immediately**; it is shown only once.
4. In your IdP's SCIM app configuration, set:
   - **SCIM connector base URL:** `https://<your-deployment>/api/scim/v2`
   - **Bearer token:** the value copied in step 3.
5. Assign users to the SCIM app in your IdP to provision them.

## Rotating the token

If the token is compromised, click **Rotate token** on `/settings/scim`. This immediately invalidates the previous token — update your IdP's SCIM configuration with the new value right away, or provisioning will start failing with 401s.

## Endpoints

| Method | Path                                 | Purpose                                                                                   |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| GET    | `/api/scim/v2/ServiceProviderConfig` | Capability discovery                                                                      |
| GET    | `/api/scim/v2/ResourceTypes`         | Resource type discovery                                                                   |
| GET    | `/api/scim/v2/Schemas`               | Schema discovery                                                                          |
| GET    | `/api/scim/v2/Users`                 | List/filter members (`filter=emails.value eq "..."`)                                      |
| POST   | `/api/scim/v2/Users`                 | Provision a member                                                                        |
| GET    | `/api/scim/v2/Users/{id}`            | Read a member                                                                             |
| PUT    | `/api/scim/v2/Users/{id}`            | Replace a member (setting `active: false` deprovisions)                                   |
| PATCH  | `/api/scim/v2/Users/{id}`            | Partial update (`Operations: [{ op: "replace", value: { active: false } }]` deprovisions) |
| DELETE | `/api/scim/v2/Users/{id}`            | Deprovision a member                                                                      |

## Troubleshooting

- **401 on every request:** the bearer token is wrong, was rotated, or the connection is disabled on `/settings/scim`.
- **A user isn't getting the role you expect:** check the role attribute path and value map on `/settings/scim` — an unmapped or missing attribute value always resolves to `viewer`.
- **A deactivated user can still see data in another org:** this is expected — deactivation only removes membership in the org whose SCIM connection issued the request.
