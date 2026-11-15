"use strict";

const { agentList } = require("./agents");

function parseArgs(argv, registry) {
  const request = {
    mode: "install",
    all: false,
    agents: [],
    dryRun: false,
    force: false,
  };
  const knownAgents = new Map();
  for (const agent of agentList(registry)) {
    knownAgents.set(agent.flag, agent.key);
  }

  for (const arg of argv) {
    if (knownAgents.has(arg)) {
      const key = knownAgents.get(arg);
      if (!request.agents.includes(key)) request.agents.push(key);
      continue;
    }
    switch (arg) {
      case "--all":
        request.all = true;
        break;
      case "--dry-run":
        request.dryRun = true;
        break;
      case "--uninstall":
      case "-u":
        request.mode = "uninstall";
        break;
      case "--list":
        request.mode = "list";
        break;
      case "--force":
        request.force = true;
        break;
      case "--version":
      case "-v":
        request.mode = "version";
        break;
      case "--help":
      case "-h":
        request.mode = "help";
        break;
      default:
        return { ok: false, error: `unknown flag: ${arg}` };
    }
  }

  return { ok: true, request };
}

function usage(registry) {
  const agentFlags = agentList(registry).map(
    (agent) => `  ${agent.flag.padEnd(14)} ${agent.label} only`
  );
  return [
    "bofh-golem installer",
    "",
    "Usage: node installer/install.js [flags]",
    "",
    "  --all          target every registered agent",
    ...agentFlags,
    "  --dry-run      print the plan, change nothing",
    "  --uninstall    remove installed artifacts",
    "  --force        remove artifacts modified since install",
    "  --list         show agent skill and command destinations",
    "  --version      print the version",
    "  --help         print this help",
  ].join("\n");
}

module.exports = { parseArgs, usage };
