# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/pz1130/aigp-lite/security/advisories/new).
Include the affected version or commit, reproduction steps, and the impact you
observed.

You should get an acknowledgement within 7 days. Once a fix is available we
will publish an advisory and credit you, unless you prefer to stay anonymous.

## Supported versions

Only the latest `main` and the most recent tagged release receive security
fixes.

## Scope

In scope: the application in this repository, its Docker image, and the
compose files.

Out of scope:

- Deployments that run the dev `docker-compose.yml` on the internet, or keep
  the seeded `*@demo.local` accounts. See [docs/deployment.md](docs/deployment.md).
- Findings that need a compromised host, database, or admin account.
- Denial of service by request volume. Rate-limit at your reverse proxy.

The threat model is in [THREAT_MODEL.md](THREAT_MODEL.md).
