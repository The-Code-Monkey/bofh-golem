"use strict";

const fs = require("fs");
const path = require("path");

const { digestDirectory, digestFile } = require("./manifest");

function loadCatalog(options) {
  const fsImpl = options.fs || fs;
  const skillsDir = options.skillsDir;
  const commandsDir = options.commandsDir;
  const warnings = [];
  const skills = [];
  const commands = [];
  let commandsAvailable = true;

  let skillEntries;
  try {
    skillEntries = fsImpl.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return {
      ok: false,
      error: `skills catalog not found: ${skillsDir}`,
      warnings,
      skills,
      commands,
      commandsAvailable: false,
    };
  }

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const source = path.join(skillsDir, entry.name);
    skills.push({
      type: "skill",
      name: entry.name,
      source,
      digest: digestDirectory(source),
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));

  let commandEntries;
  try {
    commandEntries = fsImpl.readdirSync(commandsDir, { withFileTypes: true });
  } catch {
    commandEntries = [];
    commandsAvailable = false;
    warnings.push(`commands catalog not found: ${commandsDir}`);
  }

  for (const entry of commandEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const source = path.join(commandsDir, entry.name);
    commands.push({
      type: "command",
      name: entry.name,
      source,
      digest: digestFile(source),
    });
  }
  commands.sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, warnings, skills, commands, commandsAvailable };
}

module.exports = { loadCatalog };
