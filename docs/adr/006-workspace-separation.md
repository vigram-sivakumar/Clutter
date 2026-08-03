# ADR-006: Workspace Kept as a Separate, Non-Persisted Navigation-State Subsystem

**Status:** Accepted

## Context

`Workspace` (active page/folder, open pages, expanded folders) was, in the pre-migration codebase, already a single, well-scoped, dependency-free file — one of the review's confirmed-working findings. Two things were noted as loose ends: `.clutter/workspace.json` is created by `VaultInitializer` on disk but never read or written by anything (dead infrastructure implying an original intent to persist this state), and `Workspace` has no dependency on `Vault` despite navigation obviously referring to vault content (page ids, folder ids) by reference.

This ADR settles two questions: should `Workspace` be merged into `Vault` (since navigation state "belongs to" the vault conceptually), and should the dead `workspace.json` persistence be implemented or removed.

## Decision

`Workspace` remains a fully separate subsystem, parallel to (not layered under or merged with) the Vault stack, holding only transient UI navigation state, entirely in memory, not persisted across restarts. `workspace.json` remains unimplemented for now — it is not deleted as dead code outright, but it is explicitly not built out speculatively either; if/when session-restore-on-reopen becomes an actual product requirement, that's a deliberate, scoped addition (a `WorkspaceSnapshot` serializer reading/writing through `VaultFileSystem`, per the target architecture's extension-points list), not something to half-build now.

## Alternatives Considered

- **Merge `Workspace` into `Vault` as another projection.** Rejected: `Vault` represents persistent product data (what exists), while `Workspace` represents ephemeral session state (what the user is currently looking at). Conflating them would mean every `Vault` rebuild/reconciliation (e.g., an external sync event) has to reason about UI navigation state, which is a layering violation in the other direction — UI concerns leaking into the domain model.
- **Implement `workspace.json` persistence now, since the file already exists on disk.** Rejected: the review specifically flagged half-built, unused infrastructure as a recurring pattern (the `References` component, the `Controls` history buttons, `workspace.json` itself) — building out persistence for a feature with no confirmed product requirement would repeat that pattern rather than fix it. The disk file's continued existence is a decision to make deliberately later, not passively now.
- **Delete `workspace.json` creation entirely as confirmed-dead code.** Considered, and reasonable, but deferred to a product decision rather than bundled into this architectural ADR — whether session-restore-on-reopen is wanted is not an architecture question.

## Consequences

- Navigation state genuinely resets on every app restart until/unless persistence is deliberately built — this is today's actual behavior, so this ADR changes nothing observable, it only makes the "why" explicit and prevents `workspace.json` from quietly becoming a second, unofficial persistence path if someone starts writing to it without a full design pass.
- `Workspace`'s zero-dependency status (ARCHITECTURE_RULES.md rule 7 — dependencies point downward, and `Workspace` depends on nothing) is preserved exactly.

## Why This Approach Is Preferred

It keeps a subsystem the review found to be correctly scoped from being disturbed by either direction of over-correction — neither absorbed into a layer it doesn't belong in, nor expanded to justify a stray file that was never wired up in the first place.

## Amendment (Description milestone, draft-title work): `Workspace.refresh()` as an exceptional, gated notification channel

**Context.** `Workspace.refresh()` has existed since the initial architecture draft — "notifies observers that external state changed and the workspace should be re-evaluated" — but had zero callers anywhere in the codebase. Every other caller of the private `notify()` (`openPage`, `closePage`, `openFolder`, `toggleFolderExpanded`) fires it as a direct consequence of mutating a field `Workspace` itself owns; `refresh()` alone calls `notify()` without touching any Workspace-owned field, so its "external state changed" framing was a documented intention with no validated precedent for what "external" was actually meant to cover.

`PageOperations.updateDraftTitle()` needed a first real answer. A draft (ADR-017) has no `Vault` entry, so nothing else already tracks "this id is the one currently being edited" the way `Vault.notify`/`subscribe` already does for persisted pages (see `updateMetadata`, which needed no new mechanism at all because `Vault` already covers it). For a draft, `Workspace` is the only existing subscribed object that knows which id is active. Without an explicit rule, `refresh()` risked becoming a generic "make the UI update" convenience reached for by any future change that doesn't immediately notify, regardless of whether a real owner (`Vault`, `DocumentSession`) already exists and was simply not wired to — exactly the failure mode ARCHITECTURE_RULES.md rule 5 names: a responsibility moving across a subsystem boundary as a side effect of unrelated work, one small justified-sounding exception at a time.

**Amendment.** `Workspace.refresh()` may be called only when both hold:
1. **No other observable owner.** The changed state has no other subscribable owner reachable from the UI. Persisted-page state must notify through `Vault`; editor content must notify through `DocumentSession`. `refresh()` is never a substitute for wiring to a real owner that already exists.
2. **About a target Workspace already tracks.** The change concerns a target `Workspace` itself is already tracking — the active page/folder, or another page currently open in the workspace (`openPageIds`) — not a domain event unrelated to what `Workspace` tracks. (Deliberately not narrowed to only the *active* target, so a future multi-tab/multi-panel feature — already named in this ADR's own Decision as "future tab and panel state" — isn't incorrectly blocked from reflecting a change to an open-but-inactive page.)

Both conditions are required; a call site failing either one must notify through the real owner instead. The one call site accepted under this amendment: `PageOperations.updateDraftTitle()` — a draft has no `Vault` entry (condition 1), and it is by definition the workspace's active target while being edited (condition 2).

**Alternatives considered:** a UI-layer workaround (forced re-render, local dummy state, remount) — rejected, couples "something changed" to one component instance rather than the domain object responsible for it; giving `DraftDescriptor` its own subscribe/notify mechanism — rejected as unnecessary machinery when `Workspace` already provides this exact signal for every other draft/navigation event and `PageOperations` already holds a `Workspace` reference; leaving draft title changes unobservable until an unrelated re-render occurs — considered as the honest fallback if no clean answer existed, not needed since one did.

**Consequences.** `docs/architecture-specification.md` §10 is amended to add `refresh()` to Workspace's documented public API (closing a pre-existing spec/implementation gap) and to state this two-part gate in the Ownership subsection. Any future PR calling `workspace.refresh()` must show, in review, which owner was ruled out under condition 1 and why the change is in-scope under condition 2. `Workspace`'s zero-dependency status and scope ("owns navigation state, not knowledge") are unchanged — this constrains one existing method's usage, it does not expand what `Workspace` stores or computes.
