#!/usr/bin/env bash
# bofh-golem installer shim. Thin adapter over installer/install.js.
#
# Local clone:
#   bash install.sh [flags]
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/The-Code-Monkey/bofh-golem/main/install.sh | bash
#
# Canonical facts (repo, ref, Node floor) live in bootstrap.json. The shim
# checks the Node floor before downloading the installer archive, forwards
# every flag, and never selects, copies, or removes artifacts.

set -euo pipefail

NODE_BIN="${BOFH_GOLEM_NODE:-node}"
LOCATOR_REPO="The-Code-Monkey/bofh-golem"
LOCATOR_REF="main"
REPO="${BOFH_GOLEM_REPO:-$LOCATOR_REPO}"
REF="${BOFH_GOLEM_REF:-$LOCATOR_REF}"
NODE_FLOOR=""

die() {
  echo "bofh-golem: $*" >&2
  exit 1
}

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  die "Node.js required. Install Node >=18 from https://nodejs.org"
fi

here=""
source_path="${BASH_SOURCE[0]:-}"
if [ -n "$source_path" ]; then
  here="$(cd "$(dirname "$source_path")" 2>/dev/null && pwd)" || here=""
fi

bootstrap=""
if [ -n "$here" ] && [ -f "$here/bootstrap.json" ]; then
  bootstrap="$here/bootstrap.json"
fi

tmp=""
cleanup() {
  if [ -n "$tmp" ] && [ -d "$tmp" ]; then
    rm -rf "$tmp"
  fi
}
trap cleanup EXIT INT TERM

read_metadata() {
  "$NODE_BIN" -e '
    const m = require(process.argv[1]);
    process.stdout.write([m.repo, m.ref, m.node].join("\n"));
  ' "$1"
}

if [ -z "$bootstrap" ]; then
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/bofh-golem.XXXXXX")"
  bootstrap="$tmp/bootstrap.json"
  url="${BOFH_GOLEM_BOOTSTRAP_URL:-https://raw.githubusercontent.com/$REPO/$REF/bootstrap.json}"
  curl -fsSL "$url" -o "$bootstrap" || die "cannot fetch bootstrap metadata: $url"
fi

if ! metadata="$(read_metadata "$bootstrap")"; then
  die "cannot read bootstrap metadata: $bootstrap"
fi
REPO="$(printf '%s\n' "$metadata" | sed -n '1p')"
REF="$(printf '%s\n' "$metadata" | sed -n '2p')"
NODE_FLOOR="$(printf '%s\n' "$metadata" | sed -n '3p')"

major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" || die "cannot read Node version"
if [ "$major" -lt "$NODE_FLOOR" ]; then
  die "Node $major too old. Need Node >=$NODE_FLOOR."
fi

if [ -z "${BOFH_GOLEM_FORCE_REMOTE:-}" ] && [ -n "$here" ] && [ -f "$here/installer/install.js" ]; then
  exec "$NODE_BIN" "$here/installer/install.js" "$@"
fi

if [ -z "$tmp" ]; then
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/bofh-golem.XXXXXX")"
fi

archive="${BOFH_GOLEM_ARCHIVE:-}"
if [ -z "$archive" ]; then
  archive="$tmp/repo.tar.gz"
  url="${BOFH_GOLEM_ARCHIVE_URL:-https://github.com/$REPO/archive/refs/heads/$REF.tar.gz}"
  echo "bofh-golem: fetching installer..." >&2
  curl -fsSL "$url" -o "$archive" || die "cannot download installer: $url"
fi

tar -xzf "$archive" -C "$tmp" || die "cannot extract installer archive: $archive"

installer=""
for candidate in "$tmp"/*/installer/install.js; do
  if [ -f "$candidate" ]; then
    installer="$candidate"
    break
  fi
done

if [ -z "$installer" ]; then
  die "installer not found in archive: $archive"
fi

"$NODE_BIN" "$installer" "$@"
