"use strict";

const path = require("path");

const { agentList } = require("./agents");

function artifactKey(type, name) {
  return `${type}:${name}`;
}

function emptyState() {
  return {
    manifest: null,
    presentSkills: [],
    presentCommands: [],
    currentDigests: {},
  };
}

function selectTargets(request, registry, detection) {
  if (request.all) return agentList(registry).map((agent) => agent.key);
  if (request.agents.length > 0) return [...request.agents];
  return agentList(registry)
    .filter((agent) => Boolean(detection[agent.key]))
    .map((agent) => agent.key);
}

function destinationFor(agent, artifact) {
  if (artifact.type === "skill") return path.join(agent.skillsRoot, artifact.name);
  return agent.commandsRoot
    ? path.join(agent.commandsRoot, artifact.name)
    : null;
}

function currentDigest(state, type, name) {
  return state.currentDigests[artifactKey(type, name)] || null;
}

function isModified(state, entry) {
  const digest = currentDigest(state, entry.type, entry.name);
  return Boolean(digest) && digest !== entry.digest;
}

function extraOwnedLookalikes(state, manifest) {
  const recorded = new Set(
    (manifest ? manifest.artifacts : []).map((entry) => artifactKey(entry.type, entry.name))
  );
  const extras = [];
  for (const name of state.presentSkills) {
    if (!name.startsWith("bofh-")) continue;
    if (!recorded.has(artifactKey("skill", name))) {
      extras.push({ type: "skill", name });
    }
  }
  for (const name of state.presentCommands) {
    if (!name.startsWith("bofh-")) continue;
    if (!recorded.has(artifactKey("command", name))) {
      extras.push({ type: "command", name });
    }
  }
  return extras;
}

