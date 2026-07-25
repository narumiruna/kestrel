#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  scripts/check-no-image-binaries.sh --staged [repository]
  scripts/check-no-image-binaries.sh --tracked [repository]
  scripts/check-no-image-binaries.sh --range [repository] <revision>...
  scripts/check-no-image-binaries.sh --all-history [repository]
  scripts/check-no-image-binaries.sh --pre-push [repository]
EOF
  exit 2
}

test "$#" -ge 1 || usage
mode="$1"
shift
repo="."
if test "$#" -gt 0 && test -d "$1/.git"; then
  repo="$1"
  shift
fi

git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || {
  echo "not a Git repository: $repo" >&2
  exit 2
}

cache_dir="$(mktemp -d)"
trap 'rm -rf "$cache_dir"' EXIT
violations=0

has_forbidden_extension() {
  local path lower
  path="$1"
  lower="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *.png | *.apng | *.mng | *.jpg | *.jpeg | *.jpe | *.jif | *.jfif | *.jfi | *.jp2 | *.j2k | *.jpf | *.jpx | *.jpm | *.mj2 | *.jxr | *.hdp | *.wdp | *.gif | *.raw | *.webp | *.avif | *.heif | *.heic | *.bmp | *.dib | *.tif | *.tiff | *.ico)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

mime_for_oid() {
  local oid cache_file object_type mime
  oid="$1"
  cache_file="$cache_dir/$oid"
  if test -f "$cache_file"; then
    IFS= read -r mime <"$cache_file"
    printf '%s\n' "$mime"
    return
  fi

  object_type="$(git -C "$repo" cat-file -t "$oid" 2>/dev/null || true)"
  if test "$object_type" != "blob"; then
    mime="application/x-git-$object_type"
  else
    mime="$(git -C "$repo" cat-file blob "$oid" | file -b --mime-type - 2>/dev/null || true)"
    test -n "$mime" || mime="application/octet-stream"
  fi
  printf '%s\n' "$mime" >"$cache_file"
  printf '%s\n' "$mime"
}

is_binary_image_mime() {
  local mime
  mime="$1"
  case "$mime" in
    image/svg+xml)
      return 1
      ;;
    image/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

report_violation() {
  local source path oid reason
  source="$1"
  path="$2"
  oid="$3"
  reason="$4"
  printf 'image binary policy violation: source=%s path=%q blob=%s reason=%s\n' \
    "$source" "$path" "$oid" "$reason" >&2
  violations=$((violations + 1))
}

check_blob() {
  local source path oid mime
  source="$1"
  path="$2"
  oid="$3"

  if has_forbidden_extension "$path"; then
    report_violation "$source" "$path" "$oid" "forbidden image extension"
    return
  fi

  mime="$(mime_for_oid "$oid")"
  if is_binary_image_mime "$mime"; then
    report_violation "$source" "$path" "$oid" "detected MIME $mime"
  fi
}

scan_staged() {
  local path oid
  while IFS= read -r -d '' path; do
    oid="$(git -C "$repo" rev-parse ":$path" 2>/dev/null || true)"
    test -n "$oid" || continue
    check_blob "staged" "$path" "$oid"
  done < <(git -C "$repo" diff --cached --name-only --diff-filter=ACMR -z)
}

scan_tracked() {
  local path oid
  while IFS= read -r -d '' path; do
    oid="$(git -C "$repo" rev-parse ":$path" 2>/dev/null || true)"
    test -n "$oid" || continue
    check_blob "tracked" "$path" "$oid"
  done < <(git -C "$repo" ls-files -z)
}

scan_history() {
  local commit path oid
  test "$#" -gt 0 || usage
  while IFS= read -r commit; do
    test -n "$commit" || continue
    while IFS= read -r -d '' path; do
      oid="$(git -C "$repo" rev-parse "$commit:$path" 2>/dev/null || true)"
      test -n "$oid" || continue
      check_blob "commit:$commit" "$path" "$oid"
    done < <(git -C "$repo" diff-tree --root -m --no-commit-id --name-only -r -z "$commit")
  done < <(git -C "$repo" rev-list "$@")
}

scan_pre_push() {
  local from_ref to_ref zero
  from_ref="${PRE_COMMIT_FROM_REF:-}"
  to_ref="${PRE_COMMIT_TO_REF:-HEAD}"
  zero="0000000000000000000000000000000000000000"

  if test "$to_ref" = "$zero"; then
    return
  fi
  if test -z "$from_ref" || test "$from_ref" = "$zero"; then
    scan_history "$to_ref"
  else
    scan_history "$from_ref..$to_ref"
  fi
}

case "$mode" in
  --staged)
    test "$#" -eq 0 || usage
    scan_staged
    ;;
  --tracked)
    test "$#" -eq 0 || usage
    scan_tracked
    ;;
  --range)
    scan_history "$@"
    ;;
  --all-history)
    test "$#" -eq 0 || usage
    scan_history --all --reflog
    ;;
  --pre-push)
    test "$#" -eq 0 || usage
    scan_pre_push
    ;;
  *)
    usage
    ;;
esac

if test "$violations" -gt 0; then
  printf 'image binary policy rejected %d item(s); keep image captures outside Git.\n' "$violations" >&2
  exit 1
fi

printf 'image binary policy passed (%s)\n' "$mode"
