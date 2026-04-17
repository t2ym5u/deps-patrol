import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { statuses } from "./statuses.js";
import {
  analyzeOutdatedPackages,
  computeStatus,
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
    assert.equal(computeStatus(true, 2, false, statuses), statuses.VULNERABILITIES);
  });

  it("returns NO_UPDATES when no outdated packages", () => {
    assert.equal(computeStatus(false, 0, false, statuses), statuses.NO_UPDATES);
  });

  it("returns MAJOR_UPDATES when major updates present", () => {
    assert.equal(computeStatus(false, 3, true, statuses), statuses.MAJOR_UPDATES);
  });

  it("returns MINOR_OR_PATCH_UPDATES when only minor/patch updates", () => {
    assert.equal(computeStatus(false, 2, false, statuses), statuses.MINOR_OR_PATCH_UPDATES);
  });

  it("prioritizes vulnerabilities over major updates", () => {
    assert.equal(computeStatus(true, 3, true, statuses), statuses.VULNERABILITIES);
  });
});
