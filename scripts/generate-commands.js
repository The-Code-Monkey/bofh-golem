#!/usr/bin/env node
// Generate skills and commands from the canonical prompt sources in prompts/.
// Zero dependencies, deterministic output.
//
//   node scripts/generate-commands.js          write generated files
//   node scripts/generate-commands.js --check  fail when committed files drift

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROMPTS = path.join(ROOT, "prompts");

function readMeta(root) {
  const file = path.join(root, "prompts", "meta.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readBody(root, sources) {
  return sources
    .map((source) =>
      fs.readFileSync(path.join(root, "prompts", source), "utf8").replace(/\s+$/, "")
    )
    .join("\n\n");
}

function renderDescription(description) {
  if (!description.includes("\n")) return `description: ${description}\n`;
  const lines = description.split("\n").map((line) => `  ${line}`);
  return `description: >\n${lines.join("\n")}\n`;
}

function renderSkill(entry, body) {
  let frontmatter = `---\nname: ${entry.skill}\n${renderDescription(entry.description)}`;
  if (entry.disableModelInvocation) frontmatter += "disable-model-invocation: true\n";
  frontmatter += "---\n";
  const title = entry.title ? `# ${entry.title}\n\n` : "";
  return `${frontmatter}\n${title}${body}\n`;
}

function renderCommand(entry, body) {
  return `---\ndescription: ${entry.commandDescription}\n---\n${entry.commandIntro}\n\n${body}\n`;
}

function generate(root) {
  const repo = root || ROOT;
  const meta = readMeta(repo);
  const files = [];
  for (const entry of meta.skills) {
    const body = readBody(repo, entry.body);
    files.push({
      file: path.join("skills", entry.skill, "SKILL.md"),
      source: entry.body.map((source) => `prompts/${source}`).join(", "),
      content: renderSkill(entry, body),
    });
    files.push({
      file: path.join("commands", `${entry.command}.md`),
      source: entry.body.map((source) => `prompts/${source}`).join(", "),
      content: renderCommand(entry, body),
    });
  }
  return files;
}

function check(root) {
  const repo = root || ROOT;
  const errors = [];
  const files = generate(repo);
  const expected = new Set();
  for (const item of files) {
    expected.add(item.file);
    const target = path.join(repo, item.file);
    let actual = null;
    try {
      actual = fs.readFileSync(target, "utf8");
    } catch {
      errors.push(`${item.file} is missing (source: ${item.source})`);
      continue;
    }
    if (actual !== item.content) {
      errors.push(`${item.file} has drifted from ${item.source}`);
    }
  }

  const commandsDir = path.join(repo, "commands");
  let entries = [];
  try {
    entries = fs.readdirSync(commandsDir).filter((name) => name.endsWith(".md"));
  } catch {
    entries = [];
  }
  for (const name of entries) {
    const rel = path.join("commands", name);
    if (!expected.has(rel)) {
      errors.push(`${rel} is not generated from prompts/meta.json`);
    }
  }
  return errors;
}

function write(root) {
  const repo = root || ROOT;
  for (const item of generate(repo)) {
    const target = path.join(repo, item.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.content);
  }
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node scripts/generate-commands.js [--check]");
    return 0;
  }
  if (argv.includes("--check")) {
    const errors = check();
    if (errors.length > 0) {
      for (const error of errors) console.error(`prompts: ${error}`);
      return 1;
    }
    console.log("prompts: ok");
    return 0;
  }
  write();
  console.log("prompts: generated");
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { generate, check, write, renderSkill, renderCommand };
