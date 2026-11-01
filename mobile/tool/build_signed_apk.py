#!/usr/bin/env python3
"""Build a signed Android APK and increment its version from pubspec/tags.

Run from any directory with:
    python mobile/tool/build_signed_apk.py

Signing credentials are read from ANDROID_KEYSTORE_PATH,
ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD.
Missing values are prompted for interactively; passwords are never echoed.
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TAG_PATTERN = re.compile(r"^v(\d+)\.(\d+)\.(\d+)-build\.(\d+)$")
PUBSPEC_PATTERN = re.compile(
    r"^(version:\s*)(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?\s*$", re.MULTILINE
)


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    print("\n$ " + " ".join(str(part) for part in command))
    subprocess.run(command, cwd=cwd, env=env, check=True)


def get_signing_value(name: str, prompt: str, *, secret: bool = False) -> str:
    value = os.environ.get(name, "")
    if not secret:
        value = value.strip()
    if value:
        return value
    if not sys.stdin.isatty():
        raise RuntimeError(
            f"{name} is required. Set it in the environment or run interactively."
        )
    value = getpass.getpass(prompt) if secret else input(prompt).strip()
    if not value:
        raise RuntimeError(f"{name} cannot be empty.")
    os.environ[name] = value
    return value


def latest_release_tags(repo_root: Path) -> list[tuple[tuple[int, int, int], int]]:
    result = subprocess.run(
        ["git", "tag", "--list", "v*-build.*"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=True,
    )
    tags: list[tuple[tuple[int, int, int], int]] = []
    for tag in result.stdout.splitlines():
        match = TAG_PATTERN.fullmatch(tag.strip())
        if match:
            major, minor, patch, build = (int(part) for part in match.groups())
            tags.append(((major, minor, patch), build))
    return tags


def next_version(pubspec_text: str, tags: list[tuple[tuple[int, int, int], int]]) -> tuple[str, int]:
    match = PUBSPEC_PATTERN.search(pubspec_text)
    if not match:
        raise RuntimeError("Could not parse the version line in mobile/pubspec.yaml.")

    current_version = tuple(int(match.group(index)) for index in (2, 3, 4))
    current_build = int(match.group(5) or 0)
    latest_tag_version = max((version for version, _ in tags), default=(0, 0, 0))
    latest_tag_build = max((build for _, build in tags), default=0)

    base_version = max(current_version, latest_tag_version)
    next_semver = (base_version[0], base_version[1], base_version[2] + 1)
    next_build = max(current_build, latest_tag_build) + 1
    return ".".join(str(part) for part in next_semver), next_build


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build and sign a version-incremented Android APK."
    )
    parser.add_argument(
        "--skip-checks",
        action="store_true",
        help="Skip flutter analyze and flutter test (not recommended).",
    )
    parser.add_argument(
        "--no-fetch-tags",
        action="store_true",
        help="Do not fetch current release tags from origin before incrementing.",
    )
    args = parser.parse_args()

    mobile_dir = Path(__file__).resolve().parents[1]
    repo_root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=mobile_dir,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()
    )
    pubspec_path = mobile_dir / "pubspec.yaml"
    pubspec_text = pubspec_path.read_text(encoding="utf-8")

    flutter = shutil.which("flutter")
    if not flutter:
        raise RuntimeError("Flutter is not on PATH. Install the project Flutter SDK first.")
    if not shutil.which("git"):
        raise RuntimeError("Git is required to find the latest release tags.")

    if not args.no_fetch_tags:
        has_origin = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=repo_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode == 0
        if has_origin:
            print("Fetching release tags from origin to avoid a duplicate/older version...")
            run(["git", "fetch", "--quiet", "--tags", "origin"], cwd=repo_root)

    tags = latest_release_tags(repo_root)
    build_name, build_number = next_version(pubspec_text, tags)
    build_version_line = f"version: {build_name}+{build_number}"
    updated_pubspec = PUBSPEC_PATTERN.sub(build_version_line, pubspec_text, count=1)
    if updated_pubspec == pubspec_text:
        raise RuntimeError("Could not update the version line in mobile/pubspec.yaml.")

    signing = {
        "ANDROID_KEYSTORE_PATH": get_signing_value(
            "ANDROID_KEYSTORE_PATH", "Path to the existing release .jks/.keystore file: "
        ),
        "ANDROID_KEYSTORE_PASSWORD": get_signing_value(
            "ANDROID_KEYSTORE_PASSWORD", "Keystore password (hidden): ", secret=True
        ),
        "ANDROID_KEY_ALIAS": get_signing_value(
            "ANDROID_KEY_ALIAS", "Release key alias: "
        ),
        "ANDROID_KEY_PASSWORD": get_signing_value(
            "ANDROID_KEY_PASSWORD", "Release key password (hidden): ", secret=True
        ),
    }
    keystore_path = Path(signing["ANDROID_KEYSTORE_PATH"]).expanduser()
    if not keystore_path.is_file():
        raise RuntimeError(f"Keystore file not found: {keystore_path}")
    signing["ANDROID_KEYSTORE_PATH"] = str(keystore_path.resolve())

    if not (mobile_dir / "android" / "app" / "google-services.json").is_file():
        print(
            "WARNING: google-services.json is missing. APK can build, but Firebase "
            "Android features such as push notifications may not work."
        )

    env = os.environ.copy()
    env.update(signing)

    print(f"\nBuilding signed APK v{build_name}+{build_number} ...")
    run([flutter, "pub", "get"], cwd=mobile_dir, env=env)
    if not args.skip_checks:
        run([flutter, "analyze"], cwd=mobile_dir, env=env)
        run(
            [flutter, "test", "--concurrency=1", "--reporter", "expanded"],
            cwd=mobile_dir,
            env=env,
        )
    run(
        [
            flutter,
            "build",
            "apk",
            "--release",
            "--build-name",
            build_name,
            "--build-number",
            str(build_number),
        ],
        cwd=mobile_dir,
        env=env,
    )

    apk_path = mobile_dir / "build" / "app" / "outputs" / "flutter-apk" / "app-release.apk"
    if not apk_path.is_file() or apk_path.stat().st_size == 0:
        raise RuntimeError(f"Flutter completed without producing an APK at {apk_path}")

    dist_dir = mobile_dir / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    export_path = dist_dir / f"police-telegrams-v{build_name}-build.{build_number}.apk"
    shutil.copy2(apk_path, export_path)

    # Persist the version only after all checks and the signed build succeeded.
    pubspec_path.write_text(updated_pubspec, encoding="utf-8")

    print("\nBuild complete.")
    print(f"Version: v{build_name}-build.{build_number}")
    print(f"APK: {export_path}")
    print(f"Size: {export_path.stat().st_size:,} bytes")
    print("The existing pubspec version was updated after the successful build.")
    print("Install as an update only if this APK uses the same signing key as the installed app.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"\nERROR: command failed with exit code {error.returncode}.", file=sys.stderr)
        raise SystemExit(error.returncode)
    except (OSError, RuntimeError) as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
