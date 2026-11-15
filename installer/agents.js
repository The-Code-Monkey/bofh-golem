"use strict";

// The one agent registry. Flags, help, listing, detection, and planning read
// this list. Add or rename an agent here only.

const path = require("path");

function dirExists(p, fs) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function createRegistry(home, fs) {
  const fsImpl = fs || require("fs");
  const join = (...parts) => path.join(home, ...parts);
  return {
    claude: {
      key: "claude",
      label: "Claude Code",
      flag: "--claude",
      skillsRoot: join(".claude", "skills"),
      commandsRoot: join(".claude", "commands"),
      detect: () => dirExists(join(".claude"), fsImpl),
    },
    opencode: {
      key: "opencode",
      label: "OpenCode",
      flag: "--opencode",
      skillsRoot: join(".config", "opencode", "skills"),
      commandsRoot: join(".config", "opencode", "commands"),
      detect: () => dirExists(join(".config", "opencode"), fsImpl),
    },
    codex: {
      key: "codex",
      label: "Codex",
      flag: "--codex",
      skillsRoot: join(".agents", "skills"),
      commandsRoot: null,
      detect: () =>
        dirExists(join(".codex"), fsImpl) || dirExists(join(".agents"), fsImpl),
    },
    gemini: {
      key: "gemini",
      label: "Gemini CLI",
      flag: "--gemini",
      skillsRoot: join(".gemini", "skills"),
      commandsRoot: null,
      detect: () => dirExists(join(".gemini"), fsImpl),
    },
  };
}

function agentList(registry) {
  return Object.keys(registry).map((key) => registry[key]);
}

function detectAgents(registry) {
  const detected = {};
  for (const agent of agentList(registry)) {
    detected[agent.key] = Boolean(agent.detect());
  }
  return detected;
}

module.exports = { createRegistry, agentList, detectAgents };
