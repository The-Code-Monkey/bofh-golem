#!/usr/bin/env node
// bofh-golem installer. Zero dependencies. Detects agents, copies skills.
//
//   node installer/install.js            install to all detected agents
//   node installer/install.js --claude   install to Claude Code only
//   node installer/install.js --list     show what would be detected
//   node installer/install.js --dry-run  report, change nothing
//   node installer/install.js --uninstall  remove skills from detected agents
//
// Skill dirs live next to this file: <repo>/skills/<name>/{SKILL.md,README.md}.
// Target dirs are the agent's skill roots:
//   Claude Code  ~/.claude/skills
//   OpenCode     ~/.config/opencode/skills
//   Codex        ~/.agents/skills (interop standard; ~/.codex/skills is legacy)
//   Gemini CLI   ~/.gemini/skills

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();

const AGENTS = {
  claude: {
    label: "Claude Code",
    skillsRoot: path.join(HOME, ".claude", "skills"),
    detect: () => dirExists(path.join(HOME, ".claude")),
  },
  opencode: {
    label: "OpenCode",
    skillsRoot: path.join(HOME, ".config", "opencode", "skills"),
    detect: () => dirExists(path.join(HOME, ".config", "opencode")),
  },
  codex: {
    label: "Codex",
    skillsRoot: path.join(HOME, ".agents", "skills"),
    detect: () =>
      dirExists(path.join(HOME, ".codex")) || dirExists(path.join(HOME, ".agents")),
  },
  gemini: {
    label: "Gemini CLI",
    skillsRoot: path.join(HOME, ".gemini", "skills"),
    detect: () => dirExists(path.join(HOME, ".gemini")),
  },
};

const SKILLS_DIR = path.join(__dirname, "..", "skills");

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const flags = {
    all: false,
    agents: new Set(),
    dryRun: false,
    uninstall: false,
    list: false,
  };
  for (const a of argv) {
    switch (a) {
      case "--all":
        flags.all = true;
        break;
      case "--claude":
        flags.agents.add("claude");
        break;
      case "--opencode":
        flags.agents.add("opencode");
        break;
      case "--codex":
        flags.agents.add("codex");
        break;
      case "--gemini":
        flags.agents.add("gemini");
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--uninstall":
      case "-u":
        flags.uninstall = true;
        break;
      case "--list":
        flags.list = true;
        break;
      case "--version":
      case "-v":
        printVersion();
        process.exit(0);
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }
  return flags;
}

function printHelp() {
  console.log([
    "bofh-golem installer",
    "",
    "Usage: node installer/install.js [flags]",
    "",
    "  --all          install to every detected agent",
    "  --claude       Claude Code only",
    "  --opencode     OpenCode only",
    "  --codex        Codex only",
    "  --gemini       Gemini CLI only",
    "  --dry-run      report, change nothing",
    "  --uninstall    remove skills from target agents",
    "  --list         show detected agents and skill targets",
    "  --version      print the version",
  ].join("\n"));
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

function skillNames() {
  try {
    return fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    console.error(`bofh-golem: skills dir not found: ${SKILLS_DIR}`);
    process.exit(1);
  }
}

function targetsFor(flags) {
  if (flags.all) {
    return Object.keys(AGENTS);
  }
  if (flags.agents.size > 0) {
    return [...flags.agents];
  }
  // Default: only agents actually installed on this machine.
  return Object.keys(AGENTS).filter((k) => AGENTS[k].detect());
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function rmDir(p) {
  if (!dirExists(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const names = skillNames();

  if (flags.list) {
    for (const key of Object.keys(AGENTS)) {
      const a = AGENTS[key];
      const detected = a.detect() ? "yes" : "no";
      console.log(`${a.label}: detected=${detected}, skills=${a.skillsRoot}`);
    }
    console.log(`\nSkills to ship (${names.length}): ${names.join(", ")}`);
    return;
  }

  const targets = targetsFor(flags);
  if (targets.length === 0) {
    console.log("bofh-golem: no agent detected. Pass --claude, --opencode, --codex, or --gemini.");
    process.exit(1);
  }

  const verb = flags.uninstall ? "Removing" : "Installing";
  for (const key of targets) {
    const a = AGENTS[key];
    for (const name of names) {
      const src = path.join(SKILLS_DIR, name);
      const dst = path.join(a.skillsRoot, name);
      if (flags.uninstall) {
        console.log(`${flags.dryRun ? "[dry-run] " : ""}${verb} ${name} from ${a.label}`);
        if (!flags.dryRun) rmDir(dst);
      } else {
        console.log(`${flags.dryRun ? "[dry-run] " : ""}${verb} ${name} to ${a.label}`);
        if (!flags.dryRun) copyDir(src, dst);
      }
    }
  }
  if (!flags.dryRun) {
    console.log(`\nDone. ${verb === "Installing" ? "Say /bofh-golem" : "Removed"} ${names.length} skills x ${targets.length} agent(s).`);
  }
}

main();
