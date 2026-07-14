#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "usage: $0 [<release-tag>|--current]" >&2
  exit 1
fi

release_tag="${1:---current}"
properties_file="gradle.properties"
backend_package_file="backend/package.json"
web_package_file="web/package.json"

if [ ! -f "$properties_file" ]; then
  echo "properties file not found: $properties_file" >&2
  exit 1
fi

if [ ! -f "$backend_package_file" ] || [ ! -f "$web_package_file" ]; then
  echo "backend/package.json and web/package.json must exist" >&2
  exit 1
fi

version_name="$(grep '^appVersionName=' "$properties_file" | cut -d= -f2-)"
version_code="$(grep '^appVersionCode=' "$properties_file" | cut -d= -f2-)"
backend_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$backend_package_file")"
web_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$web_package_file")"
expected_tag="v${version_name}"
apk_name="kestrel-${version_name}-release.apk"

if [ -z "$version_name" ] || [ -z "$version_code" ]; then
  echo "appVersionName/appVersionCode must be set in $properties_file" >&2
  exit 1
fi

if [ "$backend_version" != "$version_name" ]; then
  echo "backend/package.json version $backend_version does not match appVersionName=$version_name" >&2
  exit 1
fi

if [ "$web_version" != "$version_name" ]; then
  echo "web/package.json version $web_version does not match appVersionName=$version_name" >&2
  exit 1
fi

if [ "$release_tag" != "--current" ] && [ "$release_tag" != "$expected_tag" ]; then
  echo "Tag $release_tag does not match shared version $expected_tag" >&2
  exit 1
fi

resolved_tag="$expected_tag"
if [ "$release_tag" != "--current" ]; then
  resolved_tag="$release_tag"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "tag=$resolved_tag"
    echo "version_name=$version_name"
    echo "version_code=$version_code"
    echo "backend_version=$backend_version"
    echo "web_version=$web_version"
    echo "apk_name=$apk_name"
  } >> "$GITHUB_OUTPUT"
fi

echo "Resolved release metadata: tag=$resolved_tag version_name=$version_name version_code=$version_code"
