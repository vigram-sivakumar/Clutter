# Clutter update distribution

A public, read-only Worker serves Tauri's signed update manifest and release artifacts from the private `clutter-releases` R2 bucket. The bucket itself stays private.

Production URL: `https://updates.clutterapp.workers.dev`

- `GET /latest.json` serves the current manifest with no-store caching.
- `GET /releases/<filename>.app.tar.gz` serves a signed Tauri updater archive.
- `GET /releases/<filename>.dmg` serves the notarized installer.
- Only GET and HEAD are accepted. Other paths and file types return 404.
- The Worker never accepts uploads or writes to R2.

Tauri verifies the archive signature against the public key embedded in the direct-download build. The Worker only distributes the manifest and bytes.

## One-time setup

1. Create the private R2 bucket named `clutter-releases`.
2. From this directory, run `npm install` and `npx wrangler login`.
3. Run `npm run typecheck` and `npm run build:check`.
4. Deploy with `npx wrangler deploy`.
5. Verify `curl -i https://updates.clutterapp.workers.dev/latest.json` returns 404 while the bucket is empty.

Wrangler creates the `RELEASES` binding from `wrangler.toml`. Do not enable public bucket access and do not put API tokens, bucket credentials or the Tauri signing key in this Worker.

## Publishing

After a signed and notarized share build, run `npm run publish:update` from `apps/app`. It uploads the updater archive and DMG to `releases/`, then uploads `latest.json` last so clients cannot see a release before its archive exists.

The Tauri updater private key stays on the release machine. Never put it in Cloudflare, GitHub, this repository or chat.

## Local development

Run `npm install` and `npm run dev`. Wrangler uses the R2 binding in `wrangler.toml`; local development can use Wrangler's local R2 simulation.
