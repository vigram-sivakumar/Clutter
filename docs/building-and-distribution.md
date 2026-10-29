# Building and distributing Clutter

**One Clutter. One saving system. One sandbox and permission system. Different packaging only.**

Sandboxing, the folder permissions, security-scoped bookmarks and atomic saves ([ADR-063](./adr/063-atomic-vault-saves.md)) are Clutter's own functionality, not Mac App Store features. A `.dmg` you build and install locally behaves exactly like the app downloaded from the Mac App Store: App Sandbox on; Create Space makes `~/Documents/<name>` after the user clicks Create, asking once for Documents authorization; Open Existing Space uses the native picker for any folder macOS permits and keeps access across restarts through bookmarks; atomic saves always, with the old writer disabled and no fallback. None of it is behind a distribution flag. The entitlements live in `src-tauri/Entitlements.plist` and `tauri.conf.json`, and every packaged build is signed with them. The distribution variants differ only in signing and packaging.

## The commands

Run from `apps/app` (or from the repository root: the same scripts are forwarded).

| Goal | Command | Works today? | Needs |
| --- | --- | --- | --- |
| Run during development (unsandboxed, convenient) | `npm run tauri dev` | Yes | nothing |
| Run during development **inside the sandbox** | `npm run dev:sandbox` | Yes | nothing |
| Build to install on **this** Mac | `npm run tauri build` | Yes | nothing |
| Build an installer to **share with testers** | `npm run build:share` | Stops with a clear list of what is missing | Developer ID certificate + Apple notarization credentials |
| Prepare the **Mac App Store** submission | `npm run build:appstore` | Stops with a clear list of what is missing | App Store distribution certificates, installer certificate, provisioning profile, registered bundle id |
| Check any built `.app` | `npm run verify:bundle -- <path.app> [--local\|--share\|--submission]` | Yes | nothing |

### Development: `npm run tauri dev` and `npm run dev:sandbox`

`npm run tauri dev` runs the unsandboxed development app: your whole home is available, which is convenient, and atomic saves are on exactly as in production (the native writer is a *default* Cargo feature, the interface flag is on, there is no switch). Because the system provides the home folder, the Documents authorization and bookmarks have nothing to do there; they activate whenever the process really is sandboxed (the system sets `APP_SANDBOX_CONTAINER_ID`), not by a build flag.

`npm run dev:sandbox` runs the same development code **inside the sandbox**, with the same entitlements, so you can test the real behavior (Documents authorization on the first Create, bookmarks surviving a restart, unauthorized paths refused by the system) without packaging. It builds the debug binary, wraps it in a minimal app bundle (the system only sandboxes an executable inside a bundle), signs it ad hoc with `Entitlements.plist` and runs it against its own Vite port (1422), so it does not disturb a running `tauri dev`. Its data lives in `~/Library/Containers/<bundle id>/`, apart from the unsandboxed dev app's.

### Local install: `npm run tauri build`

Produces `Clutter.app` (and a `.dmg`) under `src-tauri/target/release/bundle/`. It is:

- **Sandboxed**: the entitlements in `src-tauri/Entitlements.plist` are in `tauri.conf.json`, signed ad hoc by default (`signingIdentity: "-"`). It is the same app as the App Store one: Documents authorization on the first Create, security-scoped bookmarks for picked Spaces, one runtime filesystem grant per authorized folder.
- **Guarded by the build itself**: a release compile fails (`build.rs`) unless the atomic writer is compiled in and `Entitlements.plist` holds every required sandbox entitlement and none of the forbidden ones; the build's first step (`beforeBuildCommand`) runs `npm run check:atomic` for the interface half. Nothing can be packaged with the legacy writer or without the sandbox.
- **Atomic**: the only writer.
- **Not distributable**: an ad-hoc signature is accepted on the Mac that built it. On another Mac, Gatekeeper blocks it (right-click Open, or removing the quarantine flag, works for a technical friend, but that is not an installer to hand out).
- A **separate data store** from the development app: a sandboxed app keeps its data in `~/Library/Containers/<bundle id>/`, so Spaces registered in the unsandboxed development app are not shared with it. Your Space *folders* are untouched; the packaged app asks for access to them the normal way.

No Apple credentials are needed. Set `APPLE_SIGNING_IDENTITY` in the environment and the same command signs with that identity instead.

### Sharing with testers: `npm run build:share`

The same app, sandbox and atomic writer, signed with a **Developer ID Application** certificate, hardened runtime, **notarized** by Apple and stapled, so it opens on other Macs without warnings. Needs:

