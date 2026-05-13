#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

VALID_BUMP_TYPES = ("major", "minor", "patch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bump shared Android/web/backend app version metadata.",
    )
    parser.add_argument(
        "bump_type",
        choices=VALID_BUMP_TYPES,
        help="Semantic version segment to increment.",
    )
    parser.add_argument(
        "--properties-file",
        default="gradle.properties",
        help="Path to gradle.properties.",
    )
    parser.add_argument(
        "--backend-package-json",
        default="backend/package.json",
        help="Path to backend package.json.",
    )
    parser.add_argument(
        "--backend-package-lock",
        default="backend/package-lock.json",
        help="Path to backend package-lock.json.",
    )
    parser.add_argument(
        "--web-package-json",
        default="web/package.json",
        help="Path to web package.json.",
    )
    parser.add_argument(
        "--web-package-lock",
        default="web/package-lock.json",
        help="Path to web package-lock.json.",
    )
    return parser.parse_args()


def read_properties(path: Path) -> tuple[dict[str, str], list[str]]:
    lines = path.read_text().splitlines()
    properties: dict[str, str] = {}
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        properties[key] = value
    return properties, lines


def replace_or_append(lines: list[str], key: str, value: str) -> list[str]:
    replacement = f"{key}={value}"
    for index, line in enumerate(lines):
        if line.startswith(f"{key}="):
            updated = list(lines)
            updated[index] = replacement
            return updated
    return [*lines, replacement]


def parse_version(version: str) -> tuple[int, int, int]:
    parts = version.strip().split(".")
    if len(parts) not in (2, 3):
        raise ValueError("version must have 2 or 3 numeric dot-separated parts")
    if any(not part.isdigit() for part in parts):
        raise ValueError("version parts must be numeric")

    major = int(parts[0])
    minor = int(parts[1])
    patch = int(parts[2]) if len(parts) == 3 else 0
    return major, minor, patch


def bump_version(version: str, bump_type: str) -> str:
    major, minor, patch = parse_version(version)

    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1

    return f"{major}.{minor}.{patch}"


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as error:
        raise FileNotFoundError(f"file not found: {path}") from error


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def prepare_package_version(
    path: Path,
    expected_current_version: str,
    target_version: str,
) -> dict:
    package = load_json(path)
    current_version = package.get("version")
    if current_version != expected_current_version:
        raise ValueError(
            f"{path} version mismatch: expected {expected_current_version}, found {current_version}",
        )
    package["version"] = target_version
    return package


def prepare_package_lock_version(
    path: Path,
    expected_current_version: str,
    target_version: str,
) -> dict:
    package_lock = load_json(path)
    current_version = package_lock.get("version")
    if current_version != expected_current_version:
        raise ValueError(
            f"{path} root version mismatch: expected {expected_current_version}, found {current_version}",
        )

    package_root = package_lock.get("packages", {}).get("")
    if not isinstance(package_root, dict):
        raise ValueError(f"{path} is missing packages[''] metadata")

    root_package_version = package_root.get("version")
    if root_package_version != expected_current_version:
        raise ValueError(
            f"{path} packages[''] version mismatch: expected {expected_current_version}, found {root_package_version}",
        )

    package_lock["version"] = target_version
    package_root["version"] = target_version
    return package_lock


def main() -> int:
    args = parse_args()
    properties_path = Path(args.properties_file)

    if not properties_path.exists():
        print(f"properties file not found: {properties_path}", file=sys.stderr)
        return 1

    properties, lines = read_properties(properties_path)

    current_version_name = properties.get("appVersionName")
    current_version_code_text = properties.get("appVersionCode")
    if not current_version_name:
        print("existing appVersionName is missing", file=sys.stderr)
        return 1
    if current_version_code_text is None or not current_version_code_text.isdigit():
        print("existing appVersionCode is missing or invalid", file=sys.stderr)
        return 1

    try:
        target_version_name = bump_version(current_version_name, args.bump_type)
    except ValueError as error:
        print(f"invalid appVersionName {current_version_name!r}: {error}", file=sys.stderr)
        return 1

    target_version_code = int(current_version_code_text) + 1
    updated_lines = replace_or_append(lines, "appVersionCode", str(target_version_code))
    updated_lines = replace_or_append(updated_lines, "appVersionName", target_version_name)

    try:
        backend_package = prepare_package_version(
            Path(args.backend_package_json),
            current_version_name,
            target_version_name,
        )
        backend_package_lock = prepare_package_lock_version(
            Path(args.backend_package_lock),
            current_version_name,
            target_version_name,
        )
        web_package = prepare_package_version(
            Path(args.web_package_json),
            current_version_name,
            target_version_name,
        )
        web_package_lock = prepare_package_lock_version(
            Path(args.web_package_lock),
            current_version_name,
            target_version_name,
        )
    except (FileNotFoundError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    properties_path.write_text("\n".join(updated_lines) + "\n")
    write_json(Path(args.backend_package_json), backend_package)
    write_json(Path(args.backend_package_lock), backend_package_lock)
    write_json(Path(args.web_package_json), web_package)
    write_json(Path(args.web_package_lock), web_package_lock)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with Path(github_output).open("a") as handle:
            handle.write(f"version_name={target_version_name}\n")
            handle.write(f"version_code={target_version_code}\n")
            handle.write(f"previous_version_name={current_version_name}\n")
            handle.write(f"bump_type={args.bump_type}\n")

    print(
        "Updated shared version metadata: "
        f"{current_version_name} -> {target_version_name} "
        f"(appVersionCode {current_version_code_text} -> {target_version_code})",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
