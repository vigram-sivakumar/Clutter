# Application Updates and Beta Distribution — ODR

**Date:** 2026-11-24  
**Status:** Implemented and validated end to end for Apple Silicon beta distribution  
**Current tested version:** 0.0.7  
**Branch:** `release/apple-silicon-beta`

This is a living source-of-truth document for Clutter's application update architecture, distribution infrastructure, release process and updater UX. Future changes affecting these systems must update this document in place rather than introduce competing documentation.

Evidence labels distinguish implemented and verified behaviour, investigated and rejected approaches, and open validation work. The version above records the tested local release, not a claim that the repository's version files have been committed at that version.

## 1. Objectives

The application update system must:

- Allow users to update Clutter without manually downloading and reinstalling each release.
- Support silent background downloading and preparation of updates.
- Preserve the macOS App Sandbox.
- Preserve existing Space access, security-scoped bookmarks and atomic save guarantees.
- Provide a consistent, unobtrusive update experience.
- Support Apple Silicon beta distribution without Apple Developer Program membership.
- Provide a repeatable, single-command release pipeline after version synchronization.
- Cryptographically verify update archives before installation.
- Keep direct distribution independent of Mac App Store distribution.

Clutter remains a local-first application. The remote distribution infrastructure delivers application updates; it does not manage user Spaces, notes or assets.

## 2. Architecture decision

**IMPLEMENTED + VERIFIED**

Clutter uses Sparkle 2 as its native macOS application updater for direct-download beta builds.

Tauri remains responsible for the desktop application runtime and native application packaging. Sparkle owns the update lifecycle, including update discovery, downloading, verification, preparation, application replacement and relaunch.

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Application | React, TypeScript | Update presentation and user interaction |
| Desktop runtime | Tauri | Application lifecycle and native IPC |
| Native bridge | Objective-C and Rust | Communication between Clutter and Sparkle |
| Update engine | Sparkle 2.10.1 | Download, verification and installation |
| Distribution endpoint | Cloudflare Workers | Public read-only HTTPS delivery |
| Artifact storage | Cloudflare R2 | Release archives, installers and appcast |
| Update signing | Ed25519 | Cryptographic archive verification |
| Application signing | Ad-hoc signing | Beta application code signing |

No custom application replacement mechanism is required.

## 3. Rejected approach: Tauri updater

**INVESTIGATED + REJECTED**

The initial implementation used Tauri's native updater plugin with Cloudflare Workers and R2.

Although update discovery and downloading succeeded, installation failed when the updater attempted to replace the installed application.

Observed error:

> Failed to move the new app into place

Native diagnostic logs identified a sandbox denial involving:

`authorization-right-obtain system.privilege.admin`

The tested Tauri updater installation path attempted to obtain privileges unavailable to Clutter's sandboxed process.

The following alternatives were not adopted:

- Disabling the App Sandbox.
- Granting unrestricted filesystem access.
- Introducing a custom privileged application replacement mechanism.
- Requiring users to manually reinstall every update.

Sparkle was selected because its installer-service architecture supports the required sandboxed update workflow.

The previous Tauri updater implementation remains in the repository pending cleanup. It is not active in the Sparkle beta build.

## 4. Native integration architecture

Sparkle communicates with Clutter through a narrow native bridge.

```text
React application
       |
       | Tauri IPC
       v
Rust updater command
       |
       | Native C ABI
       v
Objective-C Sparkle bridge
       |
       v
Sparkle SPUUpdater
       |
       v
Sparkle installer services
```

### 4.1 Native responsibilities

The Objective-C bridge implements the Sparkle user driver and updater delegate.

It owns:

- Updater initialization.
- Manual and automatic update checks.
- Native update dialogs.
- Update download and preparation state.
- Installation callbacks.
- Installation and relaunch coordination.

Sparkle operations are dispatched onto the AppKit main thread.

### 4.2 IPC contract

The Rust command `sparkle_update` exposes a restricted set of actions:

| Action | Responsibility |
| --- | --- |
| `start` | Initialize the updater |
| `status` | Retrieve the current updater state |
| `check` | Initiate a manual update check |
| `restart` | Request installation of a prepared update |
| `cancel_restart` | Cancel a pending restart request |
| `commit_restart` | Authorize installation after safe application closure |

The native bridge returns a structured JSON snapshot containing the update phase, version, error and operation success.

The interface cannot supply arbitrary download URLs, signing keys, filesystem paths or native method selectors.

