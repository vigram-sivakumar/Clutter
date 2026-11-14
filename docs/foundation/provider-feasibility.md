# Provider feasibility record

Revision 0.8, 2026-11-14. Official documentation review only. No account,
credential, signing configuration, native provider adapter or remote transfer was
tested. Facilities below establish candidate routes, not product support.
Protocol policy belongs to [provider sync](provider-sync-spec.md).

## Candidate routes

| Route                                    | Documented facility                                                                                                                     | Proposed use and remaining proof                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iCloud Documents, native macOS container | Apple distinguishes file containers from CloudKit structured storage; services require application configuration and entitlements [A1]. | Candidate immutable-package transport. Qualify signing, account changes, coordination, offline files, upload evidence and recovery on real Macs.                                                        |
| User-selected iCloud folder              | Native file UI can download ubiquitous contents [A4].                                                                                   | Separate candidate, not equivalent to an app container. Qualify sandbox grants, placeholders and folder lifecycle.                                                                                      |
| iCloud on Windows                        | Apple's client supports downloading and keeping files downloaded [A3].                                                                  | This does not establish visibility of Clutter's app container or portability of Apple's macOS APIs. Verify the exact route before promising Windows support.                                            |
| Google Drive API, desktop client         | Installed-app OAuth supports a system-browser flow, PKCE and desktop loopback redirects [G1].                                           | Candidate without a Clutter backend; still needs API project/client/consent configuration, secure local tokens and account/revocation tests. Desktop binaries cannot keep a client secret confidential. |
| Drive regular folder                     | Per-file access through `drive.file` is a documented scope [G2].                                                                        | Prefer least access; prove folder selection, discovery and access to required package files. Do not assume a folder grant covers every descendant or collaborator-created file.                         |
| Drive appDataFolder                      | Application data is isolated and cannot be shared as ordinary files/folders [G3].                                                       | Possible same-account transport, not a replacement for user-shared folders. Route remains open in SY-07.                                                                                                |
| Provider desktop-client mounted folder   | Files may be staged through a local client.                                                                                             | Separate candidate requiring installation and lifecycle qualification. A local write alone is not a remote-upload acknowledgement.                                                                      |

CloudKit is a distinct integration, not silently substituted for iCloud Documents.
The proposal does not require operating our own server; provider configuration,
platform entitlements and user authorization remain necessary.

## Discovery and transfer constraints

Drive change tracking represents current file state, not an audit log containing
every intermediate edit [G4]. Therefore the proposed protocol publishes uniquely
identified immutable states and treats provider cursors as discovery progress.
Drive push notifications require an HTTPS receiving endpoint [G5]. For the initial
server-free candidate, poll on startup/resume/manual request and while a capable
process runs; cadence/backoff/resource budgets remain SY-08/R06. Drive supports
resumable uploads [G6]; restart and uncertain completion still need idempotent
publication and actual-provider tests.

Apple exposes upload status and recommends asynchronous metadata/file-presenter
observation rather than polling upload status inside a coordinated read [A2].
Qualify what status proves remotely, deferred download, interrupted coordination
and stale observations. A generic filesystem watcher is not sufficient evidence.

An OS client may finish transferring already staged data after Clutter exits.
Clutter validation and reconciliation require a running capable process. No
always-running helper or live collaboration service is selected here.

## Enablement evidence still required

For each exact route, record OS/client/API versions, configured scopes/entitlements,
account/folder mode, provider evidence available, resource limits, observations and
reproducible logs. Exercise two independent local stores, offline/rejoin, duplicate/
reordered delivery, lost acknowledgement, placeholder/media failures, quota/backoff,
token revocation, permissions and account switching. Redact credentials and bodies.

Simulated SC cases prove protocol properties only after execution; they do not prove
native integration. SY-04 cross-document ownership reconciliation must be selected
and demonstrated before any route is enabled. If one provider is blocked, local-only
operation remains valid; do not call either provider supported by association.
Folder access is not page-level authorization or end-to-end encryption.

## Official sources reviewed

- [A1: Apple — Configuring iCloud services](https://developer.apple.com/documentation/xcode/configuring-icloud-services)
- [A2: Apple — ubiquitousItemIsUploadedKey](https://developer.apple.com/documentation/foundation/urlresourcekey/ubiquitousitemisuploadedkey)
- [A3: Apple — Keep files downloaded in iCloud for Windows](https://support.apple.com/guide/icloud-windows/keep-files-downloaded-icw8531ad6b7/icloud)
- [A4: Apple — NSOpenPanel.canDownloadUbiquitousContents](https://developer.apple.com/documentation/appkit/nsopenpanel/candownloadubiquitouscontents)
- [G1: Google — OAuth for native apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [G2: Google — Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [G3: Google — Application data](https://developers.google.com/workspace/drive/api/guides/appdata)
- [G4: Google — Track changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [G5: Google — Push notifications](https://developers.google.com/workspace/drive/api/guides/push)
- [G6: Google — Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads)

Research date is provenance, not a guarantee these services remain unchanged.
Recheck official requirements when configuring the actual qualification clients.
