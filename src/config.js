import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("./deps-patrol.config.json", "utf-8"));

const cliArgs = process.argv.slice(2);

export const DEBUG = cliArgs.includes("--debug") || (config.debug ?? false);
export const DRY_RUN = cliArgs.includes("--dry-run") || (config.dryRun ?? false);
export const projectFilePath = config.projects;
export const output = config.output ?? "./deps-patrol.json";
export const separator = "  ";

export function log(...args) {
  if (DEBUG) console.log(...args);
}
