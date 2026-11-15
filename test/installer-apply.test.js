"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { applyOperations } = require("../installer/apply");
const { createPlan } = require("../installer/plan");
const {
  manifestPath,
  readManifest,
  writeManifestAtomic,
  digestDestination,
} = require("../installer/manifest");
const {
  makeHome,
  makeCatalog,
  catalogFrom,
  registryFor,
  stateFor,
} = require("./helpers");

function buildPlan(registry, catalog, options) {
  const request = {
    mode: "install",
    dryRun: false,
    force: false,
    all: false,
    agents: ["claude"],
    ...options,
  };
  return createPlan({
    request,
    registry,
    catalog,
    detection: {},
    state: stateFor(registry, request.agents),
    manifestPaths: { claude: manifestPath(registry.claude) },
  });
}

function apply(registry, plan, options) {
  return applyOperations(plan.operations, {
    registry,
    dryRun: Boolean(options && options.dryRun),
    log: () => {},
  });
}

function setup(options) {
  const home = makeHome([]);
  const registry = registryFor(home);
  const dirs = makeCatalog(options);
  const catalog = catalogFrom(dirs);
  return { home, registry, dirs, catalog };
}

function installedSkill(registry, name) {
  return path.join(registry.claude.skillsRoot, name || "bofh-golem");
}

test("fresh install writes artifacts and a versioned manifest", () => {
  const { registry, catalog } = setup();
  const plan = buildPlan(registry, catalog);
  const result = apply(registry, plan);
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(installedSkill(registry), "SKILL.md")));
  assert.ok(
    fs.existsSync(path.join(registry.claude.commandsRoot, "bofh-golem.md"))
  );
  const read = readManifest(registry.claude);
  assert.equal(read.ok, true);
  assert.equal(read.manifest.schemaVersion, 1);
  assert.equal(read.manifest.agent, "claude");
  assert.equal(read.manifest.artifacts.length, 2);
  for (const artifact of read.manifest.artifacts) {
    assert.ok(artifact.destination);
    assert.match(artifact.digest, /^sha256:/);
  }
  assert.equal(
    fs.readdirSync(registry.claude.skillsRoot).some((name) => name.endsWith(".tmp")),
    false
  );
});

