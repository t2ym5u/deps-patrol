# deps-patrol v1.2.0

Scan project dependencies for outdated packages and vulnerabilities across multiple projects.

Reads the project list from [VS Code Project Manager](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager) and updates each project name with a status indicator:

| Status | Meaning                                |
| ------ | -------------------------------------- |
| ⚪️     | No `package.json` found                |
| 🟢     | All dependencies up to date            |
| 🟡     | Minor or patch updates available       |
| 🟠     | Major updates or deprecated packages   |
| 🔴     | High/critical vulnerabilities detected |
| 🔥     | Test suite failed                      |

Supports **npm**, **yarn**, **pnpm**, and **bun** (auto-detected per project).

If a project defines a `test` script (other than npm's default placeholder), it is run
after the dependency scan to confirm the project still works. When scanning a branch
other than the project's current checkout, deps-patrol runs a clean install
(`npm ci` / `<pm> install --frozen-lockfile`) in the temporary worktree first, since it
has no `node_modules`. A failing test suite takes priority over every other status.

## Setup

```bash
pnpm install
cp deps-patrol.config.json.sample deps-patrol.config.json
```

Edit `deps-patrol.config.json` to point to your `projects.json` file:

```json
{
  "debug": false,
  "logLevel": "info",
  "dryRun": false,
  "format": "json",
  "concurrency": 4,
  "branch": "main",
  "projects": "/path/to/projects.json",
  "output": "./deps-patrol.json"
}
```

## Usage

```bash
# Scan all projects
pnpm run scan

# Scan with debug output
pnpm run scan -- --debug

# Dry run (no file changes)
pnpm run scan -- --dry-run

# Override branch
pnpm run scan -- --branch=main

# Change output format (json | csv | html)
pnpm run scan -- --format=html

# Set concurrency (default: 4)
pnpm run scan -- --concurrency=8

# Only scan projects whose name contains "api" (case-insensitive)
pnpm run scan -- --filter=api

# Remove status indicators from project names
pnpm run clean
```

| Config option | CLI flag        | Default                                           |
| ------------- | --------------- | ------------------------------------------------- |
| `logLevel`    | —               | `"info"` (`error` \| `warn` \| `info` \| `debug`) |
| `debug`       | `--debug`       | `false`                                           |
| `dryRun`      | `--dry-run`     | `false`                                           |
| `format`      | `--format`      | `"json"`                                          |
| `concurrency` | `--concurrency` | `4`                                               |
| `branch`      | `--branch`      | current branch                                    |
| `filter`      | `--filter`      | none (scans all projects)                         |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned/considered features.

## License

MIT
