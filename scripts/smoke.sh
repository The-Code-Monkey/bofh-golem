#!/usr/bin/env bash
# bofh-golem smoke test. Run before committing installer changes.
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

echo "== syntax =="
node --check installer/install.js || fail=1
bash -n install.sh || fail=1

echo "== placeholder check =="
if grep -Rq "<owner>" install.sh install.ps1 README.md; then
  echo "FAIL: <owner> placeholder still present" >&2
  fail=1
fi

echo "== list =="
node installer/install.js --list || fail=1

echo "== dry-run =="
node installer/install.js --dry-run --opencode || fail=1

echo "== version =="
node installer/install.js --version || fail=1

echo "== skills present =="
expected="bofh-golem bofh-golem-commit bofh-golem-compress bofh-golem-review bofh-golem-stats bofh-megacave bofh-ultracave"
for s in $expected; do
  if [ ! -f "skills/$s/SKILL.md" ]; then
    echo "FAIL: skills/$s/SKILL.md missing" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "SMOKE FAILED" >&2
  exit 1
fi
echo "SMOKE OK"
