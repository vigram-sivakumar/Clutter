# ADR-020: `Workspace.refresh()` as an Exceptional, Gated Notification Channel

**Status:** Accepted

## Context

`Workspace.refresh()` has existed since the initial architecture draft as a public method — "notifies observers that external state changed and the workspace should be re-evaluated" — but until this ADR it had zero callers anywhere in the codebase. Its every existing sibling call to the private `notify()` (`openPage`, `closePage`, `openFolder`, `toggleFolderExpanded`) fires as a direct consequence of mutating a field `Workspace` itself declares and owns (`_activePageId`, `openPageIds`, `_activeFolderId`, `expandedFolderIds`). `refresh()` alone calls `notify()` without touching any Workspace-owned field, so its "external state changed" framing was a documented intention with no validated precedent for what "external" was actually meant to cover.

The Description milestone's draft-title work (`PageOperations.updateDraftTitle()`) needed a first real answer. A draft (ADR-017) has no `Vault` entry — nothing else in the architecture already tracks "this specific id is the one currently being edited." `Vault` already provides this role for persisted pages (`useActivePage` subscribes to `Vault` directly, not `Workspace` — see `PagePersistenceCoordinator`/`updateMetadata`'s reactivity, which needed no new mechanism at all because `Vault.notify`/`subscribe` already covers it). For a draft, `Workspace` is the only existing subscribed object that knows which id is the one currently being shown.

Without an explicit rule, `refresh()` risked becoming a generic "make the UI update" convenience — reached for by any future change that doesn't immediately notify, regardless of whether a real owner (`Vault` for persisted data, `DocumentSession` for editor content) already exists and was simply not wired to. That is precisely the failure mode ARCHITECTURE_RULES.md rule 5 names: a responsibility moving across a subsystem boundary as a side effect of unrelated work, one small justified-sounding exception at a time, rather than a deliberate decision.

## Decision

`Workspace.refresh()` may be called only when both of the following hold:

1. **No other observable owner.** The changed state has no other subscribable owner reachable from the UI. Persisted-page state must notify through `Vault` (`Vault.notify`/`subscribe`); editor content must notify through `DocumentSession`. `Workspace.refresh()` is never a substitute for wiring to a real owner that already exists.
2. **About a target Workspace already tracks.** The change concerns a target `Workspace` itself is already tracking — the active page/folder, or another page currently open in the workspace (`openPageIds`) — not a domain event unrelated to what `Workspace` tracks. (Phrased this way, not narrowed to only the *active* target, so a future multi-tab/multi-panel feature — already named as in-scope by `Workspace`'s own "Own future tab and panel state" responsibility — isn't incorrectly blocked from reflecting a change to an open-but-inactive page.)

Both conditions are required. A call site failing either one must notify through the real owner instead, never through `Workspace.refresh()` as a convenience.

The one call site accepted under this rule today: `PageOperations.updateDraftTitle()`. A draft has no `Vault` entry (condition 1 — no other owner exists), and it is by definition the workspace's currently active target at the moment it's being edited (condition 2).

## Alternatives Considered

- **UI-layer workaround (forced re-render, local dummy state, remount).** Rejected outright — couples "something changed" to one specific component instance rather than to the domain object responsible for it, and was explicitly ruled out during design review as exactly the kind of implementation detail masquerading as a fix that this project's process exists to catch.
- **Give `DraftDescriptor`/the `drafts` map its own subscribe/notify mechanism.** Considered. Rejected for this milestone as unnecessary machinery: `Workspace` already provides the exact "something about the currently-shown target changed, re-evaluate" signal for every other draft/navigation event, and `PageOperations` already holds a `Workspace` reference. Introducing a second, parallel observer mechanism for one field would be new speculative machinery (implementation-rules.md rule 13) when an existing, designed-for-this-exact-shape one is available and just unused.
- **Leave draft title changes unobservable until an unrelated re-render occurs.** Considered as the honest fallback if no clean answer existed. Not adopted, because one did exist — `refresh()` was already in the codebase for precisely this situation, just never exercised.
- **Document the rule only as a code comment at the call site.** Rejected — a comment is invisible to anyone not reading that exact file, and would let this narrow exception quietly become an unreviewable precedent for the next similar-sounding case. This ADR plus the `architecture-specification.md` amendment make it a reviewable design rule instead.

## Consequences

- `docs/architecture-specification.md` §10 (Workspace) is amended: `refresh()` is added to the documented public API (closing a pre-existing spec/implementation gap — the method existed in code but was never in the frozen contract), and the Ownership subsection states the two-part gate.
- Any future PR calling `workspace.refresh()` must show, in review, which owner was ruled out under condition 1 and why the change is in-scope for `Workspace` under condition 2 — per `implementation-rules.md`'s divergence-reporting spirit, silence is not an acceptable substitute for stating the reasoning.
- `Workspace`'s zero-dependency status and its scope ("owns navigation state, not knowledge," ADR-006) are unchanged — this ADR constrains one existing method's usage, it does not expand what `Workspace` stores or computes.

## Why This Approach Is Preferred

It gives `updateDraftTitle()` a real, architecture-sanctioned notification path without inventing new machinery, without a UI-layer workaround, and without quietly widening what `Workspace` is allowed to represent. The two-part test is falsifiable — any future call site can be checked against it in review — rather than relying on "it worked for title, so it's fine here too" as an unstated precedent.
