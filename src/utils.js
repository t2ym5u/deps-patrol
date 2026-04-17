import { existsSync } from "node:fs";

export function getPackageManager(rootPath, pkgJson) {
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

export function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function parseNdjson(str) {
  return str
    .split("\n")
    .filter(Boolean)
    .map((line) => safeParseJson(line))
    .filter(Boolean);
}

export function parseYarnOutdated(stdout) {
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

export function normalizeOutdated(parsed) {
  // npm v7+ uses "type" instead of "dependencyType"
  for (const info of Object.values(parsed)) {
    if (info.type && !info.dependencyType) {
      info.dependencyType = info.type;
    }
  }
  return parsed;
}

export function analyzeOutdatedPackages(outdated) {
  let hasMajorOrDeprecated = false;

  for (const info of Object.values(outdated)) {
    const hasMajorUpdate =
      Number(info?.current?.split(".")?.[0]) < Number(info?.latest?.split(".")?.[0]);

    if (info.dependencyType === "dependencies" && (info.isDeprecated || hasMajorUpdate)) {
      hasMajorOrDeprecated = true;
    }
  }

  return hasMajorOrDeprecated;
}

export function computeStatus(hasVulnerabilities, outdatedCount, hasMajorOrDeprecated, statuses) {
  if (hasVulnerabilities) return statuses.VULNERABILITIES;
  if (outdatedCount === 0) return statuses.NO_UPDATES;
  return hasMajorOrDeprecated ? statuses.MAJOR_UPDATES : statuses.MINOR_OR_PATCH_UPDATES;
}
