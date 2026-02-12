# deps-patrol

Scan project dependencies for outdated packages and vulnerabilities across multiple projects.

Reads the project list from [VS Code Project Manager](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager) and updates each project name with a status indicator:

| Status | Meaning |
|--------|---------|
| ⚪️ | No `package.json` found |
| 🟢 | All dependencies up to date |
| 🟡 | Minor or patch updates available |
| 🟠 | Major updates or deprecated packages |
| 🔴 | High/critical vulnerabilities detected |

Supports **npm**, **yarn**, **pnpm**, and **bun** (auto-detected per project).

## Setup

```bash
pnpm install
cp deps-patrol.config.json.sample deps-patrol.config.json
```

Edit `deps-patrol.config.json` to point to your `projects.json` file:

```json
{
  "debug": false,
  "dryRun": false,
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

# Remove status indicators from project names
pnpm run clean
```

## License

MIT
