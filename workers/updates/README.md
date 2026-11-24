# Clutter direct distribution

The public, read-only Worker serves the Sparkle feed, versioned universal releases and the optional Terminal installer from or alongside the private R2 bucket `clutter-releases`.

Production URL: `https://updates.clutterapp.workers.dev`

- `GET /appcast.xml`: current Sparkle appcast, no-store.
- `GET /releases/Clutter_X.Y.Z_universal.zip`: signed full update archive.
- `GET /releases/Clutter_X.Y.Z_universal.dmg`: manual installer (ad-hoc signed for controlled beta; Developer ID signed and notarized for production).
- `GET /releases/Clutter_N_to_M_universal.delta`: signed differential archive.
- `GET /install.sh`: reviewable macOS shell installer embedded in the Worker.
- Legacy Tauri and Apple Silicon beta routes remain available for compatibility.
- Only GET and HEAD are accepted. Unapproved paths return 404. The Worker never writes to R2.

## Terminal installation

Starting with 0.0.9, users can run:

```sh
curl -fsS https://updates.clutterapp.workers.dev/install.sh | bash
```

Review-before-execution alternative (choose a new temporary file):

```sh
installer=$(mktemp -t clutter-installer) &&
curl -fsS https://updates.clutterapp.workers.dev/install.sh -o "$installer" &&
less "$installer" &&
bash "$installer"
rm -f "$installer"
```

Quit less with q to execute the reviewed installer. Running the installation command is consent to install; there is no extra confirmation prompt. The script uses the same universal ZIP as Sparkle, checks the platform, feed URL, SHA-256 and size, bundle signature, bundle identifier, version, pinned public updater key and embedded feed URL, then stages the app in /Applications before a no-clobber move. No sudo, no Homebrew, no change to system security settings or quarantine, and automatic launch after successful installation. A launch failure is reported separately, without undoing the verified installation. Existing Clutter installations in /Applications or ~/Applications must be updated through Sparkle or handled manually.

The bootstrap and its checksum metadata are trusted through HTTPS. The installer does not independently verify Sparkle's Ed25519 signature; the publisher verifies it before upload, and installed Sparkle clients verify their updates. Ad-hoc beta signatures do not authenticate a developer. Beta distribution instructions must disclose that Apple has not notarized the app; macOS may still require approval. The installer reports this limitation if the launch command fails. Developer ID releases additionally require a Developer ID signature and successful Gatekeeper assessment. Pin the production signing team before public release. Native installation on both architectures remains to be validated.

## Deployment and publication

From this directory install dependencies, run `npm run typecheck && npm test && npm run deploy`. Keep the existing Worker name `updates`, private bucket, and binding `RELEASES`. Do not recreate or expose the bucket.

From the repository root, prepare with `npm run release:direct -- X.Y.Z --prepare`, validate the local artifacts, then publish the exact prepared bytes with `npm run release:direct -- X.Y.Z`. The publisher verifies the archive signature and checksum, uploads immutable artifacts first, and updates the appcast last. The Terminal installer automatically follows that feed without a separate build or publication command.

The Sparkle private key stays on the release machine. Never put it in Cloudflare, GitHub, the repository or chat.

## Local development

Run `npm install && npm run dev`. Wrangler can use local R2 simulation.
