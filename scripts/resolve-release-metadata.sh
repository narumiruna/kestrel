#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <release-tag>" >&2
  exit 1
fi

release_tag="$1"
properties_file="gradle.properties"

if [ ! -f "$properties_file" ]; then
  echo "properties file not found: $properties_file" >&2
  exit 1
fi

version_name="$(grep '^appVersionName=' "$properties_file" | cut -d= -f2-)"
version_code="$(grep '^appVersionCode=' "$properties_file" | cut -d= -f2-)"
expected_tag="v${version_name}"
apk_name="kestrel-${version_name}-release-unsigned.apk"

if [ -z "$version_name" ] || [ -z "$version_code" ]; then
  echo "appVersionName/appVersionCode must be set in $properties_file" >&2
  exit 1
fi

if [ "$release_tag" != "$expected_tag" ]; then
  echo "Tag $release_tag does not match gradle.properties appVersionName=$version_name" >&2
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "tag=$release_tag"
    echo "version_name=$version_name"
    echo "version_code=$version_code"
    echo "apk_name=$apk_name"
  } >> "$GITHUB_OUTPUT"
fi

echo "Resolved release metadata: tag=$release_tag version_name=$version_name version_code=$version_code"
