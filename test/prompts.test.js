"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { generate, check, write } = require("../scripts/generate-commands.js");
const { tempDir, ROOT } = require("./helpers");

const REQUIRED = {
  "bofh-golem-compress.md": [
    "Data leaves the machine",
    ".env",
    "Back up original",
    "Requires an explicit filepath",
  ],
  "bofh-golem-review.md": [
    "Auto-Clarity",
    "security findings",
    "architectural disagreements",
  ],
  "bofh-golem-stats.md": ["/context", "/cost", "/stats model", "/stats session"],
  "bofh-golem.md": ["Floor (never cut)", "verbatim errors", "stop golem"],
  "bofh-golem-commit.md": ["Imperative mood", "hard cap 72", "capitalization"],
  "bofh-ultracave.md": ["stop golem", "verbatim errors", "Fragments"],
  "bofh-megacave.md": ["stop golem", "文言", "Negation"],
};

test("committed output matches the canonical sources", () => {
  assert.deepEqual(check(ROOT), []);
});

test("generation is deterministic", () => {
  const first = generate(ROOT);
  const second = generate(ROOT);
  assert.deepEqual(
    first.map((item) => item.content),
    second.map((item) => item.content)
  );
});

test("commands carry the safety rules from their skills", () => {
  const files = new Map(generate(ROOT).map((item) => [path.basename(item.file), item.content]));
  for (const [name, fragments] of Object.entries(REQUIRED)) {
    const content = files.get(name);
    assert.ok(content, `${name} was not generated`);
    for (const fragment of fragments) {
      assert.ok(content.includes(fragment), `${name} is missing "${fragment}"`);
    }
  }
});

test("skills and commands share the same rule body", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts", "meta.json"), "utf8"));
  const files = generate(ROOT);
  for (const entry of meta.skills) {
    const skill = files.find(
      (item) => item.file === path.join("skills", entry.skill, "SKILL.md")
    );
    const command = files.find(
      (item) => item.file === path.join("commands", `${entry.command}.md`)
    );
    const body = entry.body
      .map((source) =>
        fs.readFileSync(path.join(ROOT, "prompts", source), "utf8").replace(/\s+$/, "")
      )
      .join("\n\n");
    assert.ok(skill.content.includes(body));
    assert.ok(command.content.includes(body));
  }
});

test("drift names the generated file and its source", () => {
  const dir = tempDir("bofh-prompts-");
  fs.cpSync(path.join(ROOT, "prompts"), path.join(dir, "prompts"), { recursive: true });
  write(dir);
  const target = path.join(dir, "commands", "bofh-golem-compress.md");
  fs.appendFileSync(target, "\nhand edit\n");
  const errors = check(dir);
  assert.ok(errors.some((error) => error.includes("commands/bofh-golem-compress.md")));
  assert.ok(errors.some((error) => error.includes("prompts/compress.md")));
});

test("a missing generated file and an extra command both fail", () => {
  const dir = tempDir("bofh-prompts-");
  fs.cpSync(path.join(ROOT, "prompts"), path.join(dir, "prompts"), { recursive: true });
  write(dir);
  fs.rmSync(path.join(dir, "skills", "bofh-golem", "SKILL.md"));
  fs.writeFileSync(path.join(dir, "commands", "extra.md"), "hand written\n");
  const errors = check(dir);
  assert.ok(errors.some((error) => error.includes("skills/bofh-golem/SKILL.md is missing")));
  assert.ok(errors.some((error) => error.includes("commands/extra.md is not generated")));
});
