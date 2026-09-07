# Roadmap

Ideas for future `deps-patrol` features, roughly ordered by expected impact. Nothing here is
committed — this is a backlog to pull from, not a schedule.

## Scanning

- **Test run per project** ✅ done — run each project's `test` script (if defined) after the
  dependency scan, installing dependencies first when scanning in a worktree. Surfaces a
  dedicated 🔥 status when the suite fails.
- **Lint/typecheck run per project** — same idea as the test run, but for `lint` / `typecheck`
  scripts. Would need its own status (or fold into 🔥) and its own config toggle, since not
  every project defines these scripts.
- **License compliance check** — flag dependencies with disallowed licenses (GPL, AGPL, etc.)
  using `<pm> licenses` or a dedicated scanner, with an allow/deny list in
  `deps-patrol.config.json`.
- **Configurable severity threshold for vulnerabilities** — currently hardcoded to
  high/critical; let `moderate` be opt-in via config.
- **Per-project overrides** — allow a project entry in `projects.json` to override global
  config (branch, concurrency weight, skip tests, skip audit) instead of only a global default.
- **Retry on transient failures** — registry timeouts or flaky installs currently just fail the
  project for that run; a bounded retry would reduce noise on large project lists.

## Reporting

- **Historical trend tracking** — persist each scan's results (e.g. append to a small SQLite
  file or dated JSON snapshots) so status changes over time can be graphed instead of only
  diffed against the previous run.
- **Slack/Discord/webhook notifications** — post a summary (or only regressions: new
  vulnerabilities, new test failures) to a webhook after each scan.
- **Markdown report format** — a `--format=markdown` output usable directly as a GitHub/GitLab
  issue or PR description.
- **Per-project detail pages in HTML report** — the current HTML report is a single flat table;
  linking each row to a detail view (outdated packages, vulnerabilities, test output) would
  make it useful without needing `--debug` logs.

## Performance & reliability

- **Incremental scans** — skip projects whose lockfile hash hasn't changed since the last run
  (cache keyed by lockfile hash + branch), useful for large project lists scanned frequently.
- **Persistent worktrees / dependency cache** — reuse a checked-out worktree and its
  `node_modules` across runs instead of recreating it every time, to make the test-run step
  above cheaper.
- **Global timeout / kill switch** — a top-level scan budget that stops remaining projects
  gracefully if the whole run is taking too long (useful in CI).

## Integrations

- **GitHub/GitLab project discovery** — populate `projects.json` from an org/group listing
  instead of requiring VS Code Project Manager as the source of truth.
- **CI mode** — a non-interactive mode that exits non-zero when any project is 🔴 or 🔥, for use
  as a scheduled CI job across a fleet of repos.
- **Auto-PR for minor/patch updates** — for projects with only 🟡 status, optionally open a PR
  bumping dependencies (e.g. via `<pm> update` + a bot commit) instead of just reporting them.