The frontend polls native state every 750 milliseconds. This is an in-process state query, not a network update request.

### 4.3 IPC response validation

During integration testing, an Objective-C boxed comparison could serialize the operation success value as an integer rather than a JSON Boolean.

Rust expected a Boolean and consequently rejected otherwise successful operations.

The bridge now returns explicit Boolean values, and Rust validates the response type and guarantees a nonempty diagnostic message on failure.

Regression tests were added for valid Boolean responses, invalid integer responses and empty error descriptions. Execution of those tests has not been independently recorded.

## 5. Update lifecycle

### 5.1 Automatic updates

**IMPLEMENTED + VERIFIED** for the tested startup and restart flow. The scheduled interval is configured but a full 24-hour cycle has not been independently observed.

Automatic update checks occur when the application initializes. Sparkle is configured with a scheduled check interval of 24 hours.

The expected automatic update lifecycle is:

```text
Application launch
       |
       v
Check remote appcast
       |
       v
Newer version available?
       |
       +-- No --> Remain idle
       |
       +-- Yes
             |
             v
       Download silently
             |
             v
       Verify and prepare update
             |
             v
       Display sidebar alert
             |
             v
       User selects Restart now
             |
             v
       Safely close active Space
             |
             v
       Install update
             |
             v
       Relaunch Clutter
```

The user can continue using Clutter while the update is downloading and preparing.

The sidebar notification must not appear merely because a newer version exists. It appears when the update is prepared and available for installation.

### 5.2 Manual updates

**IMPLEMENTED + VERIFIED** for the manual Download and Install path.

The application menu provides **Check for Updates…**

When no newer release exists, a native macOS alert confirms that the installed version is current.

When an update exists, the native alert presents:

- **Download and Install**
- **Later**

Download and Install initiates the update process and requests installation after preparation.

Later dismisses the native prompt and is implemented to allow background downloading to continue through a subsequent background check.

The manual Download and Install path was verified directly. The Later-specific path requires dedicated regression validation.

### 5.3 Application closure and installation

Before authorizing an explicit restart, Clutter:

1. Waits for any active Space initialization to settle.
2. Checks for unsaved work.
3. Creates recovery snapshots when necessary.
4. Requests confirmation where unsaved work requires user intervention.
5. Closes the active application services.
6. Authorizes Sparkle to install the update.

Sparkle owns application replacement and relaunch.

The frontend must not independently terminate or relaunch the application using Tauri's process plugin during a Sparkle update.

Sparkle may also install a prepared update during ordinary application termination. This behaviour requires separate validation against Clutter's normal close lifecycle.

## 6. Update notification UX

**IMPLEMENTED + VERIFIED IN REMOTE UPDATE FLOW**

The update notification is rendered inside `.sidebar__footer`, immediately above the existing Footer component.

The notification uses Clutter's existing Alert and Button components.

| Property | Value |
| --- | --- |
| Title | New update available |
| Description | Version {version} |
| Primary action | Restart now |
| Button variant | Primary |
| Button size | Medium |
| Button width | Full width |
| Default presentation | Collapsed |
| Expanded presentation | Hover or keyboard focus |
| Dismissible | No |

The notification does not expose a Later action because downloading and preparation have already completed.

### 6.1 Entrance animation

The notification uses the same motion characteristics as Clutter's toaster.

- Initial opacity: 0.
- Initial vertical offset: `var(--space-8)`.
- Final opacity: 1.
- Final vertical offset: 0.
- Duration: `var(--duration-interaction)`.
- Easing: `var(--easing-interaction)`.

The animation is applied to the sidebar notification wrapper, not to the shared Alert component.

Reduced-motion preferences disable the entrance animation.

The existing collapse and expand behaviour remains independent of the entrance animation.

The remote update test included the entrance animation in its checklist and was reported successful by the tester; individual accessibility and animation assertions were not independently logged.

## 7. Distribution infrastructure

**IMPLEMENTED + VERIFIED**

Cloudflare provides the remote distribution infrastructure.

| Resource | Value |
| --- | --- |
| Worker | `clutter-updates` |
| R2 bucket | `clutter-releases` |
| Bucket binding | `RELEASES` |
| Protocol | HTTPS |
| Storage access | Private R2 bucket through a public read-only Worker |

### 7.1 Distribution endpoint

`https://clutter-updates.vigram-sivakumar.workers.dev`

The Worker exposes the following resources:

