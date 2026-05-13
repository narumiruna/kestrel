#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

VERSION_NAME_PATTERN = re.compile(r"^[0-9]+(\.[0-9]+){1,2}([-.][0-9A-Za-z.-]+)?$")
VERSION_CODE_PATTERN = re.compile(r"^[0-9]+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update appVersionName/appVersionCode in gradle.properties.",
    )
    parser.add_argument("version_name")
    parser.add_argument(
        "version_code",
        nargs="?",
        default="",
        help="Optional explicit appVersionCode. Defaults to current + 1.",
    )
    parser.add_argument(
        "--properties-file",
        default="gradle.properties",
        help="Path to gradle.properties.",
    )
    return parser.parse_args()


def read_properties(path: Path) -> tuple[str, dict[str, str], list[str]]:
    text = path.read_text()
    lines = text.splitlines()
    properties: dict[str, str] = {}
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        properties[key] = value
    return text, properties, lines


def replace_or_append(lines: list[str], key: str, value: str) -> list[str]:
    replacement = f"{key}={value}"
    for index, line in enumerate(lines):
        if line.startswith(f"{key}="):
            updated = list(lines)
            updated[index] = replacement
            return updated
    return [*lines, replacement]


def main() -> int:
    args = parse_args()
    version_name = args.version_name.strip()
    version_code_input = args.version_code.strip()
    properties_path = Path(args.properties_file)

    if not VERSION_NAME_PATTERN.fullmatch(version_name):
        print(
            "version_name must look like 1.1, 1.1.0, or 1.1.0-beta.1",
            file=sys.stderr,
        )
        return 1

    if not properties_path.exists():
        print(f"properties file not found: {properties_path}", file=sys.stderr)
        return 1

    _, properties, lines = read_properties(properties_path)

    current_version_code_text = properties.get("appVersionCode")
    if current_version_code_text is None or not VERSION_CODE_PATTERN.fullmatch(
        current_version_code_text,
    ):
        print("existing appVersionCode is missing or invalid", file=sys.stderr)
        return 1

    current_version_code = int(current_version_code_text)
    target_version_code_text = version_code_input or str(current_version_code + 1)

    if not VERSION_CODE_PATTERN.fullmatch(target_version_code_text):
        print("version_code must be a positive integer", file=sys.stderr)
        return 1

    target_version_code = int(target_version_code_text)
    if target_version_code <= current_version_code:
        print(
            f"version_code must be greater than current appVersionCode={current_version_code}",
            file=sys.stderr,
        )
        return 1

    updated_lines = replace_or_append(lines, "appVersionCode", str(target_version_code))
    updated_lines = replace_or_append(updated_lines, "appVersionName", version_name)
    properties_path.write_text("\n".join(updated_lines) + "\n")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with Path(github_output).open("a") as handle:
            handle.write(f"version_code={target_version_code}\n")

    print(f"Updated {properties_path}: appVersionName={version_name}, appVersionCode={target_version_code}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
