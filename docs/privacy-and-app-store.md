# Privacy and the App Store: audit and privacy manifest

Written 2026-11-01 against `main` at `3ac6fb07` plus the uncommitted manifest work described here. Everything below is read from the code, the configuration or the built binary. **Verified** means it was observed that way; **assumption** means it was not. No App Store validation has been run (there is no Apple account on this machine), so nothing here claims that an upload passes.

## What Clutter stores

All verified from the code.

| Where | What | Notes |
| --- | --- | --- |
| The user's own folders (Spaces) | Notes as Markdown, assets, and a `.clutter/` folder per Space (workspace session, tags, archive, collections, Space profile) | Written only through the atomic writer inside folders the user chose or that Clutter created in Documents |
| `<app data>/recovery/` | Crash-recovery records: snapshots of unsaved note text | `recovery_store.rs`; never sent anywhere |
| `<app data>/space-access.json` | macOS security-scoped bookmarks of chosen Spaces | `space_access.rs`; opaque system data |
| `<app cache>/` | The parsed-note cache | `parse_cache.rs`; derived from notes |
| WebView `localStorage` | 19 preference keys (`clutter-theme`, `clutter-sidebar-width`, and so on) and the Space registry (`clutter.spaces.v1`: folder paths) | |
| Logs | Nothing in release builds | `tauri-plugin-log` is only added when `debug_assertions` is on (`lib.rs`) |

## What Clutter sends, and to whom

| Traffic | Destination | What is sent | Evidence |
| --- | --- | --- | --- |
| Cover image search and pick | Clutter's own Cloudflare Worker, `clutter-unsplash-proxy.vigram-work.workers.dev`, which forwards to `api.unsplash.com` with a server-side key | The search text the user typed (or a built-in default term), page, orientation; or a photo id; or a download-tracking call | `UnsplashApi.ts`: plain GETs, no credentials, no key in the app |
| Cover and card images | `images.unsplash.com`, loaded directly by the WebView | An ordinary image request (so Unsplash's CDN sees the device's IP address) | CSP `img-src … https:` |
| Remote image or file download | Whatever address the user pastes or drops | A GET, started by the user | `fetchRemoteAsset.ts` and `downloadRemoteImage.ts`, through Tauri's HTTP plugin |
| Links the user clicks | The default browser | The URL | `tauri-plugin-opener` |

**Not present (verified by searching the source, `package.json` and `Cargo.toml`):** analytics, advertising, tracking, telemetry or crash-reporting code or SDKs. No identifier, account or sign-in exists, and none is sent.

**The Worker (repo source, read-only):** `workers/unsplash-proxy/src/index.ts` logs events without queries, ids or keys, answers `Cache-Control: no-store`, and `wrangler.toml` states that request logging is off.

**Assumptions, not verified:**
1. The deployed Worker is the code in the repository, and nothing at the Cloudflare account level (logpush, analytics) records requests.
2. What Unsplash does with the search terms it receives from the Worker. Unsplash sees the Worker's address, not the user's.

**Observation, not part of this task:** the HTTP plugin's capability allows `https://*` and `http://*`, and requests made through it are not subject to the page's `connect-src`. That is broader than the two remote downloads need.

## The privacy manifest

`apps/app/src-tauri/PrivacyInfo.xcprivacy` is new. It is placed in the bundle by `bundle.macOS.files` in `tauri.conf.json` (`Contents/Resources/PrivacyInfo.xcprivacy`), which changes no signing or distribution setting.

| Key | Value | Basis |
| --- | --- | --- |
| `NSPrivacyTracking` | `false` | No tracking code exists |
| `NSPrivacyTrackingDomains` | empty | No tracking domain is contacted |
| `NSPrivacyCollectedDataTypes` | empty | See "Decision 1" |
| File timestamp API | `3B52.1`, `C617.1`, `DDA9.1` | See below |

### Required-reason APIs

Evidence is the imported symbols of the **production** executable (a release build from this tree with no test harness; the harness plugin is absent) and the source.