| Endpoint | Responsibility |
| --- | --- |
| `/appcast.xml` | Current Sparkle release metadata |
| `/releases/Clutter_beta_{version}_aarch64.zip` | Sparkle update archive |
| `/releases/Clutter_beta_{version}_aarch64.dmg` | Manual installation image |
| `/latest.json` | Retained legacy Tauri update manifest |

The Worker accepts GET and HEAD requests. Publishing occurs separately through authenticated Cloudflare tooling.

The application does not contain Cloudflare publishing credentials.

The appcast uses a no-store cache policy to prevent stale release discovery. The current Worker also serves release artifacts with a no-store policy.

### 7.2 Appcast

Sparkle discovers updates through an XML appcast instead of Tauri's previous `latest.json` manifest.

The appcast records:

- Release version.
- Monotonically increasing Sparkle build number.
- Minimum supported macOS version (13.3 in the current beta).
- Update archive URL.
- Archive size in bytes.
- Ed25519 archive signature.
- Public signing key metadata used by Clutter's publishing guard.

The public key embedded in the installed application is the trust anchor for archive verification. Public key metadata in the appcast does not replace it.

## 8. Security architecture

### 8.1 App Sandbox

The App Sandbox remains enabled in all packaged beta builds.

The existing application permissions remain intact:

- User-selected file read/write access.
- Application-scoped security bookmarks.
- Outbound network access.

Sparkle requires two narrowly scoped Mach service lookup exceptions:

```text
com.vigram.clutter-spks
com.vigram.clutter-spki
```

These are defined in `Entitlements.sparkle.plist`.

The bundle verifier compares the complete Sparkle entitlement dictionary against the expected configuration.

Unrestricted filesystem access, inbound network access and debugging entitlements remain prohibited.

### 8.2 Update signing

Sparkle uses Ed25519 signatures to authenticate update archives.

Separate signing identities are maintained for local integration testing and beta distribution.

Beta Keychain account:

`com.vigram.clutter.sparkle.beta`

Pinned public key location:

`~/.tauri/clutter-sparkle-beta.pub`

The private signing key remains in the release machine's Keychain.

The public key is embedded in the packaged application's Info.plist as `SUPublicEDKey`.

The release pipeline prevents silent signing-key replacement and checks continuity against the previously published appcast.

**The beta signing key must be securely backed up.** Losing the private key could prevent existing installations from accepting future updates.

### 8.3 Application signing and Gatekeeper

Beta applications use ad-hoc macOS code signing and Sparkle archive signing.

These are distinct security mechanisms.

Sparkle archive verification does not provide Apple Developer ID signing, notarization or standard Gatekeeper approval.

The current distribution model is intended for controlled beta testing. Downloaded installers may require explicit macOS approval.

### 8.4 Mac App Store isolation

The Sparkle configuration is excluded from the normal Mac App Store build.

The App Store entitlement configuration remains independent. App Store releases must use Apple's application update mechanism.

No Apple Developer Program membership is required for the current controlled beta workflow.

## 9. Release artifacts

Each beta version is packaged into its own release directory.

```text
apps/app/src-tauri/target/sparkle-beta/
├── builds/
├── feed/
└── releases/
    └── 0.0.7/
        ├── Clutter_beta_0.0.7_aarch64.dmg
        ├── Clutter_beta_0.0.7_aarch64.zip
        ├── appcast.xml
        └── SHA256SUMS
```

| Artifact | Purpose |
| --- | --- |
| DMG | Manual installation and distribution |
| ZIP | Sparkle application update |
| Appcast | Update discovery and signature metadata |
| SHA256SUMS | Artifact integrity validation |

The DMG contains the final Sparkle-enabled application and an Applications folder shortcut.

The ZIP contains the same packaged application in Sparkle-compatible archive format.

Only the DMG should be shared with new beta users.

Existing Sparkle beta users receive subsequent versions through the updater.

Previously published versioned artifacts must not be overwritten or reused for a different application build. The publishing version guard rejects releases at or below the current feed version; immutable storage enforcement and concurrent-publisher protection are not yet implemented.

## 10. Version management

Clutter currently uses the `0.x.x` version range for pre-release development and beta distribution.

The current tested application version is `0.0.7`.

Application versions must remain synchronized across:

- `apps/app/package.json`
- `apps/app/src-tauri/Cargo.toml`
- `apps/app/src-tauri/Cargo.lock`

The Tauri configuration reads the application version from `package.json`.

Sparkle uses a separate monotonically increasing build number:

```text
build = major × 1,000,000 + minor × 1,000 + patch + 1
```

