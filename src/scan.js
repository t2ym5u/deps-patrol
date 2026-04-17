import { execFile, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  BRANCH,
  CONCURRENCY,
  DRY_RUN,
  FORMAT,
  log,
  output,
  projectFilePath,
  separator,
} from "./config.js";
import { formatReport } from "./reporter.js";
import { statuses } from "./statuses.js";
import {
  analyzeOutdatedPackages,
  computeStatus,
  getPackageManager,
  normalizeOutdated,
  parseNdjson,
  parseYarnOutdated,
  safeParseJson,
} from "./utils.js";

const execFileAsync = promisify(execFile);
const SPAWN_TIMEOUT = 120_000;

// Track active worktrees for cleanup on unexpected exit
const activeWorktrees = new Map();

function cleanupWorktrees() {
  for (const [worktreePath, repoPath] of activeWorktrees) {
    try {
      spawnSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoPath });
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {}
  }
  activeWorktrees.clear();
}

process.on("exit", cleanupWorktrees);
process.on("SIGINT", () => {
  cleanupWorktrees();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanupWorktrees();
  process.exit(143);
});

function createWorktree(repoPath, branch) {
  const tmpDir = mkdtempSync(join(tmpdir(), "deps-patrol-"));
  const result = spawnSync("git", ["worktree", "add", "--detach", tmpDir, branch], {
    cwd: repoPath,
  });
  if (result.status !== 0) {
    log("warn", `  ⚠️  Git worktree error: ${result.stderr?.toString().trim()}`);
    rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }
  activeWorktrees.set(tmpDir, repoPath);
  return tmpDir;
}

function removeWorktree(repoPath, worktreePath) {
  spawnSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoPath });
  rmSync(worktreePath, { recursive: true, force: true });
  activeWorktrees.delete(worktreePath);
}

async function getOutdatedPackages(rootPath, packageManager) {
  let stdout = "";
  try {
    const result = await execFileAsync(packageManager, ["outdated", "--json"], {
      cwd: rootPath,
      timeout: SPAWN_TIMEOUT,
    });
    stdout = result.stdout;
  } catch (err) {
    if (err.code === "ETIMEDOUT") {
      log("warn", `  ⚠️  ${packageManager} outdated timed out after ${SPAWN_TIMEOUT / 1000}s`);
      return {};
    }
    // outdated exits with code 1 when packages are outdated — stdout still has JSON
    stdout = err.stdout ?? "";
  }

  if (packageManager === "yarn") return parseYarnOutdated(stdout);

  const parsed = safeParseJson(stdout);
  if (stdout && !parsed) {
    log("debug", "  ⚠️  Failed to parse outdated output as JSON");
  }
  return normalizeOutdated(parsed || {});
}

async function getAuditVulnerabilities(rootPath, packageManager) {
  let stdout = "";
  try {
    const result = await execFileAsync(packageManager, ["audit", "--json"], {
      cwd: rootPath,
      timeout: SPAWN_TIMEOUT,
    });
    stdout = result.stdout;
  } catch (err) {
    if (err.code === "ETIMEDOUT") {
      log("warn", `  ⚠️  ${packageManager} audit timed out after ${SPAWN_TIMEOUT / 1000}s`);
      return [];
    }
    // audit exits with non-zero when vulnerabilities are found — stdout still has JSON
    stdout = err.stdout ?? "";
  }

  if (packageManager === "yarn") {
    const lines = parseNdjson(stdout);
    return lines
      .filter((l) => l.type === "auditAdvisory")
      .map((l) => l.data.advisory)
      .filter((adv) => adv.severity === "high" || adv.severity === "critical");
  }

  const audit = safeParseJson(stdout);
  if (stdout && !audit) {
    log("debug", "  ⚠️  Failed to parse audit output as JSON");
    return [];
  }
  if (!audit) return [];

  if (audit.advisories) {
    return Object.values(audit.advisories).filter(
      (adv) => adv.severity === "high" || adv.severity === "critical"
    );
  }

  if (audit.vulnerabilities) {
    return Object.values(audit.vulnerabilities)
      .filter((vuln) => vuln.severity === "high" || vuln.severity === "critical")
      .map((vuln) => ({
        module_name: vuln.name,
        severity: vuln.severity,
        title: vuln.via?.find((v) => typeof v === "object")?.title ?? "Unknown",
        url: vuln.via?.find((v) => typeof v === "object")?.url ?? "",
      }));
  }

  return [];
}

