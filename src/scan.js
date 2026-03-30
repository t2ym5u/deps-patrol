import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { DRY_RUN, log, output, projectFilePath, separator } from "./config.js";
import { statuses } from "./statuses.js";

const projects = JSON.parse(readFileSync(projectFilePath, "utf-8"));

function getPackageManager(rootPath, pkgJson) {
  return (
    pkgJson.packageManager?.split("@")?.[0] ??
    (existsSync(`${rootPath}/bun.lockb`) || existsSync(`${rootPath}/bun.lock`)
      ? "bun"
      : existsSync(`${rootPath}/yarn.lock`)
        ? "yarn"
        : existsSync(`${rootPath}/pnpm-lock.yaml`)
          ? "pnpm"
          : "npm")
  );
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function parseNdjson(str) {
  return str
    .split("\n")
    .filter(Boolean)
    .map((line) => safeParseJson(line))
    .filter(Boolean);
}

function parseYarnOutdated(stdout) {
  const lines = parseNdjson(stdout);
  const table = lines.find((l) => l.type === "table");
  if (!table?.data?.body) return {};

  const outdated = {};
  for (const row of table.data.body) {
    const [name, current, wanted, latest, packageType] = row;
    outdated[name] = { current, wanted, latest, dependencyType: packageType };
  }
  return outdated;
}

function normalizeOutdated(parsed) {
  // npm v7+ uses "type" instead of "dependencyType"
  for (const info of Object.values(parsed)) {
    if (info.type && !info.dependencyType) {
      info.dependencyType = info.type;
    }
  }
  return parsed;
}

function getOutdatedPackages(rootPath, packageManager) {
  const result = spawnSync(packageManager, ["outdated", "--json"], {
    cwd: rootPath,
  });

  const stdout = result?.stdout?.toString() || "";

  if (packageManager === "yarn") return parseYarnOutdated(stdout);

  return normalizeOutdated(safeParseJson(stdout) || {});
}

function getAuditVulnerabilities(rootPath, packageManager) {
  const result = spawnSync(packageManager, ["audit", "--json"], {
    cwd: rootPath,
  });

  const stdout = result?.stdout?.toString() || "";

  // yarn classic outputs NDJSON with auditAdvisory lines
  if (packageManager === "yarn") {
    const lines = parseNdjson(stdout);
    return lines
      .filter((l) => l.type === "auditAdvisory")
      .map((l) => l.data.advisory)
      .filter((adv) => adv.severity === "high" || adv.severity === "critical");
  }

  const audit = safeParseJson(stdout);
  if (!audit) return [];

  // npm v6 / pnpm format
  if (audit.advisories) {
    return Object.values(audit.advisories).filter(
      (adv) => adv.severity === "high" || adv.severity === "critical"
    );
  }

  // npm v7+ format
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

function analyzeOutdatedPackages(outdated) {
  let hasMajorOrDeprecated = false;

  for (const [pkg, info] of Object.entries(outdated)) {
    log(`    - ${pkg}: ${info.current} -> ${info.latest}`);

    const hasMajorUpdate =
      Number(info?.current?.split(".")?.[0]) < Number(info?.latest?.split(".")?.[0]);

    const needsAttention =
      info.dependencyType === "dependencies" && (info.isDeprecated || hasMajorUpdate);

    if (needsAttention) {
      hasMajorOrDeprecated = true;
      log(`      ⚠️  Major update or deprecated package detected!`);
    }
  }

  return hasMajorOrDeprecated;
}

function logVulnerabilities(vulnerabilities) {
  if (vulnerabilities.length > 0) {
    log(`    ⚠️  ${vulnerabilities.length} high/critical vulnerabilities found!`);
    for (const vuln of vulnerabilities) {
      log(`      - [${vuln.severity}] ${vuln.module_name}: ${vuln.title} (${vuln.url})`);
    }
  } else {
    log("    ✅ No high or critical vulnerabilities found!");
  }
}

function computeStatus(hasVulnerabilities, outdatedCount, hasMajorOrDeprecated) {
  if (hasVulnerabilities) return statuses.VULNERABILITIES;
  if (outdatedCount === 0) return statuses.NO_UPDATES;
  return hasMajorOrDeprecated ? statuses.MAJOR_UPDATES : statuses.MINOR_OR_PATCH_UPDATES;
}

function scanProject(project) {
  const nameParts = project.name.split(separator);
  const [oldStatus, projectName] =
    nameParts.length >= 2 ? nameParts : [statuses.MISSING, project.name];

  if (project.enabled === false) {
    return;
  }

  log("");
  log("");
  log(`📁 ${project.name}`);
  log("");
  log(`  ${project.rootPath}`);
  log(`  🏷️  ${project.tags?.join(", ") ?? ""}`);
  log("");

  if (!existsSync(`${project.rootPath}/package.json`)) {
    project.name = [oldStatus, projectName].join(separator);
    log("No package.json found, skipping...");
    return;
  }

  const pkgJson = JSON.parse(readFileSync(`${project.rootPath}/package.json`, "utf-8"));
  const packageManager = getPackageManager(project.rootPath, pkgJson);

  log("  ⚡️ Outdated packages:");
  const outdated = getOutdatedPackages(project.rootPath, packageManager);
  log(`  ${Object.keys(outdated).length} outdated package(s)`);

  const hasMajorOrDeprecated = analyzeOutdatedPackages(outdated);
  log(
    hasMajorOrDeprecated
      ? "    ⚠️  Some packages need attention!"
      : "    ✅ All packages are up to date!"
  );

  const vulnerabilities = getAuditVulnerabilities(project.rootPath, packageManager);
  logVulnerabilities(vulnerabilities);

  const status = computeStatus(
    vulnerabilities.length > 0,
    Object.keys(outdated).length,
    hasMajorOrDeprecated
  );

  if (status !== oldStatus) {
    log(`  Status changed: ${oldStatus} → ${status}`);
  }

  project.name = [status, projectName, pkgJson.version].join(separator);
  // log(`  → ${project.name}`);
}

for (const project of projects) {
  scanProject(project);
}

if (!DRY_RUN) {
  copyFileSync(projectFilePath, output);
  writeFileSync(projectFilePath, JSON.stringify(projects, null, 2));
}
console.log("✅ Projects file updated.");
