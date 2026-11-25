# Application updates and direct distribution — ODR

**Date:** 2026-11-24  
**Branch:** `release/apple-silicon-beta`  
**Last runtime-verified release:** 0.0.7 (Apple Silicon, ad-hoc, remote Sparkle update).  
**Current implementation:** Universal direct and App Store release paths, signed deltas and unified release commands. **Pending macOS validation.**

This living document supersedes the earlier Apple Silicon-only beta architecture, not its historical test results. "Direct" describes the distribution method; beta and stable describe release maturity. Scope: the complete update, build, signing, packaging, publication, installation and cross-cutting durability/security architecture. This is not a claim that every editor, vault or application feature has been re-audited or regression-tested.

## 1. Decision and invariants

One local-first application, one Markdown vault and persistence architecture, two universal distribution variants. Universal means arm64 and x86_64 on hardware supported by macOS 13.3 or later; it does not imply support for every historical Mac.

| Concern | Direct distribution | Mac App Store distribution |
| --- | --- | --- |
| Source | Same React, TypeScript, Tauri and Rust source | Same |
| Native executable | Universal | Universal |
| Sandbox, bookmarks, atomic writer | Required | Required |
| Update engine | Sparkle 2.10.1 | Apple |
| Distribution artifact | DMG for new installs; signed ZIP and optional delta for updates | Signed PKG |
| Hosting | Cloudflare Worker + private R2 | App Store Connect |
| Signing | Ed25519 archive signatures; ad-hoc for controlled tests, Developer ID + notarization for public direct releases | Apple distribution signing, provisioning profile and installer signature |

The installed application does not use remotely hosted frontend code. It does not need the update service to open or edit a Space. Do not change the bundle identifier `com.vigram.clutter`, the vault format, the atomic writer, the existing safe-close UX, or the base entitlements as part of distribution work. Sparkle alone owns direct application replacement and relaunch. Never loosen sandbox rules to make updates work.

## 2. Why Sparkle

**INVESTIGATED + REJECTED:** Tauri updater 2.10.1 found and downloaded updates but failed to replace the sandboxed app. Observed "Failed to move the new app into place"; native log denied `authorization-right-obtain system.privilege.admin`. Disabling sandboxing, granting unrestricted disk access, and custom privileged replacement were rejected.

**IMPLEMENTED + VERIFIED at 0.0.7:** Sparkle installer services can update the real sandboxed Clutter app from an ad-hoc Apple Silicon release. A separate Mac was successfully updated from 0.0.6 to 0.0.7 over Cloudflare.

The current branch removes the old Tauri updater and process-plugin frontend/native code, feature flags and direct dependencies. Regenerate npm and Cargo lockfiles from the package manifests on the release Mac. Keep the legacy Worker endpoints and objects until existing old installers have been retired; they are not used by the new app.

## 3. Native integration

```text
AppShell / Sidebar
    | Tauri IPC (restricted actions)
sparkle_update.rs
    | C ABI, structured JSON
sparkle_bridge.m (AppKit main thread)
    | SPUUpdater + user driver/delegate
Sparkle installer services
```

The Objective-C adapter is compiled with clang for the Rust target's architecture: aarch64 -> arm64, x86_64 -> x86_64. Tauri's universal build combines both executable slices. The pinned Sparkle framework and each bundled Mach-O helper must be universal too. The App Store and ordinary dev builds do not compile the native Sparkle bridge or load its framework. The registered IPC stub returns unavailable in non-Sparkle builds.

IPC actions: `start`, `status`, `check`, `restart`, `cancel_restart`, `commit_restart`. The interface cannot supply arbitrary URLs, keys, selectors or paths. State snapshots expose phase, version, error and Boolean success. The earlier empty-error bug arose because a boxed Objective-C comparison could encode an integer, rejected by Rust's Boolean decoder. Explicit Boolean encoding and regression tests remain in place.