test("reinstall updates the manifest to the new artifact set", () => {
  const { registry, dirs, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.writeFileSync(path.join(dirs.skillsDir, "bofh-golem", "SKILL.md"), "# changed\n");
  const nextCatalog = catalogFrom(dirs);
  assert.equal(apply(registry, buildPlan(registry, nextCatalog)).ok, true);
  const read = readManifest(registry.claude);
  const artifact = read.manifest.artifacts.find((entry) => entry.type === "skill");
  assert.equal(
    artifact.digest,
    digestDestination("skill", installedSkill(registry))
  );
  assert.equal(
    fs.readFileSync(path.join(installedSkill(registry), "SKILL.md"), "utf8"),
    "# changed\n"
  );
});

test("modified artifacts are skipped unless forced", () => {
  const { registry, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  const before = readManifest(registry.claude).manifest;
  fs.writeFileSync(path.join(installedSkill(registry), "SKILL.md"), "local edit\n");

  const skipped = buildPlan(registry, catalog);
  const skip = skipped.operations.find(
    (operation) => operation.op === "skip" && operation.reason === "modified"
  );
  assert.ok(skip);
  assert.equal(apply(registry, skipped).ok, true);
  assert.equal(
    fs.readFileSync(path.join(installedSkill(registry), "SKILL.md"), "utf8"),
    "local edit\n"
  );
  assert.deepEqual(readManifest(registry.claude).manifest.artifacts, before.artifacts);

  const forced = buildPlan(registry, catalog, { force: true });
  assert.equal(apply(registry, forced).ok, true);
  assert.notEqual(
    fs.readFileSync(path.join(installedSkill(registry), "SKILL.md"), "utf8"),
    "local edit\n"
  );
});

test("uninstall removes exactly the recorded artifacts", () => {
  const { registry, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  const plan = buildPlan(registry, catalog, { mode: "uninstall" });
  assert.equal(apply(registry, plan).ok, true);
  assert.equal(fs.existsSync(installedSkill(registry)), false);
  assert.equal(
    fs.existsSync(path.join(registry.claude.commandsRoot, "bofh-golem.md")),
    false
  );
  assert.equal(fs.existsSync(manifestPath(registry.claude)), false);
});

test("uninstall after a rename uses the manifest, not the catalog", () => {
  const { registry, dirs, catalog } = setup({ skills: ["bofh-old"], commands: ["bofh-old.md"] });
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.renameSync(path.join(dirs.skillsDir, "bofh-old"), path.join(dirs.skillsDir, "bofh-new"));
  fs.renameSync(
    path.join(dirs.commandsDir, "bofh-old.md"),
    path.join(dirs.commandsDir, "bofh-new.md")
  );
  const renamed = catalogFrom(dirs);
  const plan = buildPlan(registry, renamed, { mode: "uninstall" });
  assert.equal(apply(registry, plan).ok, true);
  assert.equal(fs.existsSync(installedSkill(registry, "bofh-old")), false);
  assert.equal(
    fs.existsSync(path.join(registry.claude.commandsRoot, "bofh-old.md")),
    false
  );
});

test("install reconciles an artifact removed from the catalog", () => {
  const { registry, dirs, catalog } = setup({
    skills: ["bofh-golem", "bofh-stale"],
    commands: ["bofh-golem.md", "bofh-stale.md"],
  });
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.rmSync(path.join(dirs.skillsDir, "bofh-stale"), { recursive: true });
  fs.rmSync(path.join(dirs.commandsDir, "bofh-stale.md"));
  const nextCatalog = catalogFrom(dirs);
  assert.equal(apply(registry, buildPlan(registry, nextCatalog)).ok, true);
  assert.equal(fs.existsSync(installedSkill(registry, "bofh-stale")), false);
  assert.equal(
    fs.existsSync(path.join(registry.claude.commandsRoot, "bofh-stale.md")),
    false
  );
  const names = readManifest(registry.claude).manifest.artifacts.map(
    (artifact) => artifact.name
  );
  assert.deepEqual(names.sort(), ["bofh-golem", "bofh-golem.md"]);
});

test("a missing commands catalog leaves recorded commands alone", () => {
  const { registry, dirs, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.rmSync(dirs.commandsDir, { recursive: true });
  const missing = catalogFrom(dirs);
  assert.equal(missing.commandsAvailable, false);
  const plan = buildPlan(registry, missing);
  assert.equal(
    plan.operations.some(
      (operation) => operation.op === "install-command" || operation.op === "remove-command"
    ),
    false
  );
  assert.equal(apply(registry, plan).ok, true);
  assert.ok(fs.existsSync(path.join(registry.claude.commandsRoot, "bofh-golem.md")));
  const names = readManifest(registry.claude).manifest.artifacts.map(
    (artifact) => artifact.name
  );
  assert.ok(names.includes("bofh-golem.md"));
});

test("missing manifest falls back to repository names with a warning", () => {
  const { registry, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.unlinkSync(manifestPath(registry.claude));
  const plan = buildPlan(registry, catalog, { mode: "uninstall" });
  assert.match(plan.warnings.join("\n"), /no manifest/);
  assert.equal(apply(registry, plan).ok, true);
  assert.equal(fs.existsSync(installedSkill(registry)), false);
});

test("malformed and unknown-schema manifests fail clearly", () => {
  const { registry } = setup();
  fs.mkdirSync(registry.claude.skillsRoot, { recursive: true });
  const file = manifestPath(registry.claude);
  fs.writeFileSync(file, "{ not json");
  let read = readManifest(registry.claude);
  assert.equal(read.ok, false);
  assert.match(read.error, /malformed manifest/);

  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, agent: "claude", artifacts: [] }));
  read = readManifest(registry.claude);
  assert.equal(read.ok, false);
  assert.match(read.error, /unsupported manifest schema version/);
});

test("missing recorded artifacts are reported and dropped from ownership", () => {
  const { registry, catalog } = setup({
    skills: ["bofh-golem", "bofh-keep"],
    noCommands: true,
  });
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  fs.rmSync(installedSkill(registry), { recursive: true });
  fs.writeFileSync(path.join(installedSkill(registry, "bofh-keep"), "SKILL.md"), "edit\n");
  const plan = buildPlan(registry, catalog, { mode: "uninstall" });
  assert.ok(
    plan.operations.some(
      (operation) =>
        operation.op === "skip" &&
        operation.name === "bofh-golem" &&
        operation.reason === "missing"
    )
  );
  assert.equal(apply(registry, plan).ok, true);
  const names = readManifest(registry.claude).manifest.artifacts.map(
    (artifact) => artifact.name
  );
  assert.deepEqual(names, ["bofh-keep"]);
});

test("unowned bofh artifacts are reported and preserved", () => {
  const { registry, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  const extraSkill = installedSkill(registry, "bofh-rogue");
  fs.mkdirSync(extraSkill, { recursive: true });
  fs.writeFileSync(path.join(extraSkill, "SKILL.md"), "mine\n");
  const extraCommand = path.join(registry.claude.commandsRoot, "bofh-rogue.md");
  fs.writeFileSync(extraCommand, "mine\n");
  const plan = buildPlan(registry, catalog, { mode: "uninstall" });
  const unowned = plan.operations.filter(
    (operation) => operation.op === "skip" && operation.reason === "unowned"
  );
  assert.equal(unowned.length, 2);
  assert.equal(apply(registry, plan).ok, true);
  assert.ok(fs.existsSync(extraSkill));
  assert.ok(fs.existsSync(extraCommand));
});

test("dry run leaves no trace", () => {
  const { registry, catalog } = setup();
  const plan = buildPlan(registry, catalog);
  const result = apply(registry, plan, { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(installedSkill(registry)), false);
  assert.equal(fs.existsSync(manifestPath(registry.claude)), false);
});

test("failure before manifest write preserves the previous manifest", () => {
  const { registry, catalog } = setup();
  assert.equal(apply(registry, buildPlan(registry, catalog)).ok, true);
  const before = fs.readFileSync(manifestPath(registry.claude), "utf8");
  const plan = buildPlan(registry, catalog);
  plan.operations[0] = {
    ...plan.operations[0],
    source: path.join(registry.claude.skillsRoot, "does-not-exist"),
  };
  const result = apply(registry, plan);
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(manifestPath(registry.claude), "utf8"), before);
});

test("atomic manifest write keeps the old manifest on failure", () => {
  const { registry } = setup();
  fs.mkdirSync(registry.claude.skillsRoot, { recursive: true });
  writeManifestAtomic(registry.claude, {
    artifacts: [
      {
        type: "skill",
        name: "bofh-golem",
        destination: installedSkill(registry),
        digest: "sha256:old",
      },
    ],
  });
  const before = fs.readFileSync(manifestPath(registry.claude), "utf8");
  const bad = {
    get artifacts() {
      throw new Error("boom");
    },
  };
  assert.throws(() => writeManifestAtomic(registry.claude, bad));
  assert.equal(fs.readFileSync(manifestPath(registry.claude), "utf8"), before);
  assert.equal(
    fs.readdirSync(registry.claude.skillsRoot).some((name) => name.endsWith(".tmp")),
    false
  );
});
