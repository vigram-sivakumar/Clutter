# Local API and untrusted input — R06

Revision0.58, 2026-11-16. P-36 access UX is confirmed; production transport/authentication
remains a proposal. I1 fixtures have private local transport handles, not installed
production enrollment/peer authentication. Original R06 mechanisms remain gated.
R03 remains the authority for command semantics; this document owns local transport
security rather than changing future page-sharing roles.

## Boundary and trust

Protect against accidental cross-Space/cross-account writes, unauthorized local
clients, compromised/untrusted web content, malformed clipboard/import/provider
payloads, stale sessions and leakage in diagnostics. Local IPC is not safe merely
because it listens on loopback. The initial design is not a sandbox against an
attacker with arbitrary execution as the same user, full disk access or admin control.
Provider-folder access does not imply page-level roles or end-to-end encryption.

Proposal: private OS-local endpoint (Unix-domain socket on macOS, separately
qualified named-pipe/other Windows adapter), with OS permissions and peer checks
where available. Bootstrap through a protected per-user registry and narrowly
scoped client grants. Qualify socket substitution, ownership/ACLs, aliases and stale
endpoints. A PID, claimed client name, Origin, path or client-supplied actor ID is
not sufficient authentication. Exact handshake and secure bootstrap remain SEC-01.
No generic TCP/HTTP service is required by this proposal.

If a future HTTP binding is selected, qualify origin checks, loopback-only binding,
authentication, CSRF/DNS-rebinding handling and resource limits separately. Never
silently expose a listener to the LAN to make headless use work.

## Capabilities and enforcement

| Capability                 | Scope / checks                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Read/query                 | Explicit allowed Space/entity scope, projection/history visibility and bounded pages                    |
| Content mutation           | Explicit targets, typed command validation, current revision guard and allowed command family           |
| Import/export/media        | Authorized input/output handles, containment and bounded streaming; no arbitrary path from note content |
| History restore/pin/delete | Same domain authorization and guards as desktop; no public maintenance bypass                           |
| Provider administration    | Separate configuration/grant boundary; no account switch through ordinary note creation                 |
| Internal reconciliation/GC | Host-only capability unavailable to ordinary public CLI/MCP/UI payloads                                 |

Authenticate connection and derive principal/grant server-side. Context/origin IDs
are bound to that session; a caller cannot impersonate another editing context to
undo its work. Validate authorization on every admission, receipt lookup and stream
subscription; revoke sessions/subscriptions and refuse newly admitted writes after
revocation. An already committed write remains in history; revocation/cancellation
is not retroactive rollback. Define/qualify the atomic admission-to-commit boundary
for a concurrent revoke, rather than promising instantaneous erasure.

## Confirmed integration access UX — P-36, 2026-11-16

No Clutter cloud account/server login is required for this local enrollment.
One connection/authorization per integration on a local user/device grants the
approved command capabilities across all current and future registered local Spaces
by default. The user explicitly rejected separate Space access codes/authorization
friction and confirmed this model. Optional per-Space restrictions live in advanced
settings; no repeated ordinary prompt/code when switching or creating a Space.
This supersedes the earlier proposal that CLI setup must bind one Space.

A client credential identifies the integration/device under that OS user. Server-side
policy expands its default all-Spaces grant or optional restriction and derives the
Space-bound principal/transport ticket internally. Explicit Space ID/destination
checks remain necessary to prevent accidental cross-Space operations, but are not
another user authorization ceremony. New Spaces inherit the default grant without
an extra prompt. Provider administration/irreversible maintenance stay separate
command capabilities; all-Spaces visibility does not bypass semantic write guards.

Revocation/restriction applies to new admissions/subscriptions; already committed
writes remain in history. Keep the existing unknown-outcome/revoke race contract.
The built-in trusted terminal CLI may act as the local OS user without a separate
client-secret setup. An AI running with that same unrestricted shell has the same
OS-user authority; do not promise adversarial integration isolation merely from a
CLI profile. Distinct enforceable integration grants apply where the client identity
is authenticated (such as its MCP connection). This is the existing same-user threat
boundary, not a new per-Space setup requirement.

