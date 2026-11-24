#!/bin/bash
# Build the signed Sparkle Apple Silicon beta without publishing.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/build-sparkle-integration.sh" beta
