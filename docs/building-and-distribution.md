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
- **Both halves are checked before any packaged build.** `npm run check:atomic` (the first step of `tauri build`, and run by `build:share` and `build:appstore`) fails unless the Rust feature is a default and the interface flag is on with no environment switch, and runs the contract tests. `verify-bundle.sh` then fails unless the finished executable contains the atomic and sandbox-access commands.
- **The legacy writer remains, unused.** `LocalVaultProvider.writeFile` (`src/core/vault/providers/LocalFileSystem.ts`, the fs plugin's in-place `writeTextFile`) is kept as the inner provider of the atomic stack (reads, moves, binary writes) and as the stand-in the contract tests compare against. No vault *text* write reaches it (`vaultTextWriteAudit.test.ts`, `writeIntentCoverage.test.ts`). It was replaced because an in-place truncating write can leave a note empty or half written if the app or the machine stops mid-write, and cannot tell whether a file changed underneath it.
- **Removal conditions** are recorded in ADR-063 ("The only saving system"): a signed App Store build shipped to real users with no writer-attributable data loss; the real-app and sandbox suites passed against that signed build, including iCloud and an external volume; and the no-native-writer and no-fallback tests still passing.

## Where atomic saves cannot save (measured)

The writer supports **APFS only**, by design. What the user gets elsewhere was measured in the real app:

| Location | Result |
| --- | --- |
| Internal disk, APFS external drive | Atomic saves work |
| exFAT, FAT32, HFS+ (real disk images mounted as the Space) | The Space opens and can be read. Every save is refused with **"Can’t save safely to this location"**; the note on disk is untouched, no temporary file is left, and nothing falls back to another writer. Space settings fail first with "Couldn’t save the space settings". What happens to the user's unsaved text in that state (editor, crash recovery) was **not tested** |
| NTFS (read-only on macOS), SMB, NFS | Not tested here. Not APFS, so refused the same way |
| iCloud Drive, Google Drive, Dropbox (File Provider folders) | **Not verified.** These folders live on the APFS data volume, so the filesystem check passes and atomic replacement *is attempted*; whether a File Provider accepts a same-folder replace cleanly, and whether its extended attributes survive the writer's strict metadata check, has not been tested (it would write into your cloud account, so it was not done without asking) |

Consequence for **Open Existing Space**: a folder on a non-APFS external drive can be opened but not edited. This is deliberate (never save with a weaker method without saying so), but it is a product limitation; a clearer message at the moment the folder is chosen would be better than a notice at the first save.

## Checks

- `npm run check:atomic`: both halves of atomic saves are on, with no switch.
- `npm run verify:bundle -- <Clutter.app> [--local|--share|--submission] [--allow-test-harness]`: entitlements, atomic and sandbox commands in the executable, no automation plugin, signature; stricter per mode.
- Unit and type checks: `cd apps/app && npx vitest run` and `npx tsc --noEmit -p .`; `cd apps/app/src-tauri && cargo test`.
- Real-app suites, **not sandboxed**: `packages/automation/atomic-test` (`run.sh` for the specs, `run-matrix.sh` for the two native-writer cells; `unsupported-volume.spec.ts` for the volume table above). Isolated: own executable name, own identifier, throw-away HOME, and it refuses to run against a profile that knows any real Space (see its README).
- Real-app suite, **sandboxed**: `packages/automation/sandbox-test` (see "Re-running the sandbox suite" below). It is local tooling, not part of the repository.

## Release checklist and verification baseline

This is the one checklist for the sandbox and atomic-saves work; ADR-063 points here instead of keeping its own. Nothing is marked verified without evidence, and "not tested" means exactly that.

**Status words.** *Done* = implemented and tested (evidence named). *Implemented* = built but only partly tested. *Not tested*. *Not built*. *Open decision*. **Blocking** = must be resolved (or consciously accepted) before shipping to users.

### Baseline (2026-10-29, HEAD `927c0e64`)

| What | Command | Result | Notes |
| --- | --- | --- | --- |
| Type check | `cd apps/app && npx tsc --noEmit -p .` | Clean | |
| TypeScript tests | `cd apps/app && npx vitest run` | **13 failed**, 16,257 passed (16,270; 9 of 874 files fail) | The 13 known failures below (the list has since gained a fourteenth, noted there), on a run with nothing else competing. An earlier run during two heavy builds showed two extra timing failures (`editorExitUp`, `FolderTree.drag`) and 28 files missing; a clean rerun showed neither |
| Rust tests | `cd apps/app/src-tauri && cargo test` | 157 passed (3 ignored) + 4 permission tests, 0 failed | The atomic writer is a default feature, so these include its tests |
| Debug build without the native writer | `cargo build --no-default-features` | Builds | Allowed on purpose (the app then refuses to open a Space). A **release** build without it fails in `build.rs`; so does a release build with an incomplete `Entitlements.plist` (both tried) |
| Packaged build | `npm run tauri build` (scratch target dir) | Produced `Clutter.app` and `Clutter_0.1.0_aarch64.dmg`, ad-hoc signed; `verify:bundle --local` passed; the app launched and created its sandbox container | **Run before** `build.rs` guards and the `check:atomic` build step were added. Those guards ran in the later release builds of the sandbox test bundle (same `tauri build`, `--bundles app`). `npm run tauri build` itself, with its DMG step and the new first step, was **not re-run on HEAD** |
| Sandboxed development | `npm run dev:sandbox` | Built, signed, started sandboxed with a fresh container, showed the start screen; stopped | Not driven further (no automation in that build) |
| Unsandboxed development | `npm run tauri dev` | **Not run** (it would collide with a developer's own dev server) | Evidence that it saves atomically: the debug build of the default features, run as the build-matrix cell, replaced the file whole (new inode, birth time kept) |
| Build matrix (real builds) | `packages/automation/atomic-test/run-matrix.sh <dir>` | 2 of 2 cells pass: native writer present saves atomically; absent refuses to open the Space with "native writer is not available" | At `e9e9e55d` |
| Unsupported volumes (real app) | `atomic-test/run.sh <dir> specs/unsupported-volume.spec.ts` | 3 of 3 pass (exFAT, FAT32, HFS+) | At `e9e9e55d` |
| Sandbox suite (real sandboxed app) | see below | **9 spec files, 22 checks, all pass**, ordered, from a verified-clean start | On a harness build of the `f70a4ceb` tree. (An earlier report of "15 spec files" was a miscount; 9 files and 22 checks is the real figure) |
| Packaging preflights | `npm run build:share`, `npm run build:appstore` with no credentials | Both stop with exit 1 and a list of what is missing | Nothing past the preflight has run |
| Bundle verifier | `verify:bundle` on the ad-hoc bundles | `--local` passes; `--share` and `--submission` correctly fail | |

What the 22 sandbox checks cover: sandbox and real-path reporting; nothing created before authorization or on cancel; Create at `~/Documents/<name>` after one grant; four atomic saves of one note; an external atomic replace shown in the open editor; rename and delete; image and PDF import through the system file picker; relaunch with Documents restored without a prompt; a picked folder (`/Users/Shared`) and one outside `/Users` and `/Volumes` (`/private/tmp`) bookmarked, reopened after relaunch and saved to; `~/Desktop` refused by Tauri's scope; a corrupted bookmark presented as needing selection with access denied by the OS; re-selecting restoring access.

What was **not** re-run since the sandbox work changed the code: the non-sandboxed real-app suite (last full pass at commit `ceedad75`), and in the sandbox the earlier crash-recovery, editor-versus-disk-conflict and watcher specs (they passed once on an early sandbox build, before the quarantine fix; `restart-2` failed on that build because of it and was covered afterwards by the relaunch checks above).

### Checklist

| # | Item | Status | Blocking | Evidence / what is missing |
| --- | --- | --- | --- | --- |
| 1 | Developer ID signing and notarization (`build:share`) | Implemented (script, preflight, verifier); **not tested** | Only for sharing with others | No Developer ID certificate or notarization credentials on this machine. Never run against Apple |
| 2 | Mac App Store signing, provisioning profile, installer `.pkg`, upload (`build:appstore`) | Implemented; **not tested** beyond the preflight | **Yes** (for the App Store) | Needs the distribution and installer certificates, the provisioning profile and a registered bundle id. `APP_STORE_DRY_RUN` also needs a real profile |
| 3 | App Store Connect record, privacy answers, export-compliance declaration, screenshots, App Review | Not started | **Yes** | Outside the code |
| 4 | Final bundle identifier (now `com.clutter.dev`) | **Open decision** | **Yes** | `build:appstore` refuses the development id. The identifier also names the sandbox container and the app's data, so changing it later moves users' data; decide before the first public release |
| 5 | A properly signed sandboxed build | **Not tested** | **Yes** | Everything sandboxed was verified ad hoc. Whether bookmarks survive a re-signed update, and whether a hardened-runtime build behaves the same, is unknown |
| 6 | Stale grants and bookmarks after a Space rename or removal | Not built | **Yes, suspected** | From the code: a bookmark is saved only when a folder is picked; renaming a picked Space moves only the runtime scope grant, and `SpaceAccess::forget` is never called. So a renamed Space picked outside Documents would probably not reopen after a restart without picking it again. Spaces inside Documents are covered by the Documents bookmark. Not reproduced in the real app |
| 7 | iCloud Drive, Google Drive, Dropbox and other File Provider folders | **Not tested** | **Yes, to decide** | They sit on the APFS data volume, so the filesystem check passes and atomic replacement is attempted; whether the provider accepts it and whether its extended attributes pass the writer's metadata check is unknown. Testing writes into a real cloud account, so it needs consent. No iCloud Drive folder exists on the development Mac |
| 8 | External drives | APFS external: **not tested**. exFAT/FAT32/HFS+ images: Done | No | Behavior verified: the Space opens, every save is refused with "Can’t save safely to this location", the file is untouched, no temp file, no fallback. NTFS, SMB, NFS not tested (not APFS, so refused the same way by design) |
| 9 | Non-APFS location: message at the moment of choosing | Not built | **Open decision** | Today the user learns at the first save. Choosing between refusing the folder and opening it read-only is a product call. Unsaved text in that state (editor, recovery) not tested |
| 10 | Leftover `.clutter-tmp.*` files | Policy written (ADR-063), **not built** | Open decision | A crash can leave one holding a newer complete note; nothing deletes it and the scan ignores it, so it accumulates hidden. The conservative cleanup (flock, show, restore-as-note or delete, never silent) is designed but not built |
| 11 | Previously registered symlinked Spaces | Pick-time refusal implemented; Done at pick time (`linked-space` spec, unit tests) | No | An already-registered Space reached through a link still opens, and the watcher never sees outside changes in it. Not tested |
| 12 | Real Welcome / Create / Open Space UI acceptance | **Not tested** | **Yes** | The commands, the frontend wiring (unit tests) and the picker (driven through the dialog plugin command) are tested; the screens themselves were not driven through the UI in the sandbox |
| 13 | Archive and move through the UI in the sandbox | **Not tested** | Yes | Rename and delete were exercised through fs-plugin calls, not the UI |
| 14 | Sandbox crash recovery, editor-versus-disk conflict, watcher on the final code | **Not re-run** | Yes | Passed once on an early sandbox build; see above |
| 15 | Non-sandboxed real-app suite on HEAD | **Not re-run** since `ceedad75` | Yes | Only the matrix and the volume spec have run since |
| 16 | The 14 known TypeScript test failures | Known, unchanged | Resolve before submission | Listed below (13 at the 2026-10-29 baseline above; the fourteenth, in the editor separator test, was found on 2026-10-30). None comes from this work; `parserGolden` (a real cache risk) was fixed by bumping `PARSER_VERSION` to 5 |
| 17 | Intel Macs | **Not tested** | Only if Intel is a target | The `fstatfs$INODE64` path is unexercised, and the local build is aarch64 only |
| 18 | Power-loss durability | Not tested | Accepted limitation | The writer requests `F_FULLFSYNC`; it is not proven on every device (ADR-063) |
| 19 | Generated `src-tauri/permissions/` is untracked | Housekeeping | No | Every build regenerates it (it was deleted once and came back with the newer commands), so it probably belongs in `.gitignore`; not decided |
| 20 | Legacy writer removal | Waiting | After release | Criteria in ADR-063 and above |
| 21 | Unsplash proxy Worker (ADR-065): deployed, configured, live search | Worker deployed; live search and photo details answered `200` (2026-10-30). The hardened configuration (preview URLs off, packaged-app origins only) is in `wrangler.toml` but **not yet deployed** | Yes, until redeployed and re-checked | Worker: 99 tests, typecheck and `wrangler deploy --dry-run` pass. Missing: redeploy, then the live checks in `workers/unsplash-proxy/README.md` ("Before a public release", step 3). The download route has only unit tests (calling it records a real download) |
| 22 | Unsplash Production approval and API quota | **Not confirmed** | **Yes** | Not recorded anywhere in this repository. A Demo application has a low hourly limit shared by every user through the one Worker. Confirm the tier and the limit in the Unsplash developer dashboard, and apply for Production approval if needed, before a public release |
| 23 | Old Unsplash Access Key rotated; no key in builds | **Not confirmed** | **Yes** | A fresh production build and the source contain no key (checked 2026-10-30), but builds made before the proxy (including the existing `Clutter.app` and `.dmg`) may embed the old one, and the packaged bundle could not be searched reliably (its assets are compressed). Regenerate the key in the Unsplash dashboard, set the new value with `wrangler secret put UNSPLASH_ACCESS_KEY`, and rebuild |

### The 14 known TypeScript failures

All 14 also fail on a clean export of the commit they were first triaged against, so none comes from the atomic or sandbox work, and none from the uncommitted UI work. They are a test-versus-UI disagreement that needs a product decision on which side is stale:

- **"Clear" button, 4**: `DatePicker` (2) and `DatePropertyValue` (2) expect a Clear button the components do not render.
- **Tasks, 6**: `GroupTasksByDueDateSetting` (2: expects the toggle off by default), `TaskItemsSetting` (1), `renderTasksByDate` (1: `data-section` on a non-Today header), `TasksShortcuts` (2: no `textbox` found).
- **Asset grid minimum, 2**: `AssetsCollectionBody` and `toAssetCardProps` expect 140px, the code uses 180px.
- **New space picker, 1**: `AppShell.spaces` expects Escape and a backdrop click not to dismiss it.
- **Horizontal-rule separator height, 1**: `blockSeparatorDecoration` ("is 12px") expects 12, the code gives 24. Found on 2026-10-30 and confirmed to fail identically on a clean checkout of HEAD, so it is not from the Unsplash or cover-image work either.

### Working tree

Committed (newest first): `927c0e64` build documentation; `f70a4ceb` sandbox and atomic saves in every packaged build; `93109027` packaging verification; `e9e9e55d` atomic saves the only saving system; `f6a34a03` one capability per authorized folder; `bb401737` App Store configuration (later folded into the base config); `690de46b` Create and picked Spaces in the sandbox (frontend); `55a96b45` bookmarks (native); `facef9dc` quarantine-attribute fix in the writer; `3bb897c5` non-main-window permission test; `4a7dabc2` `PARSER_VERSION` 5.

Uncommitted and **not part of this work** (left untouched): Toast, TemplateSuggestions and the recovery changes (`apps/app/src/components/toast/*`, `template-suggestions/*`, `core/recovery/*`, `core/application/recovery/*`, `app/UnsavedCloseDialog.test.tsx`, `unsavedCloseCopy.ts`, `RecoveryDialog.test.tsx`, `Application.recovery.test.ts`, `docs/adr/062-crash-recovery-snapshots.md`), and the untracked `apps/app/recovery-ui.html` and `app/devLab/recoveryUiGallery.tsx`. Unsplash has no uncommitted changes here. Nothing is staged.

Untracked and **deliberately kept**: `packages/automation/sandbox-test/`, the sandbox test harness.

### Re-running the sandbox suite

The harness drives a real sandboxed build through WebDriver, confirms the system file panel with key presses, and checks files from outside the sandbox with Node. It is local tooling: its specs name `/Users/sivakuv3`, and the helper scripts in `sandbox-test/tools/` were written against a scratch directory and must be adapted (see `sandbox-test/README.md`). In outline: build a test bundle of the current tree with the automation feature and a separate identifier (`tauri build --config <test override> --features automation --bundles app`), wipe only that test identity's container, run `specs-accept/*.spec.ts` one file per launch in the order a1, a2, a3, a4, b1, b2, b3, c1, c2, and clean up the disposable folders. The key presses are guarded: they are sent only while the test app's file panel is up and the test app is frontmost, identified by bundle identifier, never by the executable name `app`, which the development build shares.
