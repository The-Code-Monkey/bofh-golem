"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { makeHome } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const INSTALLER = path.join(ROOT, "installer", "install.js");

function run(args, home, extra) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, ...(extra && extra.env) },
  });
}

test("unknown flags exit nonzero and write nothing", () => {
  const home = makeHome(["claude"]);
  const result = run(["--clade"], home);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown flag: --clade/);
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "bofh-golem")), false);
});

test("no detected agents exits nonzero with a clear message", () => {
  const home = makeHome([]);
  const result = run([], home);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no agent detected/);
});

test("--list reports skill and command destinations", () => {
  const home = makeHome([]);
  const result = run(["--list"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Claude Code: .*skills=.*commands=/);
  assert.match(result.stdout, /OpenCode: .*skills=.*commands=/);
  assert.match(result.stdout, /Codex: .*skills=.*commands=\(none\)/);
  assert.match(result.stdout, /Gemini CLI: .*skills=.*commands=\(none\)/);
});

test("install writes a manifest and uninstall removes it", () => {
  const home = makeHome([]);
  const install = run(["--claude"], home);
  assert.equal(install.status, 0, install.stderr);
  const manifest = path.join(home, ".claude", "skills", ".bofh-golem-manifest.json");
  assert.ok(fs.existsSync(manifest));
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "bofh-golem", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "bofh-golem.md")));

  const uninstall = run(["--claude", "--uninstall"], home);
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(fs.existsSync(manifest), false);
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "bofh-golem")), false);
  assert.equal(fs.existsSync(path.join(home, ".claude", "commands", "bofh-golem.md")), false);
});

test("dry run prints the plan and changes nothing", () => {
  const home = makeHome([]);
  const result = run(["--claude", "--dry-run"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[dry-run\] install skill bofh-golem/);
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "bofh-golem")), false);
  assert.equal(
    fs.existsSync(path.join(home, ".claude", "skills", ".bofh-golem-manifest.json")),
    false
  );
});

test("a malformed manifest exits nonzero before writing", () => {
  const home = makeHome([]);
  const root = path.join(home, ".claude", "skills");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, ".bofh-golem-manifest.json"), "{ broken");
  const result = run(["--claude", "--uninstall"], home);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /malformed manifest/);
  assert.equal(fs.existsSync(path.join(root, "bofh-golem")), false);
});

test("the installer rejects Node below the bootstrap floor", () => {
  const home = makeHome([]);
  const result = spawnSync(
    process.execPath,
    ["--require", path.join(__dirname, "support", "old-node.js"), INSTALLER, "--version"],
    { encoding: "utf8", env: { ...process.env, HOME: home } }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node 16 too old\. Need Node >=18/);
});
