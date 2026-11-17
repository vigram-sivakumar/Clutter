# Clean rebuild plan

The user authorized replacing the whole old implementation, including full AND compact
Markdown, vault/persistence, editor UI, controllers, dependencies, tests and docs.
Keep overall layout intent/useful global components only when they simplify the new
architecture. No migration/compatibility façade, dual writer or permanent parallel app.

| Stage | State | Work |
| --- | --- | --- |
| R0 | Closed51 | Old/main import inventory and concrete clean rebuild decision |
| R1 prerequisites | Closed52 | Exact native manifests/full locks checked in; old experiment cache dependency removed |
| R1 source | Delivered53; later scoped user checks recorded through57 | Actual package split, single React/Tauri product entry, real Core catalogue/create/open/edit/save/reopen flow; coherent old-pipeline removal |
| R2 / roadmap stage3 | 3A/63 Mac PASS;64 lists; formatting/3C–3E pending | Title/full block schema, real component/NodeView adapters, tables/tasks/media and agreed interaction behavior |
| R3 | Pending | Complete navigation/windows/panes/tabs, daily notes/templates/folders, task/property/collection UX, history/search/recovery/interchange |
| Data/release gates | Pending before real data/shipping | Installed storage/final format/security/physical identity/native durability, scale, Windows/web mechanisms and distribution |

[Architecture](../../architecture.md) defines the package responsibilities and one-owner
boundaries. [Development](../../development.md) owns current commands/worktrees.
[Checkpoint](../START-HERE.md) owns the one next action and user observations.
The authoritative current stage3 discussion record is [Stage3 UX](stage3-ux.md).
Documentation58 consolidates the user's final decisions and corrections; application
baseline57 has now been extended by capability60. Toolbar actions and preset-only colours are
confirmed. [Plan59](stage3-implementation-plan.md) defines five working parts;
60 implements3A; verify its Mac checklist before3B. No further required pre-code UX questions.

The application can be temporarily incomplete; do not retain legacy controllers or
another permanent demo to make a missing screen appear finished.

Main reference5c532f8 was inspected read-only. Old layout/page/property hosts imported
legacy Core/CM6/platform code; their visual intent was reference, not reusable domain
ownership. New UI currently reimplements a small sidebar/header/page composition and
button styling; old widgets/controllers are not transplanted. Existing requirements
survive even though old implementation and proof executables were deleted. No additional
host-selection/profiling phase is authorized as a prerequisite to continued product work.

## UX before implementation, starting stage3

The user requests a UX discussion before each stage from stage3 onward, one question
at a time. Record agreed behavior, then implement that stage. Stage2 navigation is
already authorized and continues; this does not reopen the architecture selection.

Roadmap stage2 navigation was delivered through57: tab-owned split layouts,
current-pane Back/Forward, explicit new-tab/new-window actions and optional duplicate
splits. User56 reports flicker stopped; user57's scoped navigation/new-window check
passed. Wider native/release qualification remains pending. Documentation58 records
the stage3 UX decisions;59 adds the implementation plan and final colour policy.
59 was documentation only;60 implements title/body. Next is its scoped Mac check,
then3B. No architecture-comparison restart or
migration work is part of this.

61 implements paragraph/H1–H6/separator slash insertion. See
[its outcome/checklist](block-insertion-61.md). Verify one capability before the next.
New Ctrl+A/title-exclusion decisions A01–A05 are queued for3C block selection.

64 adds ordered/unordered lists and L01–L15 key behavior. Read
[list outcome/checklist](lists-64.md). Mac checks next; formatting follows only
once this capability passes. Both63 separator cases are user PASS; keep its rule.

65 corrects text insertion through per-type policy and one shared executor. Read
[insertion architecture/outcome](insertion-policy-65.md). Verify this before resuming
list Mac checks and the later formatting capability. Separator63 is unchanged.

Current66: [text controls](text-controls-66.md) supersedes filled insert-below65 and
list-only Tab scope64. All body text shares indentation; text types convert in place.
After Mac editor/C01 check, dedicated Mac CLI/MCP acceptance precedes formatting.

Current67 [object selection](object-selection-67.md) supersedes separator63. Verify
Mac selection/Enter/delete/caret behavior, then dedicated real Mac CLI/MCP acceptance
before formatting. Text conversion/indentation66 remains current.

User67 requested separator insert/select/Enter/type check PASS. Current68 is
[real client acceptance](client-acceptance-68.md), verification-only, before formatting.
Keep current67 app/session; no rebuild/install. Native observations remain pending.

## Deferred AI desktop app integration

User requested17 November2026: add active-app/active-note AI integration to the later
roadmap; do not implement it during current formatting work. Desired future scope:
authorized AI desktop clients can discover Clutter's focused window/pane/note and
selected range, read allowed context and apply changes through the existing Core,
with revision/conflict/history/save protections. Current CLI/MCP saved-note access
is implemented/tested; active-view discovery/selection, OS accessibility adapters
and vendor-specific app-picker support are NOT implemented or verified. One shared
integration contract; platform mechanisms remain adapters. No separate semantic
writer, Markdown file bridge or duplicate AI save path. Vendor app-picker inclusion
must be verified with the relevant vendor; do not promise automatic availability.

## Generated remnants after the clean rebuild

Untracked old apps/app/src-tauri/gen/schemas, r07 artifacts/joined-native/out and
worker .wrangler state are generated remnants, not new Structured source. Local
.dev.vars may contain credentials; preserve locally and never commit. Targeted
.gitignore rules hide these exact generated/secret paths; do not ignore all apps/app,
workers or experiments as a way to conceal accidental source reintroduction. No
local artifacts were deleted. Include this housekeeping in the next source delivery.

69 delivers [body formatting](formatting-69.md) after actual Mac client milestone68
PASS. Shared toolbar/shortcut executor, accepted preset/mark validation, same Core/
history/save. First scoped native formatting check next; Ctrl+A/marquee3C follows.

70 [toolbar focus correction](toolbar-focus-70.md) follows actual69 Bold PASS and
reported native colour/link dismissal. Shared interaction ownership, no format/schema
change. Scoped native check required before completing formatting and starting3C.

Formatting70 now user Mac COMPLETE including Undo/Redo/save/window reopen.71 begins3C
with [keyboard/body selection](body-selection-71.md). Shared explicit selection model
also owns later marquee/handles; those pointer features remain next, not yet delivered.

71 scoped native select-all check works.72 [caret re-entry correction](caret-restore-72.md)
preserves no-caret bulk deletion and fixes first click/selection guard timing. Native
blink retest next; pointer marquee/handles/reorder remain pending on same model.
