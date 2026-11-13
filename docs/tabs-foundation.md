# Foundation before tabs

This is post-migration feature preparation using the existing Application, Workspace,
NavigationRouter, DocumentRegistry and RecoveryJournal. It does not expose multiple
windows or add a tab/pane subsystem ahead of its first consumer.

## Ownership and implementation order

| State/capability | Owner and next-step constraint |
| --- | --- |
| Notes, folders, assets, effective labels and mutations | Existing Application services. Tabs read EffectivePageState and call the existing operations; no copies of Vault or another save path. |
| Live note revisions, dirty work, save/conflict handling | Existing DocumentRegistry/DocumentSession per Application. Closing a tab must not discard dirty work or create another session for the same note. |
| Active route, back/forward | Workspace owns navigation. The tabs change must make history belong to the tab, and route commands through the active tab. Do not construct an Application for each tab. |
| Inactive editor undo/redo, selection and scroll | Session-only cache, now scoped by Application and page ID. Cache restoration maps external changes and clears unsafe overlapping history. Both PageHost editor paths and permanent-deletion cleanup use the same Application scope. |
| Future simultaneous panes of the same note | Share the DocumentSession. Define view identity and history/selection ownership before rendering a second live editor: the current cache is for one mounted root editor and is not a simultaneous-view registry. |
| Recovery snapshots | Existing RecoveryJournal and one native recovery writer. Registry membership never authorizes deleting recovery records. |
| Future native windows | Separate Application/Workspace/navigation/editor state per window. Native liveness, watcher/menu/permission routing and ADR-073 coordination gates remain required. |

Implement tabs first with one visible editor, then split views with explicit view identity,
then native windows after their native coordination gates pass. Tab construction must
not depend on the throwaway coordination store. The single-editor cache is not a
substitute for tab navigation state, and the current Workspace has not yet been converted
to tab-local histories.

## Recovery safeguards in this checkpoint

- `protectAll()` verifies the latest unsaved states again after awaited writes. An
  older successful write cannot acknowledge an edit or new dirty note that arrived
  while storage was pending. Callers must retain live work when it returns false.
- New version-1 records include optional `schema`, `spaceId`, `lastPath` and Space
  `name` hints. Existing records are not rewritten. Malformed optional hints do not
  hide valid recoverable content; hints are never filesystem authority.
- Native `recovery_list()` inventories legacy/new, temporary, malformed and orphaned
  record files without consulting the Space registry. TauriRecoveryStorage.listAll()
  exposes this read-only capability. RecoveryJournal still validates actual content;
  this checkpoint does not add an orphan-recovery UI.
- Filesystem writing/removal moved from recovery_store.rs into recovery_files.rs so
  production commands and the portable tests exercise the same implementation.
  Writes sync the temporary file, rename, then confirm the key directory, recovery
  root and its parent. A post-rename directory-sync failure rejects protection even
  if the complete new record is readable. This is not a simulated power-loss proof
  or a claim that plain fsync provides macOS F_FULLFSYNC guarantees.
- Journal discovery accepts an injected `isSessionLive(session)` lookup: live peers
  are not offered/settled, and lookup failures leave their files untouched. This is
  tested in the real journal but is intentionally not bound to a fictional native
  registry. Default single-window discovery retains existing behavior. Native window
  identity registration, collision-driven session rotation and liveness lookup must
  be connected together before a second production window is enabled.

## Validation and remaining gates

The uploaded macOS evidence already establishes the implemented E1/E5 stress subset
and the corrected E2 500-kill subset (500/500, confirmed revision 3032). Those long
runs need not be repeated for cache scoping or recovery metadata. They do not
establish completed Phase 0.

The recovery component tests cover old records, optional metadata, live-peer exclusion,
failed liveness lookup, dirty-state changes during protection, native replacement
failures, orphan inventory and symlink exclusions. Real editor remounts verify that
identical copied note IDs/text in another Application cannot reuse undo history,
and that the originating Application still restores its history. Deletion cleanup
is scoped too.

Before native windows, ADR-073 still requires the provisioning ledger and late-write
fences, full conflict matrix, frontend notification/backstop integration, native
liveness binding, destination claims and unflushable transition retry. In particular,
Application.handleRootLost currently starts recovery flush without awaiting protection;
this checkpoint does not claim to fix the full root-loss transition. Development,
packaged and sandboxed WKWebView acceptance remains outstanding.

Before shipping tabs, add tests for independent tab back/forward, switching with dirty
notes, close/reopen and active-tab fallback, deletion/archive/rename in inactive tabs,
per-note undo restoration, and tab restoration after restart. Reuse current missing-root,
recovery, save-failure and external-edit regressions. No tab UI is wired by this patch.

### Checkpoint verification (2026-11-13)

- Relevant Vitest regressions: **437 passed across 18 files** (editor/remount/mapping,
  PageHost archived controls, recovery, missing/lost root, Workspace and navigation).
- `npx tsc --noEmit -p apps/app/tsconfig.json`: **passed**.
- Portable Rust library tests: **31 passed**, including **13 production recovery IO
  tests**; the other 18 cover the existing coordination/crash validation helpers.
- Spike `cargo check --locked --all-targets` for `aarch64-apple-darwin` and
  `x86_64-apple-darwin`: **passed**, including production recovery_files.rs.
- Full Tauri application checking could not run here: the offline dependency cache
  lacks `glob`. The spike does not type-check the Tauri command wrappers. No actual
  macOS/WKWebView runtime test was performed in this Linux environment.

On macOS, validate the command wrapper and recovery IO without repeating long stress runs:

```bash
cargo check --locked --manifest-path apps/app/src-tauri/Cargo.toml
cargo test --locked --manifest-path spikes/adr-073-phase0/Cargo.toml --lib recovery_files::tests::
```

Then check ordinary typing/undo, switching notes and Spaces, and normal recovery after
restart. The native directory-sync change needs runtime acceptance on the target macOS
filesystem; readable records after a rejected durability confirmation are retained.
