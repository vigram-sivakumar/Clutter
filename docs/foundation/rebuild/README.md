# Clean rebuild plan

The user authorized replacing the whole old implementation, including full AND compact
Markdown, vault/persistence, editor UI, controllers, dependencies, tests and docs.
Keep overall layout intent/useful global components only when they simplify the new
architecture. No migration/compatibility façade, dual writer or permanent parallel app.

| Stage | State | Work |
| --- | --- | --- |
| R0 | Closed51 | Old/main import inventory and concrete clean rebuild decision |
| R1 prerequisites | Closed52 | Exact native manifests/full locks checked in; old experiment cache dependency removed |
| R1 source | Delivered53; Mac verification pending | Actual package split, single React/Tauri product entry, real Core catalogue/create/open/edit/save/reopen flow; coherent old-pipeline removal |
| R2 / roadmap stage3 | UX discussion required before code | Title/full block schema, real component/NodeView adapters, tables/tasks/media and agreed interaction behavior |
| R3 | Pending | Complete navigation/windows/panes/tabs, daily notes/templates/folders, task/property/collection UX, history/search/recovery/interchange |
| Data/release gates | Pending before real data/shipping | Installed storage/final format/security/physical identity/native durability, scale, Windows/web mechanisms and distribution |

[Architecture](../../architecture.md) defines the package responsibilities and one-owner
boundaries. [Development](../../development.md) owns current commands/worktrees.
[Checkpoint](../START-HERE.md) owns the one next action and user observations.
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

Roadmap stage2 /54 adds actual tab-owned split layouts and active-pane note history
before R2/editor work. Current-tab normal navigation and explicit menu actions are
implemented;102 Linux tests pass, Mac54 check pending. Stage3 and every later stage
must begin with UX discussion, one question at a time. No architecture comparison
restart or migration work is part of this.
