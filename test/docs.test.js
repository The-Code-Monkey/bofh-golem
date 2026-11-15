"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { checkDocs } = require("../scripts/check-docs.js");

const ROOT = path.join(__dirname, "..");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bofh-docs-"));
  fs.copyFileSync(path.join(ROOT, "AGENTS.md"), path.join(dir, "AGENTS.md"));
  fs.copyFileSync(path.join(ROOT, "CLAUDE.md"), path.join(dir, "CLAUDE.md"));
  return dir;
}

test("current instructions pass", () => {
  const result = checkDocs(ROOT);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("missing required section fails", () => {
  const dir = fixture();
  const file = path.join(dir, "AGENTS.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^## Verify\s*$/m, "## Checks"));
  const result = checkDocs(dir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Verify/);
});

test("pointer with the wrong target fails", () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# CLAUDE.md\n\nRead README.md.\n");
  const result = checkDocs(dir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /does not reference AGENTS\.md/);
});

test("pointer that duplicates full content fails", () => {
  const dir = fixture();
  fs.copyFileSync(path.join(dir, "AGENTS.md"), path.join(dir, "CLAUDE.md"));
  const result = checkDocs(dir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicates|byte-identical|too long/);
});

test("missing pointer fails", () => {
  const dir = fixture();
  fs.unlinkSync(path.join(dir, "CLAUDE.md"));
  const result = checkDocs(dir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /CLAUDE\.md is missing/);
});
