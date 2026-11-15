"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createRegistry } = require("../installer/agents");
const { loadCatalog } = require("../installer/catalog");
const { createPlan } = require("../installer/plan");
const { manifestPath } = require("../installer/manifest");
const { readAgentState } = require("../installer/install");

const ROOT = path.join(__dirname, "..");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || "bofh-test-"));
}

function makeHome(agents) {
  const home = tempDir("bofh-home-");
  for (const key of agents || []) {
    const dir =
      key === "claude"
        ? ".claude"
        : key === "opencode"
          ? path.join(".config", "opencode")
          : key === "codex"
            ? ".codex"
            : ".gemini";
    fs.mkdirSync(path.join(home, dir), { recursive: true });
  }
  return home;
}

function makeCatalog(options) {
  const root = tempDir("bofh-catalog-");
  const skillsDir = path.join(root, "skills");
  const commandsDir = path.join(root, "commands");
  fs.mkdirSync(skillsDir, { recursive: true });
  if (options && options.noCommands) {
    // leave the commands directory absent
  } else {
    fs.mkdirSync(commandsDir, { recursive: true });
  }
  for (const skill of (options && options.skills) || ["bofh-golem"]) {
    fs.mkdirSync(path.join(skillsDir, skill), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, skill, "SKILL.md"), `# ${skill}\n`);
    fs.writeFileSync(path.join(skillsDir, skill, "README.md"), `README ${skill}\n`);
  }
  if (!(options && options.noCommands)) {
    for (const command of (options && options.commands) || ["bofh-golem.md"]) {
      fs.writeFileSync(path.join(commandsDir, command), `# ${command}\n`);
    }
  }
  return { root, skillsDir, commandsDir };
}

function catalogFrom(dirs) {
  return loadCatalog({ skillsDir: dirs.skillsDir, commandsDir: dirs.commandsDir });
}

function registryFor(home) {
  return createRegistry(home, fs);
}

function stateFor(registry, keys) {
  const state = {};
  for (const key of keys || Object.keys(registry)) {
    const result = readAgentState(registry[key]);
    if (!result.ok) throw new Error(result.error);
    state[key] = result.state;
  }
  return state;
}

function plan(request, registry, catalog, detection) {
  return createPlan({
    request: { dryRun: false, force: false, all: false, agents: [], ...request },
    registry,
    catalog,
    detection: detection || {},
    state: stateFor(registry, request.all ? Object.keys(registry) : request.agents),
    manifestPaths: Object.fromEntries(
      Object.keys(registry).map((key) => [key, manifestPath(registry[key])])
    ),
  });
}

module.exports = {
  ROOT,
  tempDir,
  makeHome,
  makeCatalog,
  catalogFrom,
  registryFor,
  stateFor,
  plan,
};
