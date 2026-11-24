# Mac App Store release checklist

Baseline audit of 2026-11-06 against branch `feature/emoji-lists-and-list-settings`. Tick a box (`- [x]`) when the task is done and verified, and add the date and commit hash after it.

Privacy findings and the must-fix list: [privacy-audit-2026-11-06.md](./privacy-audit-2026-11-06.md). Privacy status, App Store Connect answers and external actions: [privacy-release.md](./privacy-release.md).

Companion docs: [building-and-distribution.md](./building-and-distribution.md) (commands, sandbox run results), [privacy-and-app-store.md](./privacy-and-app-store.md) (privacy manifest, encryption and disk-space decisions).

**Verdict at baseline: not ready to submit.** The sandbox, bookmarks, atomic saves and privacy manifest are real code. What is missing is Apple-side setup, three owner decisions, metadata, and a sandboxed test of the exact build that will ship.

Effort key: **S** under 1 hour, **M** a few hours, **L** a day or more, **Ext** depends on Apple or another outside party.

## 0. Decisions (no dependencies, do first)

- [ ] **Final app name.** Preliminary availability check completed by Vigram (2026-11-07, reported, not observed by Claude; result not recorded). Apple only reserves a name when the app record is created (3.3), so this stays open until then. Check "Clutter" is available in App Store Connect. Blocks 3.2 and 3.3. Effort: S
- [x] **Final bundle identifier.** `com.vigram.clutter`, set in [tauri.conf.json](../apps/app/src-tauri/tauri.conf.json) (2026-11-06). Release builds and the App Store script refuse any other; not yet registered with Apple (3.2). Effort: S
- [x] **Minimum macOS version.** Decided 13.3 (2026-11-06). Was: Currently the Tauri default `10.13`. Pick a real floor (for example 12 or 13) and test on it. Effort: S
- [x] **Architectures.** Decided Apple silicon (arm64) only for 1.0 (2026-11-06). Was: Apple-silicon only (only `aarch64-apple-darwin` is installed), or universal (needs `x86_64-apple-darwin`; the Intel path in the atomic writer was never exercised, per ADR-063). Effort: S to decide
- [ ] **Encryption answer.** The app bundles `rustls` and `ring` through `tauri-plugin-http`, so "only OS encryption" is not clearly true. Options are in [privacy-and-app-store.md](./privacy-and-app-store.md). Decide before setting `ITSAppUsesNonExemptEncryption`. Needs a legal or compliance view
- [x] **`fstatfs` and the disk-space category.** Resolved 2026-11-06 by removing the call (ADR-069); Apple's validator has not confirmed it yet. Was: `atomic_replace.rs` calls `fstatfs` to read the filesystem type; the manifest does not declare DiskSpace and no Apple reason fits. Options are in the same doc. Likeliest first-upload rejection
- [x] **App Privacy label.** Decided 2026-11-06: Search History and Product Interaction, not linked, no tracking, App Functionality (docs/privacy-release.md). Was: Recommended: Search History, not linked, no tracking, App Functionality (see the privacy audit). Declare nothing collected, or declare Search History for the Unsplash cover search terms. Must match the manifest and the privacy policy
- [ ] **Permanent delete.** Keep as is (archived items only, behind a confirmation) or add a system Archive option. Not an Apple requirement

- [x] **Copyright holder and licence.** Decided: © 2026 Vigram Sivakumar, proprietary, no open-source licence (2026-11-06). Was: Who is named in the copyright line (a person or a company), and whether Clutter has a licence. Not derivable from the repository; the git author and the account email differ in kind (personal project, work email), so nothing was filled in. Set `bundle.copyright` once decided

## 1. Very easy: copy and simple configuration

