# Contributing

Thanks for your interest in AIGP-Lite. Bug reports, fixes, and new framework
catalogs are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on
  the approach.
- Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

Follow "Quickstart (local dev, against dockerized DB)" in [README.md](README.md).
In short: Node from `.nvmrc`, `npm ci`, Postgres (and optionally Redis) via
`docker compose up -d db redis`, then `npm run prisma:migrate`,
`npm run prisma:seed` and `npm run dev`.

This repository uses **npm**; `package-lock.json` is the lockfile.

## Checks

CI runs the jobs described in [docs/ci.md](docs/ci.md). Run these before you
push:

```bash
npm run lint        # eslint src + prettier --check
npm run typecheck
npm test            # needs TEST_DATABASE_URL pointing at a scratch database
```

Add or update tests with every behaviour change. Schema changes need a Prisma
migration; CI fails the `test` job (`npm run prisma:drift`) if
`prisma/schema.prisma` and the migrations disagree. CI also enforces coverage
floors (`npm run test:coverage`); see [docs/ci.md](docs/ci.md#coverage-gate).

## Pull requests

- Branch from `main` and keep each PR focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the
  title, e.g. `fix(incidents): ...`. PRs are squash-merged.
- Update docs and `CHANGELOG.md` when user-visible behaviour changes.

## Third-party content

New framework catalogs must not reproduce copyrighted normative text. Store
identifiers, short titles, and original-wording summaries, and add a
`*.LICENSE` provenance file next to the data (see `prisma/seeds/`).

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
