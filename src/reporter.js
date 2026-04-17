import { separator } from "./config.js";
import { statuses } from "./statuses.js";

function parseName(name) {
  const parts = name?.split(separator) ?? [];
  if (parts.length >= 2) {
    return { status: parts[0], projectName: parts[1] };
  }
  return { status: statuses.MISSING, projectName: name ?? "" };
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeCsv(str) {
  return `"${String(str).replace(/"/g, '""')}"`;
}

export function formatJson(projects) {
  return JSON.stringify(projects, null, 2);
}

export function formatCsv(projects) {
  const headers = ["status", "name", "path", "tags"].join(",");
  const rows = projects.map((p) => {
    const { status, projectName } = parseName(p.name);
    return [
      escapeCsv(status),
      escapeCsv(projectName),
      escapeCsv(p.rootPath ?? ""),
      escapeCsv((p.tags ?? []).join(";")),
    ].join(",");
  });
  return [headers, ...rows].join("\n");
}

export function formatHtml(projects) {
  const rows = projects
    .map((p) => {
      const { status, projectName } = parseName(p.name);
      return `    <tr>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(projectName)}</td>
      <td>${escapeHtml(p.rootPath ?? "")}</td>
      <td>${escapeHtml((p.tags ?? []).join(", "))}</td>
    </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>deps-patrol report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>deps-patrol report</h1>
  <table>
    <thead>
      <tr><th>Status</th><th>Project</th><th>Path</th><th>Tags</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
}

export function formatReport(projects, format) {
  if (format === "csv") return formatCsv(projects);
  if (format === "html") return formatHtml(projects);
  return formatJson(projects);
}
