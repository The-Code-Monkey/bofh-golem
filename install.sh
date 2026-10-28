#!/usr/bin/env bash
# bofh-golem — installer shim.
#
# Thin wrapper around installer/install.js (the Node installer). Every flag
# there can be passed here; they are forwarded.
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.sh | bash
#
# Local clone:
#   bash install.sh [flags]

set -euo pipefail

REPO="The-Code-Monkey/bofh-golem"
PINNED_REF="${BOFH_GOLEM_REF:-main}"

if ! command -v node >/dev/null 2>&1; then
  echo "bofh-golem: Node.js (>=18) required. Install:" >&2
  echo "  macOS:  brew install node" >&2
  echo "  Linux:  see https://nodejs.org or use nvm (https://github.com/nvm-sh/nvm)" >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "bofh-golem: Node $NODE_MAJOR too old. Need Node >=18." >&2
  exit 1
fi

# Local clone: run the installer in this checkout.
here=""
source_path="${BASH_SOURCE[0]:-}"
if [ -n "$source_path" ]; then
  here="$(cd "$(dirname "$source_path")" 2>/dev/null && pwd)" || here=""
fi
if [ -n "$here" ] && [ -f "$here/installer/install.js" ]; then
  node "$here/installer/install.js" "$@"
  exit 0
fi

# Curl-pipe path: download the tarball to a temp dir and run it.
echo "bofh-golem: fetching installer..." >&2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$PINNED_REF.tar.gz" -o "$tmp/repo.tar.gz"
tar -xzf "$tmp/repo.tar.gz" -C "$tmp"
node "$tmp"/bofh-golem-*/installer/install.js "$@"
