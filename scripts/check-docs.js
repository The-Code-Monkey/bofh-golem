#!/usr/bin/env node
// Documentation drift check. Zero dependencies.
//
// Canonical instructions live in AGENTS.md. CLAUDE.md is a short pointer.
// This check guards the required sections and the single-source rule.
//
//   node scripts/check-docs.js [repo-root]

"use strict";

const fs = require("fs");
const path = require("path");

const CANONICAL = "AGENTS.md";
const POINTER = "CLAUDE.md";

const REQUIRED_SECTIONS = [
  { heading: "Layout", needle: "installer/install.js" },
  { heading: "Conventions", needle: "zero-dependency" },
  { heading: "Verify", needle: "npm test" },
  { heading: "Agent skills", needle: "needs-triage" },
];

function readFile(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function hasHeading(text, heading) {
  return new RegExp(`^## ${heading}\\s*$`, "m").test(text);
}

function checkDocs(root) {
  const errors = [];
  const canonicalPath = path.join(root, CANONICAL);
  const pointerPath = path.join(root, POINTER);
  const canonical = readFile(canonicalPath);
  const pointer = readFile(pointerPath);

  if (canonical === null) {
    errors.push(`${CANONICAL} is missing`);
  } else {
    for (const section of REQUIRED_SECTIONS) {
      if (!hasHeading(canonical, section.heading)) {
        errors.push(`${CANONICAL} is missing the "${section.heading}" section`);
      }
      if (!canonical.includes(section.needle)) {
        errors.push(
          `${CANONICAL} "${section.heading}" section is missing "${section.needle}"`
        );
      }
    }
  }

  if (pointer === null) {
    errors.push(`${POINTER} is missing`);
  } else {
    if (!/AGENTS\.md/.test(pointer)) {
      errors.push(`${POINTER} does not reference ${CANONICAL}`);
    }
    for (const section of REQUIRED_SECTIONS) {
      if (hasHeading(pointer, section.heading)) {
        errors.push(`${POINTER} duplicates the "${section.heading}" section`);
      }
    }
    if (canonical !== null && canonical.trim() === pointer.trim()) {
      errors.push(`${POINTER} is a byte-identical copy of ${CANONICAL}`);
    }
    if (canonical !== null && pointer.length >= canonical.length / 2) {
      errors.push(`${POINTER} is too long; keep it a short pointer`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main(argv) {
  const root = argv[0] ? path.resolve(argv[0]) : path.join(__dirname, "..");
  const result = checkDocs(root);
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`docs: ${error}`);
    }
    return 1;
  }
  console.log("docs: ok");
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { checkDocs, REQUIRED_SECTIONS };
