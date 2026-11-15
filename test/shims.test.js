"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");

const { ROOT, tempDir } = require("./helpers");

const NODE = process.execPath;
const SHIM = path.join(ROOT, "install.sh");
const BOOTSTRAP = path.join(ROOT, "bootstrap.json");

function makeWork() {
  const dir = tempDir("bofh-shim-");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(SHIM, path.join(dir, "install.sh"));
  fs.copyFileSync(BOOTSTRAP, path.join(dir, "bootstrap.json"));
  return dir;
}

function writeFixtureInstaller(dir) {
  const target = path.join(dir, "installer");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "install.js"),
    [
      '"use strict";',
      'const fs = require("fs");',
      'fs.writeFileSync(process.env.BOFH_TEST_ARGS, JSON.stringify(process.argv.slice(2)));',
      "",
    ].join("\n")
  );
}

function makeArchive(prefix) {
  const source = tempDir("bofh-archive-src-");
  const root = path.join(source, prefix || "bofh-golem-test");
  writeFixtureInstaller(root);
  const archive = path.join(source, "repo.tar.gz");
  const result = spawnSync("tar", ["-czf", archive, "-C", source, path.basename(root)], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return archive;
}

function runShim(work, args, env) {
  return spawnSync("bash", [path.join(work, "install.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, BOFH_GOLEM_NODE: NODE, ...env },
  });
}

function runShimAsync(work, args, env) {
  return new Promise((resolve) => {
    const child = spawn("bash", [path.join(work, "install.sh"), ...args], {
      env: { ...process.env, BOFH_GOLEM_NODE: NODE, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("local checkout runs that checkout's installer and forwards flags", () => {
  const work = makeWork();
  writeFixtureInstaller(work);
  const argsFile = path.join(work, "args.json");
  const result = runShim(work, ["--claude", "--dry-run", "--unknown"], {
    BOFH_TEST_ARGS: argsFile,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, "utf8")), [
    "--claude",
    "--dry-run",
    "--unknown",
  ]);
});

test("archive path extracts a fixture and forwards flags", () => {
  const work = makeWork();
  const archive = makeArchive();
  const argsFile = path.join(work, "args.json");
  const result = runShim(work, ["--opencode", "--all"], {
    BOFH_TEST_ARGS: argsFile,
    BOFH_GOLEM_ARCHIVE: archive,
    BOFH_GOLEM_FORCE_REMOTE: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, "utf8")), [
    "--opencode",
    "--all",
  ]);
});

test("old Node is rejected before the archive download", () => {
  const work = makeWork();
  writeFixtureInstaller(work);
  const fakeNode = path.join(work, "fake-node");
  fs.writeFileSync(
    fakeNode,
    [
      "#!/bin/sh",
      'case "$*" in',
      '  *"process.versions.node.split"*) echo 16; exit 0;;',
      "esac",
      `exec ${JSON.stringify(NODE)} "$@"`,
      "",
    ].join("\n")
  );
  fs.chmodSync(fakeNode, 0o755);
  const argsFile = path.join(work, "args.json");
  const result = runShim(work, ["--claude"], {
    BOFH_GOLEM_NODE: fakeNode,
    BOFH_TEST_ARGS: argsFile,
    BOFH_GOLEM_FORCE_REMOTE: "1",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node 16 too old\. Need Node >=18/);
  assert.equal(fs.existsSync(argsFile), false);
});

test("fetch failure exits nonzero and leaves no temporary directory", () => {
  const work = makeWork();
  const tmp = tempDir("bofh-shim-tmp-");
  const result = runShim(work, [], {
    TMPDIR: tmp,
    BOFH_GOLEM_FORCE_REMOTE: "1",
    BOFH_GOLEM_ARCHIVE_URL: "http://127.0.0.1:1/nope.tar.gz",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot download installer/);
  assert.deepEqual(fs.readdirSync(tmp), []);
});

test("successful archive path cleans its temporary directory", () => {
  const work = makeWork();
  const archive = makeArchive();
  const tmp = tempDir("bofh-shim-tmp-");
  const argsFile = path.join(work, "args.json");
  const result = runShim(work, ["--claude"], {
    TMPDIR: tmp,
    BOFH_TEST_ARGS: argsFile,
    BOFH_GOLEM_ARCHIVE: archive,
    BOFH_GOLEM_FORCE_REMOTE: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(tmp), []);
});

test("archive path fetches a fixture over HTTP", async () => {
  const archive = makeArchive();
  const body = fs.readFileSync(archive);
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/gzip" });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const work = makeWork();
    const tmp = tempDir("bofh-shim-tmp-");
    const argsFile = path.join(work, "args.json");
    const result = await runShimAsync(work, ["--gemini"], {
      TMPDIR: tmp,
      BOFH_TEST_ARGS: argsFile,
      BOFH_GOLEM_FORCE_REMOTE: "1",
      BOFH_GOLEM_ARCHIVE_URL: `http://127.0.0.1:${port}/repo.tar.gz`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, "utf8")), ["--gemini"]);
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally {
    server.close();
  }
});