Minor and patch components must be below 1000.

For example:

| Application version | Sparkle build |
| --- | --- |
| 0.0.5 | 6 |
| 0.0.6 | 7 |
| 0.0.7 | 8 |
| 0.0.8 | 9 |

The Mac App Store bundle version remains independently managed.

The publishing script rejects release versions that are not newer than the currently published Sparkle release.

Version synchronization is currently manual. Automated version management remains follow-up work.

## 11. Release procedure

All release commands are executed on the development Mac, not on a beta user's Mac.

### 11.1 Publish a new beta

The following example releases version `0.0.8` from version `0.0.7`. Confirm the current local version before using it.

```bash
cd "$(git rev-parse --show-toplevel)/apps/app" &&
npm version 0.0.8 --no-git-tag-version &&
sed -i '' 's/^version = "0\.0\.7"$/version = "0.0.8"/' src-tauri/Cargo.toml &&
cargo check --manifest-path src-tauri/Cargo.toml &&
npm run release:beta
```

The release command performs the following operations:

1. Validate the Cloudflare CLI configuration.
2. Validate application version synchronization.
3. Validate atomic save configuration.
4. Validate the privacy manifest.
5. Compile the frontend and native application.
6. Bundle Sparkle.
7. Configure the HTTPS appcast and public signing key.
8. Apply the expected application signature and entitlements.
9. Verify the packaged application.
10. Generate and sign the Sparkle update archive.
11. Generate and verify the DMG.
12. Generate the appcast and artifact checksums.
13. Validate release ordering and signing-key continuity.
14. Upload the ZIP and DMG to R2.
15. Download and compare the uploaded artifacts.
16. Publish the appcast last.
17. Verify the published appcast.

The appcast is published last so existing applications cannot discover a release before its required artifacts are available.

Wait for the successful publishing message before distributing the DMG. The Finder window can open before publication finishes.

### 11.2 Available commands

| Command | Responsibility |
| --- | --- |
| `npm run build:beta` | Build and verify beta artifacts without publishing |
| `npm run release:beta` | Build, verify and publish a beta release |
| `npm run publish:update` | Publish existing completed beta artifacts |
| `npm run release:local` | Build an installable Sparkle beta without publishing |
| `npm run check:version` | Validate application version synchronization |
| `npm run build:appstore` | Build the separate App Store distribution candidate |
| `bash scripts/build-sparkle-integration.sh` | Build the loopback integration variant |

The local integration variant uses a separate signing identity and a localhost feed. It must not be distributed to beta users. The remote beta needs neither the local Python server nor the Tauri updater signing key.

The Developer ID signed and notarized direct-distribution path has not yet migrated to Sparkle. The production release command intentionally stops rather than publishing incompatible artifacts.

### 11.3 Cloudflare Worker deployment

The Worker only needs redeployment when its implementation or configuration changes.

```bash
cd "$(git rev-parse --show-toplevel)/workers/updates" &&
npm run typecheck &&
npm run deploy
```

Routine application releases do not require Worker redeployment.

### 11.4 Installing on another Mac

For a new Apple Silicon beta user:

1. Share the latest published DMG.
2. Open the DMG.
3. Drag Clutter into Applications.
4. Launch Clutter.
5. Complete any applicable macOS approval and Space authorization steps.

Users migrating from the legacy Tauri updater require a one-time manual installation of a Sparkle-enabled beta.

After migration, subsequent application versions are delivered through Sparkle.

Users do not need Node.js, Rust, Tauri, Wrangler, Cloudflare credentials or Terminal commands for routine installation and updates.

## 12. Validation history

**IMPLEMENTED + VERIFIED**

The implementation was validated incrementally before remote distribution was enabled.

| Stage | Validation | Result |
| --- | --- | --- |
| Native Sparkle probe | Sandboxed application replacement and relaunch | Passed |
| Clutter 0.0.3 | Local appcast discovery and latest-version confirmation | Passed |
| 0.0.3 → 0.0.4 | Manual Download and Install | Passed |
| 0.0.4 → 0.0.5 | Automatic download and sidebar restart | Passed |
| Cloudflare deployment | Worker type checking and deployment | Passed |
| Clutter 0.0.6 | Installation on a separate Apple Silicon Mac | Passed |
| 0.0.6 → 0.0.7 | Remote automatic update workflow | Passed |

Bundle verification also confirmed the expected sandbox configuration, native atomic writer, Sparkle installer services, valid code signatures, privacy manifest and Apple Silicon architecture.

