"use strict";

const fs = require("fs");
const path = require("path");

const { manifestPath, writeManifestAtomic, removeManifest } = require("./manifest");

function copyDirectory(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function describe(operation, registry) {
  const agent = registry[operation.agent];
  const label = agent ? agent.label : operation.agent;
  switch (operation.op) {
    case "install-skill":
      return `install skill ${operation.name} -> ${operation.destination} (${label})`;
    case "install-command":
      return `install command ${operation.name} -> ${operation.destination} (${label})`;
    case "remove-skill":
      return `remove skill ${operation.name} <- ${operation.destination} (${operation.reason}) (${label})`;
    case "remove-command":
      return `remove command ${operation.name} <- ${operation.destination} (${operation.reason}) (${label})`;
    case "write-manifest":
      return `write manifest -> ${manifestPath(registry[operation.agent])} (${label})`;
    case "remove-manifest":
      return `remove manifest <- ${manifestPath(registry[operation.agent])} (${label})`;
    case "skip":
      return `skip ${operation.type} ${operation.name} (${operation.reason}) (${label})`;
    default:
      return `unknown operation ${operation.op}`;
  }
}

function perform(operation, registry) {
  const agent = registry[operation.agent];
  switch (operation.op) {
    case "install-skill":
      copyDirectory(operation.source, operation.destination);
      return;
    case "install-command":
      fs.mkdirSync(path.dirname(operation.destination), { recursive: true });
      fs.copyFileSync(operation.source, operation.destination);
      return;
    case "remove-skill":
      fs.rmSync(operation.destination, { recursive: true, force: true });
      return;
    case "remove-command":
      fs.rmSync(operation.destination, { force: true });
      return;
    case "write-manifest":
      writeManifestAtomic(agent, operation.manifest);
      return;
    case "remove-manifest":
      removeManifest(agent);
      return;
    case "skip":
      return;
    default:
      throw new Error(`unknown operation: ${operation.op}`);
  }
}

function applyOperations(operations, options) {
  const registry = options.registry;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || ((line) => console.log(line));
  for (const operation of operations) {
    const line = describe(operation, registry);
    log(dryRun ? `[dry-run] ${line}` : line);
    if (dryRun) continue;
    try {
      perform(operation, registry);
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : String(error),
        operation,
      };
    }
  }
  return { ok: true };
}

module.exports = { applyOperations, describe, copyDirectory };
