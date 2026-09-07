import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { statuses } from "./statuses.js";
import {
  analyzeOutdatedPackages,
  computeStatus,
  getInstallArgs,
  hasTestScript,
  matchesProjectFilter,
  normalizeOutdated,
  parseNdjson,
  parseYarnOutdated,
  safeParseJson,
} from "./utils.js";

describe("safeParseJson", () => {
  it("parses valid JSON", () => {
    assert.deepEqual(safeParseJson('{"a":1}'), { a: 1 });
  });

  it("returns null for invalid JSON", () => {
    assert.equal(safeParseJson("not json"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(safeParseJson(""), null);
  });
});

describe("parseNdjson", () => {
  it("parses multiple JSON lines", () => {
    const input = '{"a":1}\n{"b":2}\n';
    assert.deepEqual(parseNdjson(input), [{ a: 1 }, { b: 2 }]);
  });

  it("skips invalid lines", () => {
    const input = '{"a":1}\nbad\n{"c":3}';
    assert.deepEqual(parseNdjson(input), [{ a: 1 }, { c: 3 }]);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parseNdjson(""), []);
  });
});

describe("parseYarnOutdated", () => {
  it("parses yarn classic NDJSON table format", () => {
    const table = {
      type: "table",
      data: {
        body: [
          ["lodash", "4.17.20", "4.17.21", "4.17.21", "dependencies"],
          ["react", "17.0.0", "17.0.2", "18.0.0", "dependencies"],
        ],
      },
    };
    const result = parseYarnOutdated(JSON.stringify(table));
    assert.deepEqual(result.lodash, {
      current: "4.17.20",
      wanted: "4.17.21",
      latest: "4.17.21",
      dependencyType: "dependencies",
    });
    assert.deepEqual(result.react, {
      current: "17.0.0",
      wanted: "17.0.2",
      latest: "18.0.0",
      dependencyType: "dependencies",
    });
  });

  it("returns empty object when no table found", () => {
    assert.deepEqual(parseYarnOutdated('{"type":"info"}'), {});
  });

  it("returns empty object for empty stdout", () => {
    assert.deepEqual(parseYarnOutdated(""), {});
  });
});

describe("normalizeOutdated", () => {
  it("maps type to dependencyType when dependencyType is missing", () => {
    const input = { lodash: { current: "4.0.0", latest: "4.1.0", type: "dependencies" } };
    const result = normalizeOutdated(input);
    assert.equal(result.lodash.dependencyType, "dependencies");
  });

  it("does not overwrite existing dependencyType", () => {
    const input = {
      lodash: {
        current: "4.0.0",
        latest: "4.1.0",
        type: "devDependencies",
        dependencyType: "dependencies",
      },
    };
    const result = normalizeOutdated(input);
    assert.equal(result.lodash.dependencyType, "dependencies");
  });
});

describe("analyzeOutdatedPackages", () => {
  it("returns false when no major updates or deprecations", () => {
    const outdated = {
      lodash: { current: "4.17.20", latest: "4.17.21", dependencyType: "dependencies" },
    };
    assert.equal(analyzeOutdatedPackages(outdated), false);
  });

  it("returns true for a major update in dependencies", () => {
    const outdated = {
      react: { current: "17.0.0", latest: "18.0.0", dependencyType: "dependencies" },
    };
    assert.equal(analyzeOutdatedPackages(outdated), true);
  });

  it("returns false for a major update in devDependencies", () => {
    const outdated = {
      vite: { current: "4.0.0", latest: "5.0.0", dependencyType: "devDependencies" },
    };
    assert.equal(analyzeOutdatedPackages(outdated), false);
  });

  it("returns true for a deprecated package in dependencies", () => {
    const outdated = {
      "old-pkg": {
        current: "1.0.0",
        latest: "1.0.0",
        dependencyType: "dependencies",
        isDeprecated: true,
      },
    };
    assert.equal(analyzeOutdatedPackages(outdated), true);
  });

  it("returns false for empty outdated map", () => {
    assert.equal(analyzeOutdatedPackages({}), false);
  });
});

describe("computeStatus", () => {
  it("returns VULNERABILITIES when vulnerabilities present", () => {
    assert.equal(computeStatus(false, true, 2, false, statuses), statuses.VULNERABILITIES);
  });

  it("returns NO_UPDATES when no outdated packages", () => {
    assert.equal(computeStatus(false, false, 0, false, statuses), statuses.NO_UPDATES);
  });

  it("returns MAJOR_UPDATES when major updates present", () => {
    assert.equal(computeStatus(false, false, 3, true, statuses), statuses.MAJOR_UPDATES);
  });

  it("returns MINOR_OR_PATCH_UPDATES when only minor/patch updates", () => {
    assert.equal(computeStatus(false, false, 2, false, statuses), statuses.MINOR_OR_PATCH_UPDATES);
  });

  it("prioritizes vulnerabilities over major updates", () => {
    assert.equal(computeStatus(false, true, 3, true, statuses), statuses.VULNERABILITIES);
  });

  it("returns TESTS_FAILED when tests failed", () => {
    assert.equal(computeStatus(true, false, 0, false, statuses), statuses.TESTS_FAILED);
  });

  it("prioritizes TESTS_FAILED over vulnerabilities", () => {
    assert.equal(computeStatus(true, true, 3, true, statuses), statuses.TESTS_FAILED);
  });
});

describe("hasTestScript", () => {
  it("returns true when a test script is defined", () => {
    assert.equal(hasTestScript({ scripts: { test: "vitest run" } }), true);
  });

  it("returns false when no scripts field is present", () => {
    assert.equal(hasTestScript({}), false);
  });

  it("returns false for npm's default placeholder test script", () => {
    assert.equal(
      hasTestScript({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
      false
    );
  });
});

describe("getInstallArgs", () => {
  it("returns ci for npm when a lockfile is present", () => {
    assert.deepEqual(getInstallArgs("npm", true), ["ci"]);
  });

  it("returns install for npm when no lockfile is present", () => {
    assert.deepEqual(getInstallArgs("npm", false), ["install"]);
  });

  it("returns frozen-lockfile install for yarn/pnpm/bun", () => {
    assert.deepEqual(getInstallArgs("yarn", true), ["install", "--frozen-lockfile"]);
    assert.deepEqual(getInstallArgs("pnpm", true), ["install", "--frozen-lockfile"]);
    assert.deepEqual(getInstallArgs("bun", true), ["install", "--frozen-lockfile"]);
  });
});

describe("matchesProjectFilter", () => {
  const separator = "  ";

  it("returns true when no filter is set", () => {
    assert.equal(matchesProjectFilter("🟢  my-app", null, separator), true);
  });

  it("matches a substring of the project name, case-insensitively", () => {
    assert.equal(matchesProjectFilter("🟢  My-App  1.0.0", "my-app", separator), true);
    assert.equal(matchesProjectFilter("🟢  My-App  1.0.0", "APP", separator), true);
  });

  it("returns false when the filter does not match", () => {
    assert.equal(matchesProjectFilter("🟢  my-app  1.0.0", "other", separator), false);
  });

  it("falls back to the raw name when there is no status prefix", () => {
    assert.equal(matchesProjectFilter("my-app", "app", separator), true);
    assert.equal(matchesProjectFilter("my-app", "other", separator), false);
  });
});