- A paid Apple Developer Program membership and a *Developer ID Application* certificate in the keychain (`APPLE_SIGNING_IDENTITY`).
- Notarization credentials: `APPLE_ID` + an app-specific `APPLE_PASSWORD` + `APPLE_TEAM_ID`, or an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`).

The script refuses to build without them, runs the checks below, and verifies the result with `verify-bundle.sh --share` (Developer ID signature, hardened runtime, stapled ticket, Gatekeeper acceptance). **Unverified**: this machine has no Developer ID certificate, so this path has never run against Apple's services.

### Mac App Store: `npm run build:appstore`

The same app, packaged for Apple's distribution: an Apple distribution signature, the embedded provisioning profile, the application and team identifiers Apple requires in the entitlements, and a signed installer `.pkg`. Needs:

- `APPLE_SIGNING_IDENTITY`: *3rd Party Mac Developer Application* (or *Apple Distribution*).
- `APPLE_INSTALLER_IDENTITY`: *3rd Party Mac Developer Installer* (or *Mac Installer Distribution*).
- `APPLE_PROVISIONING_PROFILE`: the Mac App Store profile for the app.
- `APP_STORE_BUNDLE_ID`: the registered bundle identifier (the development one, `com.clutter.dev`, is refused).

`APP_STORE_DRY_RUN=1` checks the credentials and prints the configuration it would use without building. **Unverified**: the signing, profile embedding and packaging steps have never run (no credentials on this machine); the entitlement set, the sandbox behavior and the atomic writer are verified in an ad-hoc-signed sandboxed build. Also still to do for a real submission: App Store Connect record, privacy answers, export-compliance declaration, screenshots, and App Review.

## Atomic saves everywhere

- **On by default, no switch.** `atomic-writes` is a default Cargo feature (`src-tauri/Cargo.toml`) and `featureFlags.atomicWrites` is `true` (`src/core/featureFlags.ts`) with no environment variable that turns it off.
- **No silent fallback.** A failed atomic save is reported and the text kept; it never reaches the plugin's truncating write (a test asserts this for every outcome). A build without the native writer cannot open a Space.
- **Both halves are checked before any distributed build.** `npm run check:atomic` (run by `build:share` and `build:appstore`) fails unless the Rust feature is a default and the interface flag is on with no environment switch, and runs the contract tests. `verify-bundle.sh` then fails unless the finished executable contains the atomic and sandbox-access commands.
- **The legacy writer remains, unused.** `LocalVaultProvider.writeFile` (`src/core/vault/providers/LocalFileSystem.ts`, the fs plugin's in-place `writeTextFile`) is kept as the inner provider of the atomic stack (reads, moves, binary writes) and as the stand-in the contract tests compare against. No vault *text* write reaches it (`vaultTextWriteAudit.test.ts`, `writeIntentCoverage.test.ts`). It was replaced because an in-place truncating write can leave a note empty or half written if the app or the machine stops mid-write, and cannot tell whether a file changed underneath it.
- **Removal conditions** are recorded in ADR-063 ("The only saving system"): a signed App Store build shipped to real users with no writer-attributable data loss; the real-app and sandbox suites passed against that signed build, including iCloud and an external volume; and the no-native-writer and no-fallback tests still passing.

## Where atomic saves cannot save (measured)

The writer supports **APFS only**, by design. What the user gets elsewhere was measured in the real app:

| Location | Result |
| --- | --- |
| Internal disk, APFS external drive | Atomic saves work |
| exFAT, FAT32, HFS+ (real disk images mounted as the Space) | The Space opens and can be read. Every save is refused with **"Can’t save safely to this location"**; the note on disk is untouched, no temporary file is left, and nothing falls back to another writer. Space settings fail first with "Couldn’t save the space settings". The user's text stays in the editor and in crash recovery |
| NTFS (read-only on macOS), SMB, NFS | Not tested here. Not APFS, so refused the same way |
| iCloud Drive, Google Drive, Dropbox (File Provider folders) | **Not verified.** These folders live on the APFS data volume, so the filesystem check passes and atomic replacement *is attempted*; whether a File Provider accepts a same-folder replace cleanly, and whether its extended attributes survive the writer's strict metadata check, has not been tested (it would write into your cloud account, so it was not done without asking) |

Consequence for **Open Existing Space**: a folder on a non-APFS external drive can be opened but not edited. This is deliberate (never save with a weaker method without saying so), but it is a product limitation; a clearer message at the moment the folder is chosen would be better than a notice at the first save.

## Checks

- `npm run check:atomic`: both halves of atomic saves are on, with no switch.
- `npm run verify:bundle -- <Clutter.app> [--local|--share|--submission] [--allow-test-harness]`: entitlements, atomic and sandbox commands in the executable, no automation plugin, signature; stricter per mode.
- Real-app suites: `packages/automation/atomic-test` (`run-matrix.sh` builds both native-writer cells; `unsupported-volume.spec.ts` the volume table above) and, locally, the sandbox suite.