The frontend polls native state at 750 ms; polling is local, not network traffic. Sparkle schedules checks with a configured 24-hour interval and the bridge initiates a startup check. The actual scheduled 24-hour behaviour has not been independently tested.

## 4. User experience and durability

- Manual Check for Updates uses native macOS alerts. When an update exists: Download and Install or Later. Later is implemented to return to background downloading; it needs a dedicated test.
- Automatic checks/downloads are silent. The sidebar notification is shown on ready/downloaded native state. The downloaded state can still require preparation/authorization; this distinction is important in failure testing.
- Notification uses the existing Alert, collapsed by default, expanding on hover or keyboard focus. Title: New update available. Description: Version {version}. Primary full-width medium button: Restart now. No dismiss button. Entrance slides up by `var(--space-8)` and fades in using the toaster's duration/easing tokens; reduced motion disables entrance animation.
- Explicit restart waits for bootstrap, checks unsaved work, snapshots recovery if needed, obtains consent for unsaved changes, closes application services and commits installation. Sparkle performs replacement and relaunch.
- Sparkle may install a prepared update when the app quits normally. This must be verified through the normal close handler. Ordinary quit and update restart currently use distinct orchestration paths. Do not introduce a second saving mechanism or bypass the normal durability boundary.

See [architecture specification](architecture-specification.md), [durability model](durability-model.md) and [ADR-063](adr/063-atomic-vault-saves.md). The update architecture does not change their contracts. Prior 0.0.7 success is not evidence for all save-failure and cancellation edge cases.

## 5. Universal builds

**IMPLEMENTED; NOT YET BUILT ON MACOS IN THIS CHANGE.**

Both release variants call Tauri with `--target universal-apple-darwin`. The scripts install the aarch64-apple-darwin and x86_64-apple-darwin Rust targets if needed. Native build caches and packaged outputs are isolated between direct and App Store builds.

The verifier checks the complete bundle, including Mach-O files and nested Sparkle helpers, rather than only checking the host executable. It requires both arm64 and x86_64. It also checks the valid code signature, base sandbox capabilities, atomic writer symbols, absence of automation, icons, privacy manifest and required-reason API imports from both slices. An App Store bundle must not contain Sparkle or Sparkle feed/key settings.

A universal binary is larger than its arm64-only predecessor; compression and deltas reduce transfer overhead. Running a universal binary on Apple Silicon is not proof that the Intel slice works. Test a real Intel Mac with supported macOS before claiming Intel compatibility.

## 6. Signed delta updates

**IMPLEMENTED; NATIVE GENERATION/APPLICATION NOT YET VERIFIED.**

The release builder always produces a complete signed ZIP. It additionally produces at most one binary delta, from the immediately preceding published universal release to the new release. It intentionally does not generate a delta across the initial ARM-only-to-universal migration or an ad-hoc-to-Developer-ID signing transition.

Algorithm:

1. Fetch the current HTTPS appcast and check its signing-key continuity.
2. Select its latest released build. Require a newer target build.
3. If the old archive is not a universal archive, skip the delta and retain the full archive.
4. Fetch the exact published prior ZIP, not a rebuilt local approximation. Match its length and verify the deterministic Ed25519 signature against the pinned signing identity before extraction.
5. Verify the prior app's build number, key, architecture and code signature.
6. Use the pinned Sparkle BinaryDelta tool, format 4 (supported by Sparkle 2.7+), to create the patch from old app to final new app.
7. If the patch is not smaller than the complete ZIP, omit it.
8. Apply the patch to a temporary copy. Require successful BinaryDelta validation, valid code signature and matching bundle content.
9. Sign the patch and add its length, URL, signature and source build number to the appcast's sparkle:deltas enclosure.
10. Publish the full ZIP, DMG and referenced delta before advancing the feed.

The full ZIP remains the fallback for skipped versions, missing or incompatible deltas and failed delta application. This is Sparkle's built-in fallback, not a second updater. A patch failure during generation or verification stops publication rather than silently publishing an unverified patch.

