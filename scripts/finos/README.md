# FINOS AIGF Importer

Fetches the [FINOS AI Governance Framework](https://github.com/finos/ai-governance-framework) risks + mitigations and writes them as a committed JSON file consumed by `prisma/seeds/finos-importer.ts`.

## When to run

- First-time setup of the seed file
- When upstream publishes new/updated risks or mitigations
- When `_meta.upstreamRef` in `prisma/seeds/finos-aigf.json` is stale

## Usage

    npm run finos:import                       # latest main
    npm run finos:import -- --ref=<sha|tag>    # pin to a version
    npm run finos:import -- --dry-run          # preview without writing

## Output

- `prisma/seeds/finos-aigf.json` — normalized data + `_meta`
- `prisma/seeds/finos-aigf.json.LICENSE` — upstream LICENSE text + attribution

Commit both files after running.

## Licensing

FINOS AIGF is **CC BY 4.0**. This importer preserves attribution in three places:

1. `_meta.attribution` in the JSON
2. `sourceUrl` on every risk and mitigation row (deep link with commit SHA)
3. `prisma/seeds/finos-aigf.json.LICENSE` (full upstream license text)

If the upstream `LICENSE` SHA changes between runs, review the diff before committing.

## Networking

Network access is required only when running this script. The seed routine (`prisma/seeds/finos-importer.ts`) reads only the committed JSON — never hits the network.

GitHub API rate limit: set `GITHUB_TOKEN` env or pass `--github-token=...` to lift unauthenticated limits.