function createPlan(input) {
  const { request, registry, catalog } = input;
  const detection = input.detection || {};
  const state = input.state || {};
  const targets = selectTargets(request, registry, detection);

  if (targets.length === 0) {
    return {
      ok: false,
      outcome: "no-target",
      error:
        "no agent detected. Pass --claude, --opencode, --codex, or --gemini, or --all.",
    };
  }

  const artifactOps = [];
  const manifestOps = [];
  const warnings = [...(catalog.warnings || [])];

  for (const key of targets) {
    const agent = registry[key];
    if (!agent) {
      return { ok: false, outcome: "unknown-agent", error: `unknown agent: ${key}` };
    }
    const agentState = { ...emptyState(), ...(state[key] || {}) };
    const manifest = agentState.manifest;
    const previous = new Map();
    if (manifest) {
      for (const entry of manifest.artifacts) {
        previous.set(artifactKey(entry.type, entry.name), entry);
      }
    }

    if (request.mode === "uninstall") {
      if (!manifest) {
        warnings.push(`${agent.label}: no manifest; falling back to repository names`);
        for (const artifact of catalog.skills) {
          const destination = destinationFor(agent, artifact);
          if (agentState.presentSkills.includes(artifact.name)) {
            artifactOps.push({
              op: "remove-skill",
              agent: key,
              name: artifact.name,
              destination,
              reason: "uninstall-fallback",
            });
          } else {
            artifactOps.push({
              op: "skip",
              agent: key,
              type: "skill",
              name: artifact.name,
              reason: "missing",
            });
          }
        }
        if (catalog.commandsAvailable && agent.commandsRoot) {
          for (const artifact of catalog.commands) {
            const destination = destinationFor(agent, artifact);
            if (agentState.presentCommands.includes(artifact.name)) {
              artifactOps.push({
                op: "remove-command",
                agent: key,
                name: artifact.name,
                destination,
                reason: "uninstall-fallback",
              });
            } else {
              artifactOps.push({
                op: "skip",
                agent: key,
                type: "command",
                name: artifact.name,
                reason: "missing",
              });
            }
          }
        }
        continue;
      }

      const remaining = new Map(previous);
      for (const entry of manifest.artifacts) {
        const dest = entry.destination;
        const digest = currentDigest(agentState, entry.type, entry.name);
        if (!digest) {
          artifactOps.push({
            op: "skip",
            agent: key,
            type: entry.type,
            name: entry.name,
            reason: "missing",
          });
          remaining.delete(artifactKey(entry.type, entry.name));
          continue;
        }
        if (digest !== entry.digest && !request.force) {
          artifactOps.push({
            op: "skip",
            agent: key,
            type: entry.type,
            name: entry.name,
            reason: "modified",
          });
          continue;
        }
        artifactOps.push({
          op: entry.type === "skill" ? "remove-skill" : "remove-command",
          agent: key,
          name: entry.name,
          destination: dest,
          reason: "uninstall",
        });
        remaining.delete(artifactKey(entry.type, entry.name));
      }

      for (const extra of extraOwnedLookalikes(agentState, manifest)) {
        artifactOps.push({
          op: "skip",
          agent: key,
          type: extra.type,
          name: extra.name,
          reason: "unowned",
        });
      }

      if (remaining.size === 0) {
        manifestOps.push({
          op: "remove-manifest",
          agent: key,
          path: input.manifestPaths ? input.manifestPaths[key] : null,
        });
      } else {
        manifestOps.push({
          op: "write-manifest",
          agent: key,
          path: input.manifestPaths ? input.manifestPaths[key] : null,
          manifest: { schemaVersion: manifest.schemaVersion, artifacts: [...remaining.values()] },
        });
      }
      continue;
    }

    const next = new Map(previous);
    const catalogKeys = new Set();
    for (const artifact of catalog.skills) {
      catalogKeys.add(artifactKey(artifact.type, artifact.name));
    }
    if (catalog.commandsAvailable && agent.commandsRoot) {
      for (const artifact of catalog.commands) {
        catalogKeys.add(artifactKey(artifact.type, artifact.name));
      }
    }

    for (const entry of previous.values()) {
      if (entry.type === "command" && !catalog.commandsAvailable) continue;
      if (catalogKeys.has(artifactKey(entry.type, entry.name))) continue;
      if (isModified(agentState, entry) && !request.force) {
        artifactOps.push({
          op: "skip",
          agent: key,
          type: entry.type,
          name: entry.name,
          reason: "modified-stale",
        });
        continue;
      }
      artifactOps.push({
        op: entry.type === "skill" ? "remove-skill" : "remove-command",
        agent: key,
        name: entry.name,
        destination: entry.destination,
        reason: "stale",
      });
      next.delete(artifactKey(entry.type, entry.name));
    }

    const installArtifact = (artifact) => {
      const destination = destinationFor(agent, artifact);
      if (!destination) return;
      const prior = previous.get(artifactKey(artifact.type, artifact.name));
      if (prior && isModified(agentState, prior) && !request.force) {
        artifactOps.push({
          op: "skip",
          agent: key,
          type: artifact.type,
          name: artifact.name,
          reason: "modified",
        });
        return;
      }
      artifactOps.push({
        op: artifact.type === "skill" ? "install-skill" : "install-command",
        agent: key,
        type: artifact.type,
        name: artifact.name,
        source: artifact.source,
        destination,
        digest: artifact.digest,
      });
      next.set(artifactKey(artifact.type, artifact.name), {
        type: artifact.type,
        name: artifact.name,
        destination,
        digest: artifact.digest,
      });
    };

    for (const artifact of catalog.skills) installArtifact(artifact);
    if (catalog.commandsAvailable && agent.commandsRoot) {
      for (const artifact of catalog.commands) installArtifact(artifact);
    }

    manifestOps.push({
      op: "write-manifest",
      agent: key,
      path: input.manifestPaths ? input.manifestPaths[key] : null,
      manifest: { schemaVersion: manifest ? manifest.schemaVersion : 1, artifacts: [...next.values()] },
    });
  }

  return {
    ok: true,
    outcome: "planned",
    operations: [...artifactOps, ...manifestOps],
    warnings,
    targets,
  };
}

module.exports = { createPlan, selectTargets, artifactKey };