The separate-Mac update was confirmed through direct user testing on 2026-11-24.

During local testing, a stopped loopback server initially caused a connection failure (Sparkle error 2001, underlying NSURLErrorDomain -1004). Restarting the local server restored HTTP access; the IPC Boolean correction described in §4.3 resolved the subsequent empty-error failure. Neither issue required loosening sandbox permissions.

This validates the tested beta update workflow. It does not constitute exhaustive validation of every failure, recovery and operating-system compatibility scenario.

## 13. Implementation reference

All paths are relative to the repository root.

| File | Responsibility |
| --- | --- |
| `apps/app/src-tauri/src/sparkle_bridge.m` | Native Sparkle driver and lifecycle |
| `apps/app/src-tauri/src/sparkle_update.rs` | Restricted IPC command and response validation |
| `apps/app/src-tauri/build.rs` | Native bridge compilation and linking |
| `apps/app/src-tauri/Entitlements.sparkle.plist` | Sparkle-specific sandbox entitlements |
| `apps/app/src-tauri/src/app_menu.rs` | Check for Updates menu integration |
| `apps/app/src/app/AppShell.tsx` | Update state and safe restart coordination |
| `apps/app/src/app/layouts/sidebar/Sidebar.tsx` | Sidebar update notification |
| `apps/app/src/app/layouts/sidebar/Sidebar.css` | Notification entrance animation |
| `apps/app/scripts/build-sparkle-integration.sh` | Shared Sparkle build pipeline |
| `apps/app/scripts/build-beta.sh` | Beta build entry point |
| `apps/app/scripts/verify-bundle.sh` | Package verification |
| `apps/app/scripts/publish-update.sh` | Cloudflare artifact publishing |
| `apps/app/scripts/release.sh` | Release orchestration |
| `workers/updates/src/index.ts` | Public distribution endpoint |
| `workers/updates/wrangler.toml` | Cloudflare resource configuration |

Related documentation: [Building and distributing Clutter](./building-and-distribution.md), [ADR-063: Atomic vault saves](./adr/063-atomic-vault-saves.md). Where older direct-distribution instructions conflict with this ODR, use this ODR for the current Sparkle beta workflow pending documentation reconciliation.

## 14. Architectural invariants

Future modifications must preserve the following rules:

1. The application must remain sandboxed.
2. Atomic saves remain the only vault-writing system.
3. Application updates must not modify user-owned Markdown files or assets as part of application replacement.
4. Sparkle owns direct-distribution application installation and relaunch.
5. The notification appears only after an update is prepared.
6. Explicit restart requests respect Clutter's safe-close lifecycle.
7. Release archives must be cryptographically signed.
8. Published release versions must increase monotonically.
9. Release artifacts must be uploaded and verified before publishing the appcast.
10. Cloudflare publishing credentials must never be embedded in the application.
11. Direct distribution and Mac App Store update mechanisms must remain separate.
12. Sparkle and Tauri updaters must never be active in the same build.

## 15. Remaining work

The following items remain open and must not be treated as completed:

- Remove the obsolete Tauri updater implementation and dependencies after reviewing remaining development and distribution paths.
- Consolidate the temporary Sparkle integration and production beta build structure.
- Automate application version increments and synchronization.
- Securely back up the beta Ed25519 private signing key and document key recovery.
- Execute the updater IPC regression tests and full application regression suite.
- Validate interrupted downloads, unavailable networks, corrupted archives and invalid signatures.
- Validate the manual Later action independently.
- Validate the scheduled check interval and prepared-update installation during ordinary application termination.
- Validate unsaved-work cancellation and installation failure recovery.
- Establish a release rollback and recovery procedure, immutable artifact enforcement and concurrent-publisher protection.
- Validate additional supported macOS versions and reduced-motion behavior.
- Implement Intel distribution if required.
- Review and migrate the Developer ID signed and notarized distribution path.
- Reconcile existing distribution documentation with this ODR.
- Review and merge the release branch into `main`.

## 16. Final decision

Sparkle 2 is the selected update engine for Clutter's sandboxed direct-download macOS distribution.

Cloudflare Workers and R2 provide the release delivery infrastructure. Clutter retains responsibility for application state, user experience, safe closure and vault durability.

The Apple Silicon beta workflow is operational and has been validated on a separate Mac without Apple Developer Program membership.

Future engineering work should simplify, harden and maintain this architecture rather than introduce another application update mechanism.
