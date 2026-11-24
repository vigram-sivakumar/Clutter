# Clutter release architecture and security audit

Started 2026-11-24. Scope: the entire desktop application, native bridge, workspace packages, release tooling, update and Unsplash Workers. Audit branch: release/apple-silicon-beta. Published beta: 0.0.10. This is a living audit record, not a security certification.

## Progress and constraints

- Apple Silicon installation, normal delta selection, skipped-version full update, signed inapplicable-delta fallback and relaunch tested. Space restoration, editing and Unsplash persistence confirmed on the regular test installation.
- Native Intel runtime verification deferred at the owner's direction. Universal binary validation passed for six Mach-O files, but that is not runtime evidence.
- Apple Developer enrollment is the final credential-dependent step after implementation, review and credential-independent tests.
- The first review uses explicit release-branch file reads through the GitHub connector. It is not a complete repository checkout, dependency scan, runtime trace or line-by-line review. A current local inventory and test results are needed to close coverage gaps.

## Audit method and gates

1. Inventory tracked source and manifests, identify module ownership, enumerate all IPC commands and data/network boundaries.
2. Review filesystem, persistence and recovery end to end (renderer save orchestration, native path validation, atomic replace, concurrency, watchers, crash recovery, exports, asset import).
3. Review renderer trust boundaries (Markdown parsing, rich HTML paste, links, PDF/image rendering, content sanitization, CSP, asset serving and native capability use).
4. Review privacy and network policy (HTTP callers, opener, Unsplash, remote assets, logging, Worker rate limits and policy disclosures).
5. Review application architecture and quality (editor, indexing, page lifecycle, sidebar/state, package boundaries, duplicate implementations, obsolete release paths and native lifecycle).
6. Review dependencies and performance using locked dependency versions and measurements; do not infer performance or vulnerability results from package manifests.
7. Review distribution security, test failure paths, address findings, rerun full regression/native tests and App Store preflight before consolidation.

## Initial source review

The following findings are based on inspected portions of the named files. Severity is provisional until actual reachability and intended behavior are verified. A known trade-off is not automatically a new vulnerability. No product code was changed during this initial pass.

