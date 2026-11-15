"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseArgs, usage } = require("../installer/args");
const { loadCatalog } = require("../installer/catalog");
const { manifestPath, digestDestination } = require("../installer/manifest");
const {
  makeHome,
  makeCatalog,
  catalogFrom,
  registryFor,
  stateFor,
  plan,
} = require("./helpers");

function opsOf(result, op, agent) {
  return result.operations.filter(
    (operation) => operation.op === op && (!agent || operation.agent === agent)
  );
}

test("unknown flags fail without a request", () => {
  const registry = registryFor(makeHome(["claude"]));
  const parsed = parseArgs(["--clade"], registry);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unknown flag: --clade/);
});

test("help is registry-driven", () => {
  const registry = registryFor(makeHome([]));
  const text = usage(registry);
  for (const flag of ["--claude", "--opencode", "--codex", "--gemini"]) {
    assert.match(text, new RegExp(flag));
  }
});

test("default detection targets only detected agents", () => {
  const home = makeHome(["claude", "opencode"]);
  const registry = registryFor(home);
  const catalog = catalogFrom(makeCatalog());
  const result = plan({}, registry, catalog, {
    claude: true,
    opencode: true,
    codex: false,
    gemini: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets.sort(), ["claude", "opencode"]);
  assert.equal(opsOf(result, "install-skill").length, 2);
  assert.equal(opsOf(result, "install-command").length, 2);
  assert.equal(opsOf(result, "write-manifest").length, 2);
});

test("explicit agents target only those agents", () => {
  const registry = registryFor(makeHome([]));
  const catalog = catalogFrom(makeCatalog());
  const result = plan({ agents: ["codex"] }, registry, catalog, {
    claude: true,
    opencode: true,
    codex: false,
    gemini: true,
  });
  assert.deepEqual(result.targets, ["codex"]);
  assert.equal(opsOf(result, "install-skill").length, 1);
  assert.equal(opsOf(result, "install-command").length, 0);
  assert.equal(opsOf(result, "write-manifest").length, 1);
});

test("--all targets every registered agent", () => {
  const registry = registryFor(makeHome([]));
  const catalog = catalogFrom(makeCatalog());
  const result = plan({ all: true }, registry, catalog, {});
  assert.deepEqual(result.targets.sort(), ["claude", "codex", "gemini", "opencode"]);
  assert.equal(opsOf(result, "install-skill").length, 4);
  assert.equal(opsOf(result, "install-command").length, 2);
  assert.equal(opsOf(result, "write-manifest").length, 4);
});

test("no detected agent returns a no-target outcome", () => {
  const registry = registryFor(makeHome([]));
  const catalog = catalogFrom(makeCatalog());
  const result = plan({}, registry, catalog, {});
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "no-target");
  assert.match(result.error, /no agent detected/);
});

test("missing skills catalog is a hard error", () => {
  const dirs = makeCatalog();
  const result = loadCatalog({
    skillsDir: path.join(dirs.root, "absent"),
    commandsDir: dirs.commandsDir,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /skills catalog not found/);
});

test("missing commands catalog yields no command operations", () => {
  const dirs = makeCatalog({ noCommands: true });
  const catalog = catalogFrom(dirs);
  assert.equal(catalog.ok, true);
  assert.equal(catalog.commandsAvailable, false);
  const registry = registryFor(makeHome([]));
  const result = plan({ agents: ["claude"] }, registry, catalog, {});
  assert.equal(opsOf(result, "install-skill").length, 1);
  assert.equal(opsOf(result, "install-command").length, 0);
  assert.match(result.warnings.join("\n"), /commands catalog not found/);
});

test("command destinations follow the agent registry", () => {
  const home = makeHome([]);
  const registry = registryFor(home);
  const catalog = catalogFrom(makeCatalog());
  const result = plan({ all: true }, registry, catalog, {});
  const commandOps = opsOf(result, "install-command");
  assert.deepEqual(
    commandOps.map((operation) => operation.agent).sort(),
    ["claude", "opencode"]
  );
  for (const operation of commandOps) {
    const agent = registry[operation.agent];
    assert.equal(operation.destination, path.join(agent.commandsRoot, "bofh-golem.md"));
  }
});

test("planning does not write before apply", () => {
  const home = makeHome([]);
  const registry = registryFor(home);
  const catalog = catalogFrom(makeCatalog());
  const result = plan({ agents: ["claude"] }, registry, catalog, {});
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(manifestPath(registry.claude)), false);
  assert.equal(fs.existsSync(path.join(registry.claude.skillsRoot, "bofh-golem")), false);
});

test("install state marks recorded artifacts as modified", () => {
  const home = makeHome([]);
  const registry = registryFor(home);
  const catalog = catalogFrom(makeCatalog());
  fs.mkdirSync(path.join(registry.claude.skillsRoot, "bofh-golem"), { recursive: true });
  fs.writeFileSync(path.join(registry.claude.skillsRoot, "bofh-golem", "SKILL.md"), "edited\n");
  const state = stateFor(registry, ["claude"]);
  const destination = path.join(registry.claude.skillsRoot, "bofh-golem");
  state.claude.manifest = {
    schemaVersion: 1,
    agent: "claude",
    artifacts: [
      {
        type: "skill",
        name: "bofh-golem",
        destination,
        digest: "sha256:not-the-current-digest",
      },
    ],
  };
  state.claude.currentDigests["skill:bofh-golem"] = digestDestination("skill", destination);
  const result = require("../installer/plan").createPlan({
    request: { mode: "install", dryRun: false, force: false, all: false, agents: ["claude"] },
    registry,
    catalog,
    detection: {},
    state,
    manifestPaths: { claude: manifestPath(registry.claude) },
  });
  const skip = opsOf(result, "skip");
  assert.equal(skip.length, 1);
  assert.equal(skip[0].reason, "modified");
});
