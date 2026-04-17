import { existsSync, readFileSync } from "node:fs";

const CONFIG_PATH = "./deps-patrol.config.json";

if (!existsSync(CONFIG_PATH)) {
  console.error(`❌ Config file not found: ${CONFIG_PATH}`);
  console.error("   Run: cp deps-patrol.config.json.sample deps-patrol.config.json");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
} catch (err) {
  console.error(`❌ Failed to parse config file: ${err.message}`);
  process.exit(1);
}

if (!config.projects) {
  console.error("❌ Config missing required field: projects");
  process.exit(1);
}

const cliArgs = process.argv.slice(2);

if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
  console.log(`
deps-patrol — scan project dependencies for outdated packages and vulnerabilities

Usage:
  pnpm run scan [options]
  pnpm run clean [options]

Options:
  --debug              Enable debug output (equivalent to logLevel: "debug")
  --dry-run            Do not write changes to disk
  --branch=<name>      Override branch to scan (e.g. --branch=main)
  --format=<fmt>       Output format: json (default), csv, html
  --concurrency=<n>    Number of projects to scan in parallel (default: 4)
  -h, --help           Show this help message

Config file: deps-patrol.config.json
  {
    "debug": false,
    "logLevel": "info",     // error | warn | info | debug
    "dryRun": false,
    "format": "json",       // json | csv | html
    "concurrency": 4,
    "projects": "/path/to/projects.json",
    "output": "./deps-patrol.json"
  }
`);
  process.exit(0);
}

export const DEBUG = cliArgs.includes("--debug") || (config.debug ?? false);

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const rawLevel = DEBUG ? "debug" : (config.logLevel ?? "info");

const effectiveLevel = LEVELS[rawLevel] ?? LEVELS.info;

export const LOGLEVEL = rawLevel;

export function log(level, ...args) {
  if ((LEVELS[level] ?? LEVELS.debug) <= effectiveLevel) {
    console.log(...args);
  }
}

export const DRY_RUN = cliArgs.includes("--dry-run") || (config.dryRun ?? false);

const branchArg = cliArgs.find((a) => a.startsWith("--branch="));
const branchFlagIdx = cliArgs.indexOf("--branch");
export const BRANCH =
  branchArg?.split("=")?.[1] ??
  (branchFlagIdx !== -1 ? cliArgs[branchFlagIdx + 1] : null) ??
  config.branch ??
  null;

const formatArg = cliArgs.find((a) => a.startsWith("--format="));
export const FORMAT = formatArg?.split("=")?.[1] ?? config.format ?? "json";

const concurrencyArg = cliArgs.find((a) => a.startsWith("--concurrency="));
const rawConcurrency = concurrencyArg?.split("=")?.[1] ?? config.concurrency ?? 4;
export const CONCURRENCY = Math.max(1, Number(rawConcurrency) || 4);

export const projectFilePath = config.projects;
export const output = config.output ?? "./deps-patrol.json";
export const separator = "  ";