| ID | Priority | Evidence and finding | Verification / disposition |
| --- | --- | --- | --- |
| A01 | High review | apps/app/src-tauri/capabilities/default.json grants fs read/stat/exists/list and static $HOME plus $HOME/**. Custom mutations use narrower runtime scope, but the plugin's read boundary is broader. OS sandbox remains a separate limit; this does not prove arbitrary access to the real home folder. | Inventory every plugin read caller, especially app-data, recovery and onboarding. Verify actual ACL outside a selected Space in the packaged sandbox. Replace broad read grants only after preserving legitimate reads. |
| A02 | High review | default.json permits http:default with http://* and https://*. tauri.conf.json restricts renderer connect-src to IPC and the Unsplash Worker, but native plugin HTTP permission is a separate boundary. | Enumerate all native HTTP callers, user-initiated URL imports and redirects. Test destination/redirect constraints; evaluate narrower capabilities or a purpose-built fetch boundary without breaking remote asset import. |
| A03 | High review | apps/app/src-tauri/src/vault_asset_scope.rs canonicalizes a root to check scope but returns the original path to grant asset access. The command checks is_allowed without an explicit is_forbidden callback. Existing tests reject a link pointing outside scope; they do not establish behavior after link retargeting or an explicitly forbidden path. | Test real asset protocol behavior, canonical grant and denied subtree handling. Review all other scope-grant sites before patching. Do not describe this as a confirmed arbitrary-file-read vulnerability. |
| A04 | Medium/high integrity | fs_authorization.rs documents non-atomic check/use and process-lifetime runtime grants after forgetting a Space. atomic_commands.rs documents no backend registry of opened vaults: a supplied root narrows runtime scope but is not authorization by itself. | Establish threat model for local concurrent modification and renderer compromise; test broad/nested picker scopes, forgotten spaces, path replacement, symlinks and hardlinks. Evaluate handle-relative operations and revocation before accepting residual risk. |
| A05 | Medium/high integrity | export_file.rs uses single-use destination tickets (good) but documents direct truncating writes because a Save panel grants the file, not its parent. Interrupted replacement can damage the explicitly selected destination. | Verify source/destination alias handling and failure UX, test interrupted overwrite of disposable exports. Assess sandbox-compatible staged writes or clearly report the limitation. Do not regress note atomic saves. |
| A06 | Medium | recovery_store.rs bounds record size, validates path components, refuses symlink vault-key directories and uses exclusive temporary files, sync and rename. Need to review actual write/cleanup failure semantics and JS recovery orchestration. | Test interrupted recovery writes, conflicting saves, temp replay, storage failures and directory durability. Review cache and bookmark persistence separately. |
| A07 | Low | atomic_replace.rs header says the module is unwired; lib.rs actually declares it under macOS atomic-writes, and published bundle verifies the native symbols. | Update obsolete comment after verifying full call chain. |
| A08 | Medium | apps/app/package.json on audit branch shows 0.0.1 although the locally prepared and published version is 0.0.10. Legacy release scripts coexist with current direct/store paths. | Reconcile source version and lockfiles during consolidation; inventory old command usage and remove only truly obsolete paths. |
| A09 | Medium | workers/unsplash-proxy/src/index.ts restricts upstream host/routes, constructs authorization headers itself, refuses redirects and sanitizes responses. Rate limit binding is optional in the code, and CORS is not client authentication. | Verify deployed binding and quota strategy, logging/observability, IP handling and actual privacy statements. User-facing Unsplash functionality passed, not a quota/abuse test. |
| A10 | Medium | tauri.conf.json production script-src self, object-src none, base-uri self; img-src permits arbitrary HTTPS and data/blob, inline styles allowed. | Trace all untrusted content rendering and remote image behavior, ensure remote content cannot invoke local IPC, verify privacy disclosure and intentionally supported external images. |

Positive evidence: production capabilities do not include the generic fs plugin write/truncate/delete grants; native vault removal distinguishes symlinks from targets and protects registered Space roots. Security-scoped bookmarks and separate rename-parent OS access are implemented in space_access.rs. Atomic writer documentation specifies same-directory staging, explicit write intent, full sync requests and in-process per-path locking; production bundle symbols and normal save behavior verified. Full implementation and error paths still require audit. Unsplash proxy does not forward incoming cookies or authorization, and refuses upstream redirects. Production CSP is substantially narrower than dev CSP.

## Remaining release-specific review

Retain the outstanding items in the Sparkle ODR: separate key backup/recovery, SDK provenance, feed authentication and migration, single-publisher race/CAS, native restart/save races, termination retry, ordinary quit, offline and failed signature cases, Developer ID and App Store signing/channel migrations. Terminal bootstrap trusts HTTPS for script/feed/checksum; does not independently verify Ed25519. Production developer team pin and installer verification are pending. Test-only fallback fixtures are never release artifacts.

## Required local evidence (not yet collected in this pass)

- Tracked source inventory and local git status/commit.
- Production and development npm advisory reports; Rust locked dependency audit (cargo-audit if already installed). Do not automatically upgrade or apply audit fix.
- Full current regression results and native test results, after changes are consolidated; previous 18,425-test pass is historical evidence.
- Packaged runtime profiling and measurements on a representative Space, not private note contents.
- Intel tests deferred; record the OS and hardware when performed.

## Sign-off rule

Keep each finding open until supported by a test or an explicit documented risk decision. Do not merge, publish a new release, or request Apple credentials on the basis of this initial inspection alone.

## Local verification pass · 2026-11-24

The audit used the remote release-branch tip `75bd403f` plus the five pre-existing local changes from the `0b0f7f15` checkout. The two intervening commits changed only documentation. The snapshot contained 2,798 tracked files, with the 0.0.10 manifest versions and updated npm/Cargo locks from the local checkout. The committed release branch still declares 0.0.1 and carries old lock entries. Consolidation needs to make the tested inputs reproducible from a clean checkout. [Audited revision](https://github.com/vigram-sivakumar/Clutter/commit/75bd403f7c8c322555312ab4f76ad79fad34e712)

Commands ran in a temporary copy on Apple Silicon with macOS 26.6.2, Node 24.11.0, npm 11.6.1 and Rust 1.90. The release and native tests needed a rerun with the host permissions for the Updates Worker test runner's local socket, macOS Trash and transparent file compression. The source checkout and its existing changes were preserved.

### Source findings and release decisions

| Item | Evidence from this pass | Remaining verification or decision |
| --- | --- | --- |
| A01 · Filesystem read scope | The default renderer capability grants list, file reads, exists and stat under `$HOME`. The live callers include vault reads, Space probes, recovery reads from app data and local cover reads. Native mutations authorize against a separate runtime scope. | Measure effective reads with a signed sandboxed build and disposable folders. Preserve app-data reads and expected picker/bookmark paths when narrowing the renderer grant. |
| A02 · Native HTTP scope | The native HTTP capability permits both HTTP and HTTPS across hosts. The two direct callers of `appFetch` are asset import and remote image export. The installed HTTP plugin checks the initial URL and offers opt-in redirect scope checks, which Clutter has not configured. Unsplash search uses browser fetch to the proxy instead. | Decide which destinations should be reachable through asset import and export. Verify the chosen policy for redirects, local networks and supported external image hosts. |
| A03 · Asset protocol scope | The pinned Tauri version's `Scope::is_allowed` already applies explicit deny patterns, so a second `is_forbidden` call would add no check for the same path. The command checks the canonical folder and passes the original path to an independent asset scope. Tauri registers raw and canonical patterns and checks the resolved asset before opening it. | Verify grant semantics and behavior after a folder alias changes. Future filesystem deny subtrees would also need an equivalent restriction in the asset scope. |
| A04 · Authorization lifetime | Native path authorization resolves paths before the operation. Local filesystem changes can occur between those steps. Forgetting a Space drops its stored bookmark while in-process grants can outlive the operation. | Decide when grants must be revoked. Test separately granted, nested and restored Spaces under the packaged sandbox. |
| A05 · Export integrity | The Save panel issues single-use destination tickets. Copy export checks device and inode to avoid copying a file over itself. Both export writes overwrite in place. The volume-full note test verifies the separate atomic note writer. | Validate interruption during an export replacement under the packaged sandbox and choose a strategy compatible with file-only Save panel access. |
| A06 · Recovery durability | Native writes cap and validate records, reject a symlink at the selected key directory, sync the temp file and rename it. The renderer can discover surviving complete temp records. Native removal validates path components and does not perform the same key-directory check as writing. | Align the recovery directory checks and assess same-session write/removal ordering. Directory sync is best effort. |
| A07 · Atomic writer documentation | `atomic_replace.rs` says the module is unwired. The shipping path is registered in `lib.rs` and calls it through `atomic_commands.rs`. | Correct the module header during consolidation. |
| A08 · Release reproducibility | The local 0.0.10 overlay passed version alignment. The committed graph still carries 0.0.1 and stale updater dependency entries. Some legacy npm scripts wrap the current Sparkle builder. The declared toolchain minimums also differ from locked dependencies. The workspace permits Node 18, while jsdom 29.1.1 requires at least Node 20.19 on that branch. The native app declares Rust 1.77.2, while its locked time 0.3.55 requires Rust 1.88. | Review and commit the intended versions and locks together. Align the declared Node and Rust requirements with the tested toolchains and verify callers before retiring old entry points. |
| A09 · Unsplash controls | The checked-in production Worker configuration binds `RATE_LIMITER` at 60 requests per 60 seconds per IP and disables observability and Logpush. The Worker still accepts requests if the binding is missing. The Worker tests and deployment dry run passed. | Confirm the deployed binding and logging configuration, and decide whether a missing binding should deny requests in production. |
| A10 · Renderer and privacy | The production CSP limits script execution and browser fetch origins, while permitting automatic HTTPS image loads. The reviewed Markdown code handles rich paste through conversion and uses bundled SVG for the compact renderer's explicit HTML insertion. The policy explains automatic remote image loads. Its online-features section omits the direct distribution channel's Sparkle checks. | Update the policy to describe direct-channel update traffic and verify the update Worker's deployed logging and retention settings. |
| A11 · Remote image export | After the user chooses a destination, `downloadRemoteImage` reads and writes the response body regardless of HTTP status. An HTTP error document can replace the chosen file and the function still reports success. Export buffers the entire response. Import checks the 50 MiB limit after reading the full body when the response lacks a suitable Content-Length. | Validate status, stream with a byte ceiling and timeout before writing, and cover a successful image, an HTTP error and an oversized response. |
| A12 · Standalone native verifier | `cargo build --locked --manifest-path apps/native-verify/Cargo.toml` fails because the verifier pulls in the atomic writer that uses `objc2_foundation` without declaring that dependency. `cargo test --locked` additionally fails on Tauri test support and the missing app-context helper. | Restore the verifier build and use it with disposable Spaces for real WebView IPC and crash-loop checks. The desktop application's native suite is a separate passing gate. |

The application composition root wires the persistence coordinator and the sync service. The inspected renderer paths route vault mutations through native commands, with a separate user-approved export path. The fallback update and normal quit paths still need packaged fault and restart coverage, including interrupted saves and release publication, wrong signatures and offline behavior. The Sparkle SDK archive still lacks a pinned digest and its bundled signing tools lack a separate provenance check. The Terminal installer verifies an archive checksum from the HTTPS feed and checks code signing, so direct credentialed distribution still depends on its Developer ID verification and signing-identity migration gates.

### Dependency advisories

| Dependency scope | Result |
| --- | --- |
| App npm production | 0 reported |
| App workspace npm including development | 35 affected package entries, including 23 high, 11 moderate and 1 low. The production-only scan reported zero. Flagged areas include WebdriverIO, Vite and Vitest. |
| Updates Worker npm including development | 0 reported |
| Unsplash Worker npm production | 0 reported |
| Unsplash Worker npm including development | 6 affected package entries, including 2 critical, 1 high and 3 moderate. The critical entries are Vitest and its transitive dependency Tinypool. |
| Rust lockfiles | OSV checked 571 distinct public crate-version pairs. It returned 19 affected versions, including maintenance notices, and 27 advisory IDs before deduplication of aliases. Cross-checking the normal dependency graphs for both macOS targets put 12 of the affected versions in the application graph, including 6 versions with security advisories and 6 with maintenance notices. |

Prioritize the native HTTP verification chain before release. The audited build uses `tauri-plugin-http` → `reqwest` → `hyper-rustls`, with `rustls` 0.23.45, `rustls-webpki` 0.103.15 and `webpki-roots` 1.0.9 on both macOS targets. The certificate distrust advisories list 0.103.16 and 1.0.10 as the fixed versions for the latter two branches. Verify feature and call-site applicability for the Rustls, Tokio, URL and cookie advisories during remediation. [OSV query API](https://google.github.io/osv.dev/post-v1-querybatch/) · [Rustls WebPKI advisory](https://rustsec.org/advisories/RUSTSEC-2026-0382.html) · [WebPKI roots advisory](https://rustsec.org/advisories/RUSTSEC-2026-0381.html)

The high and critical development-tooling entries also warrant a separate remediation pass because those packages run during local testing or builds. The audit scanned the locked versions and left the existing dependency versions in place. [Vitest advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp) · [Tinypool advisory](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)

### Verification results

| Check | Result |
| --- | --- |
| Full frontend suite | 18,425 passed across 978 files. |
| Desktop native suite | 284 library tests and 7 command-permission tests passed. The descriptor probe ran through its parent test. |
| Atomic saves on disposable APFS | The volume smoke and volume-full tests passed. An out-of-space write preserved the old note and left no temporary files. |
| Release checks | Shell and Python syntax, 6 bundle-comparison tests, version alignment, Sparkle-enabled frontend build, native permission and updater tests, and 10 Updates Worker tests passed. The Sparkle IPC tests also passed with the native Sparkle feature compiled and linked against the cached 2.10.1 SDK. |
| Workers | Both Workers typechecked and bundled in Wrangler dry runs. The Unsplash Worker passed 116 tests. |
| Existing direct beta 0.0.10 | Bundle validation passed for all 6 universal Mach-O files, the ad-hoc signature, sandbox entitlements, privacy manifest and pinned Sparkle key. The archive, DMG, appcast and delta matched their local checksums. The live feed reported 0.0.10 build 11 with one delta, and its archive hash and size matched the local ZIP. |
| Public privacy policy | Both configured legal links are valid HTTPS URLs. The live privacy policy omits direct update checks. |
| App Store preflight | Passed after rerunning with host permissions for Xcode asset compilation. The ad-hoc bundle passed both-architecture, sandbox, atomic-writer, privacy and icon checks. The bundle excludes Sparkle and the preflight used no Apple distribution credentials. |
| Standalone native verifier | Build and test compilation failed. See A12. |

The repository's Node search benchmark used synthetic Spaces of 1,000 and 10,000 notes. Preparation took 51 ms and 424 ms respectively, with about 7.7 MiB and 76.4 MiB retained. For 10,000 notes, the first unprepared rare-word query took 356 ms total and its longest slice was 21.2 ms against an 8 ms slice budget. The warm median for a two-word query was 78.7 ms. The Sparkle-enabled production frontend's main JavaScript chunk was 3.43 MB minified and 0.92 MB gzip. Startup, memory and input latency in a packaged WebView still need measurement. [Public Sparkle feed](https://updates.clutterapp.workers.dev/appcast.xml) · [Public privacy policy](https://clutter-privacy.pages.dev/privacy/)

### Release gate status

Step 4 remains open for dependency and source remediation, the packaged sandbox checks, and the release failure scenarios above. Use a disposable Space for packaged tests and preserve the earlier Apple Silicon installation and update evidence. Intel runtime verification remains deferred. Apple Developer enrollment remains the final credential-dependent step.