async function analyzeProject(scanPath, packageManager) {
  log("debug", "  ⚡️ Running outdated + audit in parallel...");

  const [outdated, vulnerabilities] = await Promise.all([
    getOutdatedPackages(scanPath, packageManager),
    getAuditVulnerabilities(scanPath, packageManager),
  ]);

  const outdatedCount = Object.keys(outdated).length;
  log("info", `  ${outdatedCount} outdated package(s)`);

  for (const [pkg, info] of Object.entries(outdated)) {
    log("debug", `    - ${pkg}: ${info.current} -> ${info.latest}`);
  }

  const hasMajorOrDeprecated = analyzeOutdatedPackages(outdated);
  log(
    "info",
    hasMajorOrDeprecated
      ? "    ⚠️  Some packages need attention!"
      : "    ✅ All packages are up to date!"
  );

  if (vulnerabilities.length > 0) {
    log("info", `    ⚠️  ${vulnerabilities.length} high/critical vulnerabilities found!`);
    for (const vuln of vulnerabilities) {
      log("info", `      - [${vuln.severity}] ${vuln.module_name}: ${vuln.title} (${vuln.url})`);
    }
  } else {
    log("info", "    ✅ No high or critical vulnerabilities found!");
  }

  return { outdated, hasMajorOrDeprecated, vulnerabilities };
}

function resolveWorktree(rootPath, branch) {
  const fallback = branch === "main" ? "master" : branch === "master" ? "main" : null;
  const worktreePath = createWorktree(rootPath, branch);
  if (worktreePath) return { worktreePath, usedBranch: branch };
  if (!fallback) return { worktreePath: null, usedBranch: branch };
  return { worktreePath: createWorktree(rootPath, fallback), usedBranch: fallback };
}

function setupScanPath(rootPath, branch) {
  if (!branch) return { scanPath: rootPath, worktreePath: null };
  const { worktreePath, usedBranch } = resolveWorktree(rootPath, branch);
  if (worktreePath) {
    log("info", `  📌 Branch: ${usedBranch}`);
    return { scanPath: worktreePath, worktreePath };
  }
  log("warn", `  ⚠️  Could not checkout branch "${branch}", using current state`);
  return { scanPath: rootPath, worktreePath: null };
}

async function runScan(project, scanPath, branch, oldStatus, projectName) {
  if (!existsSync(`${scanPath}/package.json`)) {
    project.name = [oldStatus, projectName].join(separator);
    log("info", "  No package.json found, skipping...");
    return;
  }

  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(`${scanPath}/package.json`, "utf-8"));
  } catch (err) {
    log("warn", `  ⚠️  Failed to read package.json: ${err.message}`);
    return;
  }

  const packageManager = getPackageManager(scanPath, pkgJson);
  const { outdated, hasMajorOrDeprecated, vulnerabilities } = await analyzeProject(
    scanPath,
    packageManager
  );

  const status = computeStatus(
    vulnerabilities.length > 0,
    Object.keys(outdated).length,
    hasMajorOrDeprecated,
    statuses
  );

  if (status !== oldStatus) {
    console.log(`${oldStatus} → ${status} | ${projectName}`);
    log("info", `  Status changed: ${oldStatus} → ${status}`);
  }

  if (!branch) {
    project.name = [status, projectName, pkgJson.version].join(separator);
  }
}

async function scanProject(project) {
  if (project.enabled === false) return;

  const nameParts = project.name.split(separator);
  const [oldStatus, projectName] =
    nameParts.length >= 2 ? nameParts : [statuses.MISSING, project.name];

  log("debug", "");
  log("info", `📁 ${project.name}`);
  log("debug", `  ${project.rootPath}`);
  log("debug", `  🏷️  ${project.tags?.join(", ") ?? ""}`);
  log("debug", "");

  const branch = project.branch ?? BRANCH;
  const { scanPath, worktreePath } = setupScanPath(project.rootPath, branch);

  try {
    await runScan(project, scanPath, branch, oldStatus, projectName);
  } finally {
    if (worktreePath) removeWorktree(project.rootPath, worktreePath);
  }
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

let projects;
try {
  projects = JSON.parse(readFileSync(projectFilePath, "utf-8"));
} catch (err) {
  console.error(`❌ Failed to read projects file: ${err.message}`);
  process.exit(1);
}

const tasks = projects.map((project) => () => scanProject(project));
await runWithConcurrency(tasks, CONCURRENCY);

if (!DRY_RUN && !BRANCH) {
  copyFileSync(projectFilePath, output);
  writeFileSync(projectFilePath, JSON.stringify(projects, null, 2));

  if (FORMAT !== "json") {
    const reportPath = output.replace(/\.json$/, `.${FORMAT}`);
    writeFileSync(reportPath, formatReport(projects, FORMAT));
  }
}
console.log("✅ Projects file updated.");
