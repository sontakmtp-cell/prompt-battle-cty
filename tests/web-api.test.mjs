import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCloudBotVersion } from "../apps/web/dist/api.js";

test("cloud bot version normalization accepts SQLite snake_case API rows", () => {
  assert.deepEqual(normalizeCloudBotVersion({ revision: 3, package_hash: "abc123" }), {
    revision: 3,
    packageHash: "abc123",
  });
});

test("cloud bot version normalization preserves the camelCase response contract", () => {
  assert.deepEqual(normalizeCloudBotVersion({ revision: 4, packageHash: "def456" }), {
    revision: 4,
    packageHash: "def456",
  });
});
