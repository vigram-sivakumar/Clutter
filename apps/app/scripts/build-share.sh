#!/bin/bash
# Build the same direct-distribution artifact using Developer ID and notarization.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CLUTTER_DIRECT_SIGNING=developer-id exec bash "$HERE/build-sparkle-integration.sh" direct
