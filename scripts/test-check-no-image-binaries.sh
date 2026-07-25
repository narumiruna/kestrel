#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
checker="$repo_root/scripts/check-no-image-binaries.sh"

test -x "$checker" || {
  echo "checker is missing or not executable: $checker" >&2
  exit 1
}

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
repo="$workdir/repo"
git init -q "$repo"
git -C "$repo" config user.name "Image Policy Test"
git -C "$repo" config user.email "image-policy@example.invalid"

expect_pass() {
  local label="$1"
  shift
  if ! "$@" >"$workdir/output" 2>&1; then
    echo "expected pass: $label" >&2
    cat "$workdir/output" >&2
    exit 1
  fi
}

expect_fail() {
  local label="$1"
  shift
  if "$@" >"$workdir/output" 2>&1; then
    echo "expected failure: $label" >&2
    exit 1
  fi
  grep -q "image binary policy violation" "$workdir/output" || {
    echo "failure did not report the image policy: $label" >&2
    cat "$workdir/output" >&2
    exit 1
  }
}

printf 'plain text\n' >"$repo/README.md"
printf '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n' >"$repo/icon.svg"
git -C "$repo" add README.md icon.svg
git -C "$repo" commit -qm "base"
base_commit="$(git -C "$repo" rev-parse HEAD)"
expect_pass "ordinary text and SVG" "$checker" --tracked "$repo"

printf 'not an image\n' >"$repo/fake.png"
git -C "$repo" add -f fake.png
expect_fail "forbidden image extension" "$checker" --staged "$repo"
git -C "$repo" reset -q HEAD -- fake.png
rm "$repo/fake.png"

# A minimal PNG signature + IHDR header is enough for `file` to identify image/png.
printf '\211PNG\r\n\032\n\000\000\000\rIHDR\000\000\000\001\000\000\000\001\010\006\000\000\000' >"$repo/opaque-asset"
git -C "$repo" add opaque-asset
expect_fail "extensionless PNG magic" "$checker" --staged "$repo"
git -C "$repo" commit -qm "add forbidden binary for range test"
expect_fail "tracked extensionless PNG" "$checker" --tracked "$repo"

git -C "$repo" rm -q opaque-asset
expect_pass "staged deletion has no image blob" "$checker" --staged "$repo"
git -C "$repo" commit -qm "delete forbidden binary"
expect_pass "clean tree after deletion" "$checker" --tracked "$repo"
expect_fail "add-then-delete remains in history" "$checker" --range "$repo" "$base_commit..HEAD"

printf 'image policy tests passed\n'