| Category | Evidence | Declared |
| --- | --- | --- |
| File timestamp | Imports `stat`, `fstat`, `lstat`. The source reads modification and creation times: `fs.stat` in `LocalFileSystem.ts` feeds change detection (`VaultSyncService`) and the Created and Modified properties (`buildPageProperties.ts`); `parse_cache.rs` reads and sets the cache files' times; `atomic_replace.rs` compares file identity | **Yes.** `3B52.1`: files the user granted access to (Spaces). `C617.1`: files in the app's own container (recovery records, cache). `DDA9.1`: shown to the user (Created and Modified). Nothing is sent off the device |
| System boot time | Imports `clock_gettime` (Rust's clock), not `mach_absolute_time`; no `systemUptime` | **No.** Apple's documented list for this category is `systemUptime` and `mach_absolute_time`. Whether `clock_gettime` is also flagged is not established |
| User defaults | No `NSUserDefaults` or `CFPreferences` string or symbol | No |
| Active keyboards | No `activeInputModes` | No |
| Disk space | Imports `fstatfs`, which is on Apple's disk-space list | **Not declared: see "Decision 2"** |

`sysctlbyname` is imported, but the only name in the binary is `hw.optional.armv8_2_sha512` (CPU feature detection for hashing), which is not a boot-time query.

### Verification performed

- `plutil -lint` passes on the source file and on the copy in the bundle; the two are byte-identical.
- A production bundle was built from the repository's own configuration (`tauri build --bundles app`, identifier `com.clutter.dev`, ad-hoc signature). The manifest is in `Contents/Resources`, and `codesign --verify --deep --strict` passes with it inside.
- `scripts/verify-bundle.sh` now checks that the manifest exists, is a valid property list, declares the file timestamp category and states the tracking answer. It passes on that bundle and **fails** on a bundle without the manifest.
- **Not done:** Apple's own validation (upload, `altool` or Transporter). It needs an Apple account and signing, so it has not been run. The manifest's contents are not confirmed against Apple's validator.

## Encryption and export compliance

**Facts (verified):**
- `sha2` (SHA-256) is used for hashing: the parsed-note cache key (`parse_cache.rs`) and the file name of a saved bookmark (`space_access.rs`). Hashing provides no confidentiality.
- Nothing encrypts notes or settings. Saved Space access uses the operating system's bookmarks.
- The WebView's own HTTPS uses the operating system.
- **The app's own HTTPS client does not use the operating system's TLS.** `tauri-plugin-http` is built with its default `rustls-tls` feature, so `rustls` and `ring` are compiled into the executable; `Cargo.lock` lists them and the binary contains them, and it imports no `Security.framework` TLS symbols. That client is used for the user's remote downloads.
- `ITSAppUsesNonExemptEncryption` is not in `Info.plist` and was not added.

**Conclusion:** answering `false` ("only encryption provided by the operating system, or exempt uses") cannot be established with confidence, because the app carries its own standard TLS implementation. This is a regulatory classification, not a code question, so it needs a decision before the key is set.

## Decisions for the owner

1. **Search terms and `NSPrivacyCollectedDataTypes`.** The manifest declares nothing collected. That matches the Worker's source (nothing retained) and Apple's meaning of "collected" (kept beyond serving the request). If you would rather be conservative, or Unsplash's retention counts, declare *Search History* (not linked to the user, not used for tracking, purpose: app functionality). The answers in App Store Connect's nutrition label must match whichever you choose.
2. **`fstatfs` and the disk-space category.** Clutter calls `fstatfs` only to read the volume's filesystem type before an atomic save (`atomic_replace.rs`). None of Apple's disk-space reasons describes that. Options: (a) change the probe to a call outside the disk-space list; this touches the atomic writer's safety check, so it is a deliberate change; (b) declare the nearest reason anyway, which would not be accurate; (c) leave it undeclared and see what Apple's validation reports. This audit has not changed the atomic writer.
3. **Encryption.** (a) Build `tauri-plugin-http` with `native-tls` and `default-features = false`, so the app's only TLS is the operating system's; `ITSAppUsesNonExemptEncryption = false` is then defensible, but the change replaces the TLS stack of the remote downloads and needs a test. (b) Keep the bundled TLS, answer Apple's export-compliance questions accordingly, and have the classification and any annual reporting confirmed. (c) Remove the dependency if the remote downloads can go through a different path. The key stays unset until you choose.
4. **Not part of this task, noted for later:** narrow the HTTP plugin's `https://*` and `http://*` capability.
