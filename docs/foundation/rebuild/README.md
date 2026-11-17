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
| R2 / roadmap stage3 | 3A delivered60; Mac check pending;3B–3E pending | Title/full block schema, real component/NodeView adapters, tables/tasks/media and agreed interaction behavior |
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
