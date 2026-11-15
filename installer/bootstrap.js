"use strict";

const fs = require("fs");
const path = require("path");

function readBootstrap(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    return { ok: false, error: `cannot read ${file}: ${error.message}` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `malformed ${file}: ${error.message}` };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: `${file} is not an object` };
  }
  if (typeof data.repo !== "string" || !data.repo.includes("/")) {
    return { ok: false, error: `${file} has an invalid repo` };
  }
  if (typeof data.ref !== "string" || data.ref.length === 0) {
    return { ok: false, error: `${file} has an invalid ref` };
  }
  if (!Number.isInteger(data.node) || data.node < 1) {
    return { ok: false, error: `${file} has an invalid node floor` };
  }
  return { ok: true, data };
}

function nodeMajor(version) {
  const major = Number.parseInt(String(version).split(".")[0], 10);
  return Number.isNaN(major) ? 0 : major;
}

function checkNodeFloor(version, floor) {
  const major = nodeMajor(version);
  if (major < floor) {
    return {
      ok: false,
      error: `Node ${major} too old. Need Node >=${floor}.`,
      major,
      floor,
    };
  }
  return { ok: true, major, floor };
}

function defaultBootstrapPath() {
  return path.join(__dirname, "..", "bootstrap.json");
}

module.exports = { readBootstrap, checkNodeFloor, nodeMajor, defaultBootstrapPath };
