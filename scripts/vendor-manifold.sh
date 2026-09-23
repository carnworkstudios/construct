#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail
version=3.5.3
script_dir="$(cd "$(dirname "$0")" && pwd)"
target="$script_dir/../vendor/manifold"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
npm pack "manifold-3d@$version" --pack-destination "$staging"
tar -xzf "$staging/manifold-3d-$version.tgz" -C "$staging"
mkdir -p "$target"
cp "$staging/package/manifold.js" "$staging/package/manifold.wasm" "$staging/package/LICENSE" "$target/"
