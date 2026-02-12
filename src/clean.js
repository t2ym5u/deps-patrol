import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

import { DRY_RUN, output, projectFilePath, separator } from "./config.js";
import { statuses } from "./statuses.js";

const projects = JSON.parse(readFileSync(projectFilePath, "utf-8"));

for (const project of projects) {
  const nameParts = project.name.split(separator);
  const [, projectName] = nameParts.length >= 2 ? nameParts : [statuses.MISSING, project.name];

  project.name = projectName;
}

if (!DRY_RUN) {
  copyFileSync(projectFilePath, output);
  writeFileSync(projectFilePath, JSON.stringify(projects, null, 2));
}

console.log("✅ Projects file cleaned.");
