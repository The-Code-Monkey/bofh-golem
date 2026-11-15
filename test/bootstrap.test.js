"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  readBootstrap,
  checkNodeFloor,
  defaultBootstrapPath,
  nodeMajor,
} = require("../installer/bootstrap");

const ROOT = path.join(__dirname, "..");

test("bootstrap metadata is valid", () => {
  const result = readBootstrap(defaultBootstrapPath());
  assert.equal(result.ok, true, result.error);
  assert.match(result.data.repo, /^[^/]+\/[^/]+$/);
  assert.ok(result.data.ref);
  assert.ok(Number.isInteger(result.data.node));
});

test("the canonical floor matches package.json engines", () => {
  const bootstrap = readBootstrap(defaultBootstrapPath()).data;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(nodeMajor(pkg.engines.node.replace(/[^0-9.]/g, "").split(".")[0]), bootstrap.node);
});

test("the floor check rejects old Node and accepts the floor", () => {
  assert.equal(checkNodeFloor("16.20.0", 18).ok, false);
  assert.equal(checkNodeFloor("18.0.0", 18).ok, true);
  assert.equal(checkNodeFloor("22.22.0", 18).ok, true);
});

test("malformed bootstrap metadata fails clearly", () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "bofh-bootstrap-"));
  const file = path.join(dir, "bootstrap.json");
  fs.writeFileSync(file, "{ nope");
  const result = readBootstrap(file);
  assert.equal(result.ok, false);
  assert.match(result.error, /malformed/);
});
