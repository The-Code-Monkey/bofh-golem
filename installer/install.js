#!/usr/bin/env node
// bofh-golem installer. Zero dependencies. Parses, plans, applies.
//
//   node installer/install.js            install to all detected agents
//   node installer/install.js --claude   install to Claude Code only
//   node installer/install.js --list     show agent destinations
//   node installer/install.js --dry-run  print the plan, change nothing
//   node installer/install.js --uninstall  remove installed artifacts
//
// Planning is pure: it reads the parsed request, agent registry, artifact
// catalog, and install state, then returns ordered operations. The apply
// adapter is the only code that writes files, prints results, or exits.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createRegistry, agentList, detectAgents } = require("./agents");
const { parseArgs, usage } = require("./args");
const { loadCatalog } = require("./catalog");
const { createPlan, selectTargets } = require("./plan");
const { applyOperations } = require("./apply");
const { readManifest, digestDestination, manifestPath } = require("./manifest");
const {
  readBootstrap,
  checkNodeFloor,
  defaultBootstrapPath,
} = require("./bootstrap");

function listDirectoryNames(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listFileNames(dir) {
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function readAgentState(agent) {
  const read = readManifest(agent);
  if (!read.ok) return { ok: false, error: read.error };
  const state = {
    manifest: read.manifest,
    presentSkills: listDirectoryNames(agent.skillsRoot),
    presentCommands: listFileNames(agent.commandsRoot),
    currentDigests: {},
  };
  if (read.manifest) {
    for (const artifact of read.manifest.artifacts) {
      state.currentDigests[`${artifact.type}:${artifact.name}`] = digestDestination(
        artifact.type,
        artifact.destination
      );
    }
  }
  return { ok: true, state };
}

function printVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    console.log(pkg.version);
  } catch {
    console.log("unknown");
  }
}

function runList(registry) {
  const detection = detectAgents(registry);
  for (const agent of agentList(registry)) {
    const detected = detection[agent.key] ? "yes" : "no";
    const commands = agent.commandsRoot ? agent.commandsRoot : "(none)";
    console.log(
      `${agent.label}: detected=${detected}, skills=${agent.skillsRoot}, commands=${commands}`
    );
  }
  const catalog = loadCatalog({
    skillsDir: path.join(__dirname, "..", "skills"),
    commandsDir: path.join(__dirname, "..", "commands"),
  });
  if (catalog.ok) {
    console.log(
      `\nSkills to ship (${catalog.skills.length}): ${catalog.skills
        .map((skill) => skill.name)
        .join(", ")}`
    );
  } else {
    console.error(`bofh-golem: ${catalog.error}`);
  }
  return 0;
}

function run(argv) {
  const bootstrap = readBootstrap(defaultBootstrapPath());
  if (!bootstrap.ok) {
    console.error(`bofh-golem: ${bootstrap.error}`);
    return 1;
  }
  const floor = checkNodeFloor(process.versions.node, bootstrap.data.node);
  if (!floor.ok) {
    console.error(`bofh-golem: ${floor.error}`);
    return 1;
  }

  const registry = createRegistry(os.homedir(), fs);
  const parsed = parseArgs(argv, registry);
  if (!parsed.ok) {
    console.error(`bofh-golem: ${parsed.error}`);
    console.error("Run --help for usage.");
    return 1;
  }
  const request = parsed.request;

  if (request.mode === "help") {
    console.log(usage(registry));
    return 0;
  }
  if (request.mode === "version") {
    printVersion();
    return 0;
  }
  if (request.mode === "list") {
    return runList(registry);
  }

  const catalog = loadCatalog({
    skillsDir: path.join(__dirname, "..", "skills"),
    commandsDir: path.join(__dirname, "..", "commands"),
  });
  if (!catalog.ok) {
    console.error(`bofh-golem: ${catalog.error}`);
    return 1;
  }

  const detection = detectAgents(registry);
  const targets = selectTargets(request, registry, detection);
  const state = {};
  for (const key of targets) {
    const result = readAgentState(registry[key]);
    if (!result.ok) {
      console.error(`bofh-golem: ${result.error}`);
      return 1;
    }
    state[key] = result.state;
  }

  const manifestPaths = {};
  for (const key of targets) manifestPaths[key] = manifestPath(registry[key]);

  const plan = createPlan({
    request,
    registry,
    catalog,
    detection,
    state,
    manifestPaths,
  });
  for (const warning of plan.warnings || []) {
    console.error(`bofh-golem: ${warning}`);
  }
  if (!plan.ok) {
    console.error(`bofh-golem: ${plan.error}`);
    return 1;
  }

  const result = applyOperations(plan.operations, {
    registry,
    dryRun: request.dryRun,
  });
  if (!result.ok) {
    console.error(`bofh-golem: apply failed: ${result.error}`);
    return 1;
  }

  if (!request.dryRun) {
    const verb = request.mode === "uninstall" ? "Removed" : "Installed";
    console.log(`\nDone. ${verb} artifacts for ${plan.targets.length} agent(s).`);
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}

module.exports = { run, readAgentState, listDirectoryNames, listFileNames };