First universal release: 0.0.8 (build 9); migration from 0.0.7 (build 8) uses a full archive. Next universal release 0.0.9 (build 10) can offer `Clutter_9_to_10_universal.delta`. If the measured delta is smaller, verify the actual selected download in the installed application's diagnostic log, not merely the existence of a delta file. The native bridge logs whether the requested archive is full or delta.

References: [Sparkle delta format and fallback](https://sparkle-project.org/documentation/delta-updates/), [Tauri App Store universal target](https://v2.tauri.app/distribute/app-store/).

## 7. Distribution infrastructure and trust

Worker: `updates`. R2 bucket: `clutter-releases`, binding `RELEASES`. Current appcast endpoint (renamed 2026-11-24; deployment verification pending):

`https://updates.clutterapp.workers.dev/appcast.xml`

| Route | Purpose |
| --- | --- |
| /appcast.xml | Current Sparkle feed |
| /releases/Clutter_{version}_universal.zip | Full update |
| /releases/Clutter_{version}_universal.dmg | Direct installation |
| /releases/Clutter_{sourceBuild}_to_{targetBuild}_universal.delta | Incremental update |
| /latest.json and old release names | Compatibility only; no new Tauri releases |

The Worker serves only approved GET/HEAD routes and uses authoritative content types, lengths and no-store response policy. Publishing is through authenticated Wrangler, not through the public Worker. No Cloudflare credentials are embedded in Clutter.

Publish order: validate artifact checksums, versions, code signing and Ed25519 signatures; check each existing remote artifact (refuse different bytes at an existing URL); upload missing objects; download and compare their bytes; re-check the previous appcast; publish the new appcast last; download and compare it. Identical retries are accepted. A local release lock and feed recheck reduce concurrent-publisher hazards; R2 compare-and-swap is not implemented. Use a single publishing machine. Do not reuse a version for changed source or rebuild a partially uploaded version; resume the same complete artifacts.

The appcast is delivered over HTTPS and the archive signature is verified before extraction. The feed itself is not cryptographically signed. Consider Sparkle's signed-feed feature with a tested compatibility migration, not an untested requirement change on an existing feed.

## 8. Signing and Apple enrollment

### Existing direct signing identity

**Do not rename/rotate these internal identifiers** merely because public naming changes from beta to direct:

- Sparkle Keychain account: `com.vigram.clutter.sparkle.beta`
- Pinned public key: `~/.tauri/clutter-sparkle-beta.pub`
- Bundle identifier: `com.vigram.clutter`
- Feed URL: same as §7.

The installed app's SUPublicEDKey is the trust anchor. Preserve the private signing key in Keychain and back it up securely outside the repository; key recovery must be tested. The local loopback integration key is separate. Tauri's former updater key is not a Sparkle key.

Direct entitlements extend the base sandbox only by exact Mach lookups `com.vigram.clutter-spks` and `com.vigram.clutter-spki` for the installer services. The bundle verifier checks the complete entitlement dictionary. There is no broad temporary filesystem exception, inbound network entitlement, or disabled library validation.

### Ad-hoc vs Developer ID

Current test builds use ad-hoc signing. This is not Apple notarization and is not normal frictionless public distribution.

**PREPARED, CREDENTIAL-DEPENDENT, NOT VERIFIED:** The direct builder supports `CLUTTER_DIRECT_SIGNING=developer-id` using a configured `APPLE_SIGNING_IDENTITY` (Developer ID Application) and `CLUTTER_NOTARY_PROFILE` (notarytool Keychain profile). Sparkle's helpers, framework and outer application are signed inside-out, hardened runtime enabled. The app is notarized and stapled before final archive construction; the final DMG is signed, notarized and stapled too. Publication validates signing mode and refuses a downgrade from a previously published Developer ID release.

No Apple credentials are needed to continue ad-hoc universal and delta testing. Enroll only after credential-independent validation. The first notarized migration from ad-hoc needs explicit validation of code-signature requirements, bookmarks, recovery records and existing installation upgrade behavior. Do not assume the successful ad-hoc update validates Apple's signing/notarization path.

Reference: [Sparkle manual code signing](https://sparkle-project.org/documentation/sandboxing/).

### App Store signing

**PREPARED, NOT VERIFIED:** The store path uses the base sandbox plus team/application identifiers, matching provisioning profile, Apple distribution certificate, and installer certificate. No Sparkle. Store credentials and App Store Connect API authentication are configured once; upload uses altool. Apple processing, metadata, review and release approval are separate. The App Store build number is independent of the public app version and must meet Apple's monotonicity requirements.

Use the credential-free `npm run check:appstore` before enrollment to build the universal non-Sparkle code path with an ad-hoc signature and verify its package. It is not a submission package or Apple validation.

Reference: [Apple upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).

## 9. Version and release workflow

Use repository-root commands. The explicit marketing version is synchronized across the workspace app package.json, Cargo.toml and Cargo.lock. Tauri reads the version from the package. The root workspace version is unrelated.

Sparkle build number = major * 1000000 + minor * 1000 + patch + 1, with minor and patch below 1000. Same version may be used for both distribution methods; do not decrease the local marketing version or publish different artifacts at a released direct version. Build-only retry reuses the exact prepared artifacts.

### Direct distribution (normal operation)

```bash
npm run release:direct -- 0.0.8
```

One command synchronizes versions, compiles universal, verifies, signs, produces the full ZIP, DMG and eligible delta, uploads them and advances the appcast. Existing Sparkle installations receive the update automatically; the DMG is for new/manual installations.

For migration testing only, prepare without publishing:
```bash
npm run release:direct -- 0.0.8 --prepare
```
Then publish the exact prepared bytes with the normal command once verified.

### App Store distribution (after credentials configured)

```bash
npm run release:appstore -- 0.0.8 9
```

The second argument is the chosen App Store build number; alternatively use APP_STORE_BUILD_NUMBER. Configured credentials: APPLE_SIGNING_IDENTITY, APPLE_INSTALLER_IDENTITY, APPLE_PROVISIONING_PROFILE, APP_STORE_API_KEY, APP_STORE_API_ISSUER. The App Store Connect private API key must be installed in an altool-supported secure location. The script validates and uploads the signed PKG; it does not submit for review automatically. Use the same marketing version as direct distribution when releasing both.

### One-time Worker deployment for the universal/delta route change

```bash
cd workers/updates
npm run typecheck && npm test && npm run deploy
```

No routine Worker deployment for each application release. Retain compatibility routes. Do not publish the new feed until the updated Worker accepts the new artifact names.

### Output and sharing

```text
apps/app/src-tauri/target/sparkle/releases/0.0.8/
  Clutter_0.0.8_universal.dmg
  Clutter_0.0.8_universal.zip
  appcast.xml
  SHA256SUMS
  [Clutter_<sourceBuild>_to_<targetBuild>_universal.delta]
```

Only share the DMG or the printed DMG URL for manual installation. Do not distribute the loopback integration app. The App Store signed PKG resides under its separate target directory.

Diagnostic commands: npm run check:release, npm run check:appstore, npm run build:appstore (build-only after Apple credentials), npm run build:share (notarized direct build-only after credentials). Old release:beta/build:beta/release:local are transitional aliases, not additional architectures. No new releases use the old Tauri manifest.

## 10. Audit findings and controls

| Severity / area | Observation and disposition |
| --- | --- |
| Critical — updater installation | Tauri updater failed in sandbox. Sparkle replaced it and passed remote 0.0.7 test. Old runtime and direct dependencies removed. New branch still requires regression build. |
| High — universal compatibility | ARM-only clang and bundle verification, host-only App Store build were blockers. Target-aware bridge, universal target, all-Mach-O verification and architecture-specific build outputs implemented. Native execution on both Macs pending. |
| High — incremental integrity | Previous local rebuild is not a reliable delta base. Fetch and verify exact previous published bytes; patch and compare resulting signed bundle; preserve full fallback. Actual Sparkle selection/application tests pending. |
| High — publication consistency | Original publisher could replace versioned objects and refused any same-version retry. Identical retry, overwrite checks, appcast-last and remote byte verification now implemented. Still one release machine; conditional R2 writes not implemented. |
| High — signing/key continuity | Existing key/feed must survive the naming and architecture migration. Key pinned; code-signing downgrade blocked. Secure backup and recovery test outstanding. |
| High — notarization / store | Credential-dependent signing, provisioning, notarization and upload scripts prepared. Neither is proven by ad-hoc beta tests. Use credential-free preflight first. |
| High — save/quit | Explicit update restart has a separate close orchestration from normal window close. Review races (concurrent quit, bootstrap, active save, failed install) and recovery on actual machines; preserve durable data and consent rules. Do not claim this audit proves every failure path. |
| Medium — native IPC | Command manifest previously omitted should_use_gmail_for_support_email even though handler/capability existed. Corrected. Static comparison confirms all 43 registered/listed/granted commands match. Rust test execution pending. |
| Medium — lifecycle | Poll timer can be restarted by manual actions; review single-flight scheduling. Sparkle's termination retry callback is not used by the custom driver. Test failed termination and canceled restart; do not alter proven normal UX without reproducing issue. |
| Medium — supply chain | Sparkle version is pinned and framework code signature checked; SDK archive digest and signing-tool provenance should also be pinned/verified. Do not automatically upgrade Sparkle versions in release scripts. |
| Medium — privacy | Update check adds ordinary IP/request metadata traffic; system profiling disabled. Reconcile the privacy audit/policy and App Store declarations with direct update traffic and actual Cloudflare account logging configuration. No evidence of note upload in this path. |
| Medium — repository reproducibility | Old dependencies removed from manifests; regenerate lockfiles with npm/cargo on Mac, review changes, commit synchronized version/locks before merge. The tested local version is not necessarily the remote branch's package version. |
| Medium — documentation | Earlier Apple Silicon-only beta terminology is historical. This ODR is current; use the new runbook. Keep legacy endpoint compatibility until migration complete. |
| Medium — OS/store migration | Same bundle identifier does not prove bookmark access survives a signing-identity or channel change. Test ad-hoc -> Developer ID and direct -> App Store separately before promising seamless migration. |

## 11. Validation and acceptance gates

**Previously passed (2026-11-24):** sandboxed native Sparkle probe; local 0.0.3 latest check; manual 0.0.3 -> 0.0.4; automatic 0.0.4 -> 0.0.5; Cloudflare deployment; remote installation 0.0.6 and separate-Mac 0.0.6 -> 0.0.7 update. A local server connection failure and IPC Boolean error were fixed. This is historical evidence for the earlier ARM-only path.

**Current review:** static comparison of the 43 native command entries passed. Four Worker routing tests passed using a mocked R2 bucket and Node's TS type stripping (test import extension adjusted for this standalone harness). Covers full/delta/feed delivery, correct MIME/cache headers, legacy routes, HEAD and rejected writes/invalid paths. Actual Cloudflare typecheck and deployment on the release Mac remain pending. Release checks script includes shell/Python syntax, frontend build, native command and IPC regression tests, Worker typecheck and tests. None of the new macOS builds, full application tests, native delta or Apple upload has been executed in this review.

Acceptance sequence:
1. Pull branch, refresh dependencies, run npm run check:release and full application regression tests; classify failures against baseline.
2. Build credential-free universal App Store preflight.
3. Prepare 0.0.8 direct without publication, verify all native binaries, signatures, DMG, Space access, notes and normal quit. Test Intel and Apple Silicon.
4. Redeploy the Worker and publish the prepared 0.0.8 archive. Confirm old 0.0.7 installations upgrade through the same feed/key (full migration).
5. Prepare/publish 0.0.9 with a small controlled change. Confirm actual signed delta generated, smaller than full ZIP, selected on 0.0.8 clients, installed and relaunched on both architectures. Confirm fallback for skipped release/corrupted or inapplicable delta.
6. Test unavailable network, wrong signature, publication interruption/retry, manual Later, automatic scheduled check, cancellation during unsaved changes, ordinary quit with prepared update and update failure recovery.
7. Back up the key and verify recovery. Reconcile privacy and distribution documentation; review synchronized lockfiles and branch diff before merge.
8. Only then configure Apple credentials and verify notarization and store submission/upload, including signing-identity migrations.

## 12. Implementation reference

| File | Ownership |
| --- | --- |
| apps/app/src-tauri/build.rs | Native target and permission manifest |
| apps/app/src-tauri/src/sparkle_bridge.m | Sparkle driver, download and restart lifecycle |
| apps/app/src-tauri/src/sparkle_update.rs | Restricted native IPC |
| apps/app/src-tauri/Entitlements.sparkle.plist | Exact direct-update sandbox capabilities |
| apps/app/src/app/AppShell.tsx | State and safe closure |
| apps/app/src/app/layouts/sidebar/Sidebar.tsx / Sidebar.css | Existing update alert |
| apps/app/scripts/release-channel.sh | Two explicit-version release commands |
| apps/app/scripts/build-sparkle-integration.sh | Shared direct/loopback universal builder |
| apps/app/scripts/add-sparkle-delta.py | Previous-release selection and verified patch |
| apps/app/scripts/publish-update.sh | Integrity, version guards, upload and feed-last |
| apps/app/scripts/build-app-store.sh | Signed universal Store package and optional upload |
| apps/app/scripts/verify-bundle.sh | Bundle and architecture verification |
| apps/app/scripts/check-release.sh / check-appstore.sh | Credential-independent release gates |
| workers/updates/src/index.ts / tests/index.test.ts | Read-only distribution endpoint and tests |

**Decision:** keep one direct updater, one Store path and two public release commands. Finish validation and hardening before Apple enrollment. No release has been published by this code-review session.


### Hostname migration (2026-11-24)

The Worker is now `updates` under `clutterapp.workers.dev`. Keep the existing R2 bucket, Sparkle key, bundle identifier, and XML namespace `https://clutter-updates.vigram-sivakumar.workers.dev/ns` (an identifier, not a network request). Delta preparation can map a strictly matched legacy universal archive URL to the new origin, verifying the original Ed25519 signature. Existing beta apps use the old feed URL and require a fresh installation if that endpoint no longer works. Do not overwrite existing versioned archives. Live verification is pending.

## 13. Release progress — 2026-11-24

This section supersedes the earlier pending validation statements where the following evidence is available. The branch remains `release/apple-silicon-beta` (historical name; artifacts are universal).

| Stage | Status | Evidence / outstanding work |
| --- | --- | --- |
| 1. Delta update | Passed on Apple Silicon | Published 0.0.9 (build 10) -> 0.0.10 (build 11). Full ZIP 22,334,380 bytes; delta 1,720,682 bytes (92.3% smaller). Native logs recorded delta selection and successful EdDSA verification; user confirmed relaunch and restored Space data. Logs do not independently exclude a later full retry in this particular run. |
| 2. Full fallback | Passed on Apple Silicon | Isolated localhost feed, separate Sparkle test key and temporary macOS account. 0.0.8 -> 0.0.10 requested only full ZIP; user confirmed relaunch and note preservation. 0.0.9 -> 0.0.10 with signed inapplicable delta requested delta then full ZIP (HTTP 200), relaunched as 0.0.10. Data preservation in this second scenario was not explicitly reported. |
| 3. Cross-machine validation | Apple Silicon passed; Intel deferred by owner | User confirmed installed 0.0.10 retained Space access across quit/relaunch, note editing/saving, Unsplash search, attribution and cover persistence. Fresh DMG installation reproduced expected Gatekeeper warning on ad-hoc build; Terminal installation tested. Universal bundle verification passed for all six Mach-O files. Native Intel installation, launch, save and updater tests remain pending hardware; do not claim runtime Intel validation. |
| 4. Architecture and security audit | In progress | See [release architecture and security audit](release-architecture-security-audit.md). |
| 5. Consolidation and merge | Pending | Resolve or explicitly accept findings, rerun checks, reconcile source versions and locks, review branch before merging. |
| 6. Apple Developer enrollment | Deferred | Owner requires credential-independent readiness first. |
| 7. Official distribution | Pending | Developer ID signing/notarization, signing/channel migration, App Store signed package and submission. |

Additional evidence: the universal 0.0.10 release passed checksum, entitlement, code-signature, atomic-write, privacy-manifest, icon and architecture checks before publication. The public feed was advanced after archive uploads. The shared symlink-safe bundle comparison passed six regression tests. Earlier Worker deployment passed nine tests; final installer colour revision requires confirmation of its own deployment/test output. The full regression suite passed 18,425 tests at an earlier revision and must be rerun before merge.

The current public release remains 0.0.10. The fallback fixtures must never be published or distributed as production installers. Intel deferral allows the audit to proceed, not a claim of verified Intel behavior.

## 14. Distribution security and privacy review

These gates supersede the earlier progress notes where evidence has advanced. Public 0.0.10 remains the evidence baseline.

### Before the next direct release

- **Sparkle key recovery verified.** On 25 November 2026 the release owner confirmed an encrypted offline backup and successful isolated recovery on a personal Mac. The restored key matched the published public identity, signed a disposable fixture that verified independently, and was removed from the isolated Keychain before the image was ejected. See the [recovery runbook](sparkle-signing-key-recovery.md).
- **Deploy the revised privacy disclosure at the existing URL and verify its served text.** Confirm account-level Updates logging, Logpush and retention. The checked-in Worker configuration disables observability. [Policy site source](public-site/privacy/index.html) · [Sparkle request metadata](https://sparkle-project.org/documentation/api-reference/Classes/SPUUpdater.html)
- **Use verified inputs and one publishing machine.** Build and publish verify the upstream SDK digest before extracting release tools. Publish compares the ZIP with the verified app, checks the complete manifest, takes a local lock and advances the feed last. Resume an interrupted publication using identical artifacts. Conditional remote writes and signed-feed migration remain deferred.
- **Complete consolidated validation.** Run the full suite and universal App Store preflight. In a separate-key local feed, verify wrong signatures and offline checks leave the existing installation usable. Exercise “Later”, canceled restart, save/quit and termination retry. Existing Apple Silicon update and fallback evidence stands. Intel runtime remains deferred.

### After Apple Developer enrolment

- **Developer ID.** Establish the Team ID, Developer ID Application identity and notarytool profile. Validate signing of nested Sparkle services, notarization and stapling for the app and DMG, and Gatekeeper on a clean Mac. Test ad-hoc-to-Developer-ID migration with the existing EdDSA key, full fallback, bookmarks, notes, settings and recovery.
- **Terminal installer.** Pin the enrolled Team ID before distributing Developer ID builds through Terminal. Test that the expected notarized build passes and a different signer, changed archive or occupied install path fails. The ad-hoc beta retains the documented HTTPS trust boundary. [Apple macOS distribution](https://developer.apple.com/macos/distribution)
- **Mac App Store.** Register the App ID and create the listing. Configure matching distribution and installer certificates, profile and App Store Connect upload access. Verify the independent Store build number, signed dry run, signed package, privacy manifest and Apple's validation. Test direct-to-Store migration and bookmark reauthorization. Complete App Privacy, age rating, export compliance, review notes and listing materials. [App Store gates](mac-app-store-release-checklist.md#current-submission-gates)