Exact credential storage, IPC identity, expiry/noninteractive reauthorization and
server-side grant derivation remain SEC-02/03/04 implementation/qualification work.
No bearer secrets in arguments/logs/provider packages. Fixtures' per-Space private
UI tokens are internal qualification transport handles; they neither require user
codes nor demonstrate this full production enrollment model. Do not claim P-36
implemented from a successful fixture startup. Authorization precedes receipt lookup.

## Framing, paths and content

Decode only bounded frames, nesting, counts and strings; stream attachments through
staged handles rather than inline base64 bodies. Reject unsupported protocol/schema
before mutating content. Apply rate limits/backpressure fairly: a CLI flood cannot
starve typing or permanently block a recovery request. A timeout/cancel after
admission returns an honest pending/uncertain outcome. Do not reuse operation IDs
for changed payloads; receipts remain subject to authorization.

Keep filesystem identity and display names separate. Resolve input/output containment
using OS-safe handles/appropriate no-follow semantics, not string prefix matching.
Test symlink/reparse-point substitution and TOCTOU, including final write destinations.
External file imports require explicit authorized handles. In-document paths/URLs
cannot invoke arbitrary file read/write, shell execution or provider configuration.
Allowlisted link opening is mediated by the shell; reject executable/unsafe schemes.

Sanitize/validate pasted HTML and imported structured payloads before engine decoding.
No script execution from notes, media metadata, embeds, Markdown HTML or PDF previews.
An embedded original remains read-only in its source view. Remote image loads and
link-preview fetches must follow explicit network/privacy policy; no incidental
provider/content decoder fetch may leak local text or credentials. SEC-03 requires a
concrete renderer/CSP/PDF isolation and resource-access policy before release.

## Desktop, CLI and MCP adapters

A desktop webview receives only necessary shell/shared-API capabilities. If Tauri is
chosen, its capabilities constrain exposed frontend IPC, but backend command checks
still need review; multiple capability memberships combine permissions [S2]. This
is a conditional technology note, not a required framework.

CLI structured output keeps result/error/outcome identity machine-readable; progress
and diagnostics do not corrupt JSON stdout. Proposed exit categories distinguish
success, invalid request, denied, stale/conflict, unsupported, unavailable, and
pending/uncertain. Freeze exact numeric codes and envelopes in SEC-04 before public
release; never make uncertain mean definitely failed.

Proposed initial MCP route is a local stdio adapter. The documented 2025-11-25 stdio
binding uses client-launched subprocesses and reserves stdout for MCP messages [S3].
This is a reviewed reference version, not a claim to latest protocol compatibility.
Pin/record the negotiated revision and SDK in the experiment; no remote MCP endpoint
is implied. MCP tool annotations and model instructions do not grant permissions.
Tools translate to shared operations; generated IDs/outcomes/errors have CLI parity.

## Diagnostics and retained secrets

Default logs contain operation/result category, safe IDs and timing, not body text,
clipboard, tokens, absolute private paths or personal account details. A test harness
may record synthetic fixture state/event text with explicit run provenance; never
capture real user typing by default. Crash reports/export bundles are reviewed for
secrets and bound in size/retention. Access loss preserves local work and exposes an
actionable status. No automatic diagnostic upload is selected.

## Decisions and required adversarial evidence

| ID     | Unresolved design                                                   | Required evidence                                                                                              |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Private endpoint/peer/bootstrap authenticity                        | Spoofed descriptor, wrong user, substituted endpoint, replay and stale generation refusal                      |
| SEC-02 | Grant issuance/storage/revocation and app-closed noninteractive use | Narrow scoped grants, forged context, wrong Space, revoked subscription and revoke/admit race                  |
| SEC-03 | Concrete decoders/renderer/CSP/network/media bounds                 | Malicious paste/provider/import corpus, traversal, symlink race, decompression/depth/resource limits           |
| SEC-04 | API framing/version and CLI/MCP outcome contract                    | Invalid/truncated frames, cancellation, flood fairness, stdout purity, unknown outcome and incompatible client |

Numeric proposals are in [budgets](qualification-budgets.json); executable scenarios
are prepared as [HQ cases](host-security-cases.json), all not-run.

## Primary references reviewed 2026-11-14

- [S2: Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [S3: MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The mechanisms above are Clutter proposals. Documentation does not prove the selected
runtime, sandbox, OS or packaged build implements them correctly.
