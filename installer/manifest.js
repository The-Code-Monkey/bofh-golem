"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const MANIFEST_NAME = ".bofh-golem-manifest.json";

function manifestPath(agent) {
  return path.join(agent.skillsRoot, MANIFEST_NAME);
}

function hashFile(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

function hashDirectory(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (current, prefix) => {
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        hash.update(`d\0${rel}\0`);
        walk(full, rel);
      } else if (entry.isSymbolicLink()) {
        hash.update(`l\0${rel}\0${fs.readlinkSync(full)}\0`);
      } else {
        hash.update(`f\0${rel}\0`);
        hash.update(fs.readFileSync(full));
        hash.update("\0");
      }
    }
  };
  walk(dir, "");
  return `sha256:${hash.digest("hex")}`;
}

function digestFile(file) {
  return hashFile(file);
}

function digestDirectory(dir) {
  return hashDirectory(dir);
}

function digestDestination(type, destination) {
  try {
    return type === "skill" ? hashDirectory(destination) : hashFile(destination);
  } catch {
    return null;
  }
}

function isValidArtifact(artifact) {
  return (
    artifact &&
    typeof artifact === "object" &&
    (artifact.type === "skill" || artifact.type === "command") &&
    typeof artifact.name === "string" &&
    artifact.name.length > 0 &&
    typeof artifact.destination === "string" &&
    artifact.destination.length > 0 &&
    typeof artifact.digest === "string" &&
    artifact.digest.startsWith("sha256:")
  );
}

function validateManifest(manifest, agent) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest is not an object"];
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported manifest schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.agent !== agent.key) {
    errors.push(`manifest agent mismatch: expected ${agent.key}, got ${manifest.agent}`);
  }
  if (!Array.isArray(manifest.artifacts)) {
    errors.push("manifest artifacts is not an array");
  } else {
    const seen = new Set();
    for (const artifact of manifest.artifacts) {
      if (!isValidArtifact(artifact)) {
        errors.push("manifest contains an invalid artifact");
        continue;
      }
      const key = `${artifact.type}:${artifact.name}`;
      if (seen.has(key)) errors.push(`manifest contains duplicate artifact: ${key}`);
      seen.add(key);
    }
  }
  return errors;
}

function readManifest(agent) {
  const file = manifestPath(agent);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ok: true, manifest: null, path: file };
    }
    return { ok: false, error: `cannot read manifest ${file}: ${error.message}` };
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `malformed manifest ${file}: ${error.message}` };
  }
  const errors = validateManifest(manifest, agent);
  if (errors.length > 0) return { ok: false, error: `invalid manifest ${file}: ${errors.join("; ")}` };
  return { ok: true, manifest, path: file };
}

function sortArtifacts(artifacts) {
  return [...artifacts].sort((a, b) => {
    const byType = a.type.localeCompare(b.type);
    return byType !== 0 ? byType : a.name.localeCompare(b.name);
  });
}

function writeManifestAtomic(agent, manifest) {
  const file = manifestPath(agent);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = {
    schemaVersion: SCHEMA_VERSION,
    agent: agent.key,
    artifacts: sortArtifacts(manifest.artifacts),
  };
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      // nothing to clean up
    }
    throw error;
  }
  return next;
}

function removeManifest(agent) {
  try {
    fs.unlinkSync(manifestPath(agent));
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = {
  SCHEMA_VERSION,
  MANIFEST_NAME,
  manifestPath,
  digestFile,
  digestDirectory,
  digestDestination,
  readManifest,
  writeManifestAtomic,
  removeManifest,
  sortArtifacts,
  validateManifest,
};
