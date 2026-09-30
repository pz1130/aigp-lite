# Production deployment (Docker Compose)

`docker-compose.yml` is the **dev / POC** stack: it publishes Postgres (5432) and
Redis (6379) on the host, uses the fixed database password `aigp`, falls back to a
fixed `NEXTAUTH_SECRET`, and seeds demo accounts with the password `demo1234`.
Do not expose it to the internet.

For an internet-facing single-host deployment, layer the production override on top:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Requires Docker Compose v2.24+ (the override uses the `!reset` / `!override` merge tags).

## What the override changes

| Concern          | Dev stack                               | With `docker-compose.prod.yml`                                |
| ---------------- | --------------------------------------- | ------------------------------------------------------------- |
| Postgres / Redis | published on host `5432` / `6379`       | not published; reachable only on the compose network          |
| Web              | `0.0.0.0:3000`                          | `127.0.0.1:3000`; terminate HTTPS in a reverse proxy in front |
| DB password      | fixed `aigp`                            | `POSTGRES_PASSWORD` required                                  |
| Session secret   | falls back to `dev-secret-change-me...` | `NEXTAUTH_SECRET` required                                    |
| Encryption key   | optional (dev key derived from a seed)  | `AIGP_ENCRYPTION_KEY` required                                |
| Public URL       | `http://localhost:3000`                 | `NEXTAUTH_URL` required (the public `https://` origin)        |
| Seed data        | reference catalogs + demo org/users     | reference catalogs only (`AIGP_SEED_DEMO=0`)                  |

If any required variable is missing, `docker compose` refuses to start and names it.

## Required environment

Put these in a `.env` next to the compose files (never commit it), or inject them
from your secret manager:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
AIGP_ENCRYPTION_KEY=$(openssl rand -base64 32)
NEXTAUTH_URL=https://aigp.example.com
```

`POSTGRES_PASSWORD` is inserted verbatim into the `DATABASE_URL` connection string,
so it must be URL-safe. Hex output is. A base64 password can contain `/`, `+` or
`=`, which breaks URL parsing and stops `migrate`, `web` and `worker` from
connecting. If you bring your own password, restrict it to `A-Z a-z 0-9 - . _ ~`.

`POSTGRES_PASSWORD` is applied by the Postgres image **only when the data volume is
first initialised**. If you are converting an existing dev volume, change the
password inside Postgres first (`ALTER USER aigp PASSWORD '...'`) or start from a
fresh volume.

`AIGP_ENCRYPTION_KEY` encrypts stored provider credentials. Changing it later
requires `npm run crypto:rotate-key`; keep the old key until rotation completes.

## Seeding and the first admin

The `migrate` job runs `prisma migrate deploy` and then the seed script on every
start. The seed is idempotent:

- Reference catalogs (NIST, ISO 42001, EU AI Act, FINOS, ...) and the system user
  are always loaded.
- The demo org and `*@demo.local` users are created only when `AIGP_SEED_DEMO` is
  on. It defaults to on unless `NODE_ENV=production`; the production override sets
  it to `0` explicitly.
- Re-running the seed never overwrites an existing user's password.

With demo seeding off, create the first account through the normal registration
flow, or configure SSO (see [sso.md](sso.md)).

If a deployment was previously started **without** the override, the demo
accounts already exist. Change their passwords or delete them.

## Reverse proxy / HTTPS

The web container binds to `127.0.0.1:3000` only. Put Caddy, nginx or a cloud load
balancer in front of it to terminate TLS and forward to that port. `NEXTAUTH_URL`
must match the public origin, or sign-in callbacks will fail.

## Not covered by this override

- **Edge rate limiting.** Email + password sign-in is throttled in the app
  (20 attempts per 15 minutes per client IP, 10 per 15 minutes per account;
  shared across instances when `REDIS_URL` is set). The per-IP bucket keys on
  `X-Forwarded-For`, so have the reverse proxy set that header. General
  request-volume limits (for example nginx `limit_req` or Caddy `rate_limit`)
  still belong at the proxy.
- **Backups.** Snapshot the `aigp_pg` and `aigp_storage` volumes; see the
  [admin guide](admin/README.md).
- **Managed services.** For Kubernetes or managed Postgres/Redis, set the same
  variables in your orchestrator and run the `worker` target alongside `web`.
