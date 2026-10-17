#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mobile_dir="$(cd -- "$script_dir/.." && pwd)"
cd "$mobile_dir"

usage() {
  cat <<'USAGE'
Usage: ./tool/format_dart.sh [--fix|--check]

  --fix    Apply the canonical Dart formatter to lib/ and test/.
  --check  Check formatting without changing files (default).
USAGE
}

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

mode="${1:---check}"
case "$mode" in
  --fix)
    dart format lib test
    ;;
  --check)
    dart format --output=none --set-exit-if-changed lib test
    ;;
  -h|--help)
    usage
    ;;
  *)
    echo "Unsupported option: $mode" >&2
    usage >&2
    exit 2
    ;;
esac
