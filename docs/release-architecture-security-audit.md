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