- [x] **1.1 HTML title.** Now "Clutter" (2026-11-06). [index.html:6](../apps/app/index.html#L6) says "Editor V2 – Test". Code change. Effort: S
- [x] **1.2 Dev page in the bundle.** Deleted (2026-11-06). Remove `apps/app/public/dev-shell-experiment.html`; it is copied into `dist`. Code change. Effort: S
- [x] **1.3 Cargo metadata.** Done 2026-11-06: description and author set; no `license` on purpose (decision below). Was: `authors = ["you"]`, `description = "A Tauri App"`, empty `license` in [Cargo.toml](../apps/app/src-tauri/Cargo.toml). Also keep `Cargo.lock` in step (`check:version` enforces the version). Effort: S
- [x] **1.4 Copyright.** Set in tauri.conf.json (2026-11-06); the About panel reads it. Was: About panel now reads `bundle.copyright`; the value itself waits on the copyright-holder decision (not invented). Was: Add `bundle.copyright` to [tauri.conf.json](../apps/app/src-tauri/tauri.conf.json). Set copyright and credits on the About item in [app_menu.rs](../apps/app/src-tauri/src/app_menu.rs). Effort: S
- [x] **1.5 Minimum system version.** `minimumSystemVersion` 13.3 (2026-11-06). Was: Set `bundle.macOS.minimumSystemVersion` from decision 0. Effort: S
- [x] **1.6 Build number.** `bundleVersion` `"1"` in tauri.conf.json; raise per upload with `APP_STORE_BUILD_NUMBER` (2026-11-06). Was: `CFBundleVersion` is `1.0.0`, the same as the short version. It must increase on every upload; decide how it is set. Effort: S
- [x] **1.7 Stale comments.** Fixed 2026-11-06 (Entitlements.plist, lib.rs, writeFileAtomic.ts). Was: [Entitlements.plist](../apps/app/src-tauri/Entitlements.plist) mentions "link previews" (none exist). [lib.rs:7-9](../apps/app/src-tauri/src/lib.rs#L7-L9) says the atomic writer is off by default (it is on). The doc comment in `writeFileAtomic.ts` is wrong and its fallback branch is dead. Effort: S
- [x] **1.8 Check `.DS_Store` in welcome content.** Verified 2026-11-07: the one in `src/welcome-content` is git-ignored, and the bundle only globs `*.md` and images (`welcomeContentManifest.ts`); `dist/` contains no `.DS_Store`. Was: `src/welcome-content` contains one; confirm it never lands in a user's Space. Effort: S

## 2. Easy: documents and assets

- [ ] **2.1 Privacy policy, written and hosted, with an in-app link (Guideline 5.1.1(i)).** Written (docs/privacy-policy.md) and the in-app entry is built; still to do: a contact email, hosting, and setting the address in `core/legalLinks.ts`. Was: Cover: notes stay on the device; cover searches go through the proxy to Unsplash; remote images in notes and covers load directly from their host (reveals the IP address); the welcome notes contact `images.unsplash.com` on first launch; no accounts, analytics or crash reporting. Effort: M. Ext (hosting)
- [ ] **2.2 Support URL, hosted.** Page written (docs/support.md); hosting and the address in `core/legalLinks.ts` remain. Was: Mandatory. A marketing URL is optional. Effort: S. Ext
- [ ] **2.3 Screenshots.** Mandatory. 16:10 at 1280×800, 1440×900, 2560×1600 or 2880×1800; up to 10 per size, JPEG or PNG. Take them from the final build. Effort: M
- [ ] **2.4 App preview video.** Optional. 1920×1080, 15–30 seconds, up to 3. Effort: M
- [ ] **2.5 Store metadata.** Name, subtitle, description, keywords, primary category (currently Productivity in config), optional secondary category, "What's New". None of this can be derived from the repo. Effort: M
- [ ] **2.6 Age rating questionnaire.** Answer in App Store Connect. Effort: S
- [ ] **2.7 Third-party notices.** Add a notices file or in-app acknowledgements: Inter, EB Garamond and Hanken Grotesk (SIL OFL, `OFL.txt` per folder in `src/assets/fonts/`), pdfjs-dist (Apache-2.0), `ring`, and other Rust and npm licenses that need attribution. Run `cargo license` or `cargo deny` and a bundle-level npm license check first. Effort: M
- [ ] **2.8 Icon artwork check.** `icon.icns` contains the 1024px size; look at it for quality. Effort: S

## 3. Medium: App Store configuration and build preparation

- [ ] **3.1 Apple Developer Program membership.** Needed for everything below. Nothing in the repo shows one, and this Mac has 0 signing identities. Effort: Ext (hours to days)
- [ ] **3.2 Register the App ID** for the final bundle identifier. Depends on 0, 3.1. Effort: S
- [ ] **3.3 Create the App Store Connect app record.** Depends on 3.2. Effort: S
- [ ] **3.4 Certificates.** Apple Distribution (or 3rd Party Mac Developer Application) and Mac Installer Distribution, installed in the keychain. Depends on 3.1. Effort: S
- [ ] **3.5 Mac App Store provisioning profile** for the bundle identifier. Depends on 3.2, 3.4. Effort: S
- [ ] **3.6 Set the encryption key** `ITSAppUsesNonExemptEncryption` per the decision. Config or code change; if the decision is native TLS, `tauri-plugin-http` changes and needs a test. Depends on 0. Effort: S to L
- [ ] **3.7 Resolve `fstatfs`** per the decision. If the probe changes, it touches the atomic writer's safety check, so follow `docs/implementation-rules.md`. Depends on 0. Effort: S to L
- [ ] **3.8 Architecture setup.** If universal: install `x86_64-apple-darwin` and build with `--target universal-apple-darwin`. Depends on 0. Effort: M
- [ ] **3.9 Narrow permissions (recommended, not an Apple requirement).**
  - `http:default` allows `https://*` and `http://*` ([capabilities/default.json](../apps/app/src-tauri/capabilities/default.json)).
  - `openExternalUrl` passes any scheme to the opener.
  - `lib.rs` has no navigation guard.

  Effort: M
- [ ] **3.10 Unsplash proxy hosting.** The current URL is `https://unsplash-proxy.clutterapp.workers.dev`, baked into the app and CSP (renamed 2026-11-24; live verification pending). Older builds reference previous hostnames. Verified on the previous host 2026-11-07: health, search, feed, lookup, CORS for the Tauri origin, and the download route (404 on a nonexistent id, so no real download was registered; the success reply was not exercised). Repository references moved (uncommitted at the time of writing). Still open: move to a stable domain, or accept and document the dependency. Confirm the deployed Worker matches `workers/unsplash-proxy` and that no account-level logging records requests. Effort: M. Ext
- [ ] **3.11 First-launch network behavior.** The welcome notes carry Unsplash cover URLs. Disclose in the policy, or bundle the images. Effort: S to M
- [ ] **3.12 Dry run.** `APP_STORE_DRY_RUN=1 npm run build:appstore` with the four environment variables. Depends on 3.4, 3.5. Effort: S

## 4. Hard: sandbox, bookmarks and filesystem

- [ ] **4.1 Bundle identifier migration.** Analysed 2026-11-06 (see the end of building-and-distribution.md); no automatic migration, decision pending. Was: A different identifier is a different container, so the Space list, bookmarks, persisted scope and unsaved-text recovery records are orphaned. User folders are untouched. Add a "reselect your Spaces" path, or record that no one has data yet. Effort: M
- [ ] **4.2 Signing change and bookmarks.** A bookmark made under an ad-hoc signature may not resolve under the App Store signature. Test it; it affects only people who used test builds. Effort: M
- [ ] **4.3 Sandboxed test pass on the final signed build.** See section 6. Depends on 3.12, 5.1. Effort: L
- [ ] **4.4 Revocation message.** A revoked or moved folder shows a generic "missing, unreadable, or outside the allowed location" message. Consider specific wording, and test denying access ([space_access.rs](../apps/app/src-tauri/src/space_access.rs), `useSpaceRegistry.ts:159`). Effort: M
- [ ] **4.5 Bookmark path equality** ([space_access.rs:201](../apps/app/src-tauri/src/space_access.rs#L201)). A symlink or case difference between stored and resolved path becomes `NeedsReselect`. Mitigated because linked Spaces are refused at add time; verify with `/var` vs `/private/var` style paths. Effort: S to M
- [ ] **4.6 Per-Space scope for no-clobber commands.** `move_file_no_clobber`, `delete_path` and the copy and write commands are scoped to the union of all authorized Spaces, not one Space. Optional hardening. Effort: M
- [ ] **4.7 Directory move race.** [move_no_clobber.rs:59-64](../apps/app/src-tauri/src/move_no_clobber.rs#L59-L64) is check-then-rename and can replace an empty directory. Optional. Effort: S
- [ ] **4.8 Folder duplication of binary files.** ADR-063 says `VaultEntryDuplicator` may corrupt binaries through a UTF-8 round trip. Verify or fix. Effort: M
- [ ] **4.9 Cloud-synced and external volumes.** Spaces in iCloud Drive, Dropbox, OneDrive, `/Volumes` and non-APFS drives are unvalidated in the sandbox. Test, or state the limit in review notes. Effort: M

## 5. Final: signing, validation and submission

- [ ] **5.1 Signed build.** `npm run build:appstore` with `APPLE_SIGNING_IDENTITY`, `APPLE_INSTALLER_IDENTITY`, `APPLE_PROVISIONING_PROFILE` and `APP_STORE_BUNDLE_ID`. First time these steps ever run. Depends on 3.x. Effort: M
- [ ] **5.2 `verify-bundle.sh --submission`** passes (the script runs it itself). Effort: S
- [ ] **5.3 Upload** the `.pkg` with Transporter. Read Apple's validation output; the privacy manifest has never been through Apple's validator. Effort: S. Ext
- [ ] **5.4 Fix validator findings** and re-upload. Effort: unknown
- [ ] **5.5 App Privacy questionnaire and export compliance** in App Store Connect, matching decisions 0. Effort: S
- [ ] **5.6 Review notes.** Explain how to create or open a Space (the app asks for folder access) and that the Unsplash search needs network. Effort: S
- [ ] **5.7 Submit for review.** Effort: S. Ext

## 6. Sandboxed test pass (run on the final signed build)

Only tick an item when it was observed in a sandboxed, signed build, not a dev run.

- [ ] Fresh install: first launch, welcome content installed once, no errors
- [ ] Create Space in `~/Documents`: Documents authorization asked once, cancel creates nothing
- [ ] Open Existing Space outside Documents; quit and relaunch; the Space reopens (bookmark restore)
- [ ] Multiple Spaces: add, switch, remove (bookmark forgotten), rename inside Documents
- [ ] Rename of a picked folder outside Documents shows the Finder message
- [ ] Note create, edit, rename, move, archive, restore, permanent delete
- [ ] Folder create, move, delete (including a folder with untracked files)
- [ ] Delete Permanently moves a note, a folder and a resource to the Trash (ADR-072), in a Space in Documents and in one outside it (bookmark restored): the item is in Finder's Trash, **Put Back** is offered, a repeated name is kept, a refused move (read-only parent) leaves the item in Clutter with an error, and nothing is ever hard-deleted. Also an external or non-APFS volume, and a restore-conflict "Replace"
- [ ] Image and PDF import (file, paste, remote URL); images and PDFs display after relaunch from a bookmarked Space outside Documents
- [ ] External edit while open: conflict handling; external delete
- [ ] Crash recovery: force-quit with unsaved text, relaunch, text recovered
- [ ] Close and Space switch with unsaved changes
- [ ] Permission revocation: remove the folder's access or move the folder, relaunch, message and fallback
- [ ] Stale bookmark: move the folder and move it back
- [ ] Unsplash cover search, pick, credit; behavior offline
- [ ] External links open in the browser; other schemes behave sensibly
- [ ] Update path: install over a previous build, Spaces and settings survive
- [ ] Non-APFS or removable volume refused with a clear message
- [ ] Minimum macOS version from decision 0

## 7. Automated checks (run before every upload)

None of these were run in the baseline audit. Run on 2026-11-07 against uncommitted changes, so no commit hash yet; re-run on the final build.

- [x] `npm run check:version` and `npm run check:atomic` (also run by `beforeBuildCommand`). Both pass (2026-11-07)
- [x] `tsc` (via `npm run build` in `apps/app`). `npm run build` passes (2026-11-07)
- [x] Full Vitest suite: `npm run test:run` in `apps/app` (about 950 test files). 949 files, 17,917 tests pass (2026-11-07)
- [ ] Rust tests: `cargo test` in `apps/app/src-tauri` (about 252 tests; the docs claim 189 passing at their last run). 245 passed, 3 ignored, 0 failed in the main suite, plus 7 in another test target (2026-11-07)
- [ ] `npm run verify:bundle -- <path.app> --submission`
- [ ] `plutil -lint` on `PrivacyInfo.xcprivacy` and the copy in the bundle. The source file passes `plutil -lint` and `npm run check:privacy` (2026-11-07); the copy in a built bundle is not checked until there is a signed build

## 8. Facts to keep in mind

- Mac screenshots, age rating, privacy policy URL and support URL are mandatory; marketing URL, preview video and secondary category are optional.
- Apple requires an approved reason for each required-reason API in the privacy manifest, matched to the right category; a mismatch is rejected at upload.
- Only `Developer ID` signing and notarization apply to `build:share`; Mac App Store builds use distribution certificates, an embedded profile and a signed installer package. The two paths are separate.
- The previous sandbox evidence in `building-and-distribution.md` is for `com.clutter.dev` with an ad-hoc signature at an older commit. It does not carry over to the final build.

## Reference links

- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications)
- [Age ratings](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Privacy updates for App Store submissions](https://developer.apple.com/news/?id=3d8a9yyh)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Submitting to the App Store](https://developer.apple.com/app-store/submitting/)
