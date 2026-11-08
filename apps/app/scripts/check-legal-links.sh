#!/bin/bash
# Fails unless the privacy policy and support addresses in src/core/legalLinks.ts are both set to https URLs: the Mac App
# Store requires a privacy policy URL in App Store Connect and an accessible link in the app (Guideline 5.1.1(i)), and
# a support URL. Until they are published the entries stay hidden in Settings, which is correct for development builds
# but not for a submission. Run by `npm run build:appstore`; `npm run check:legal-links` runs it on its own.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FILE="$HERE/../src/core/legalLinks.ts"
FAILED=0
for NAME in privacyPolicy support; do
  VALUE=$(sed -nE "s/^[[:space:]]*$NAME:[[:space:]]*'([^']*)'.*/\1/p" "$FILE" | head -1)
  if echo "$VALUE" | grep -qE "^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(/[^[:space:]]*)?$"; then
    echo "ok:   $NAME is set: $VALUE"
  else
    echo "FAIL: $NAME is not set to an https URL in src/core/legalLinks.ts (publish docs/privacy-policy.md and docs/support.md, then set it)"
    FAILED=1
  fi
done
exit $FAILED
