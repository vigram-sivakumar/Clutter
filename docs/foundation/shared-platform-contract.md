# One shared UI and explicit platform adapters — P-38/P-39

Confirmed by user2026-11-16. Mac ships first; Windows and browser boundaries must
be designed now. Separate native UI implementations for each OS are not desired.
Do not choose two wrappers merely because they are available: a split host needs
a demonstrated benefit that justifies extra maintenance. No such benefit is yet
established. Tauri/Electron remain primary shipping candidates; Swift/WK is a
native comparison baseline, not the intended separate native UI strategy.

## Ownership

| Shared module | Responsibility | Forbidden dependency |
| --- | --- | --- |
| Web UI/design system/editor | Components, CSS, keyboard/selection interaction, accessibility semantics, navigation and view state | AppKit, Tauri/Electron calls, filesystem/SQLite or platform globals |
| Semantic Core | Document/task/property/history invariants, command validation and decisions | DOM or OS/framework APIs |
| Application service/protocol | One accepted write path per Space, ordering, outcomes/recovery and subscriptions | Duplicate semantic owners in a UI/CLI/MCP adapter |
| API clients | Typed commands/results/revisions/capabilities used by UI/CLI/MCP | UI invokes CLI subprocess as its business API |
| Platform ports/composition roots | Implement storage transport/access, OS menus, focus/window lifecycle, file pickers, permissions, clipboard, update/packaging | Reimplement document/task/undo policy |

Share the UI and interaction implementation; permitted platform differences are
small, explicit capabilities/key mappings/styling conventions, not parallel feature
reducers. A browser is another host adapter, not a second product UI. Its sandbox
cannot simply execute the desktop Node/SQLite/process/filesystem implementation.
Choose browser persistence/authority connectivity separately when browser delivery
is scoped; do not add a cloud service now or weaken offline/local save guarantees.
CLI and MCP are Core clients independently of UI/host availability.

## Structure from the first implementation slice

Keep shared UI, semantic Core, API/protocol, runtime/backend adapters and native
composition roots in explicit modules with dependency rules. Preserve existing
foundation-runtime package while identifying platform-only dependencies in its
adapters; no generic rename/cleanup project or placeholder Windows implementation
is required now. Do not scatter process.platform conditionals or native imports
through shared components/domain code. Compose capabilities at host startup.

OS data (paths, bookmarks, handles and grant mechanics) stays behind typed ports;
use stable Space/page/view IDs in shared code. Unsupported capabilities return a
typed unavailable result with honest UI states, never hidden success/fallback or
another writer. Layout and editor interaction remain shared and view-local.

Future Windows work should add its composition/platform implementations, packaging
and platform checks to an already coherent repo, without moving shared modules or
rewriting feature logic. This is an architecture requirement, not a promise that
Windows/Web require zero work: native lifecycle, permissions, paths/case/locking,
clipboard/accessibility behaviour and browser sandbox APIs need actual tests.

## Acceptance gates

- Audit shared import/build graphs for OS/framework/process/SQL dependencies; a
  shared UI browser-target build must not require mocked native globals.
- Run shared feature/editor/command tests once against common modules, plus port
  conformance tests per implementation and focused OS interaction tests.
- Keep browser capabilities explicit in contracts without claiming the desktop
  backend runs unchanged in a browser or that Windows/Web already pass.
- Feature behaviour and command semantics must not diverge by host. OS integration
  can vary through a documented capability; no second Core/task/history policy.
- Default shortlist uses a common desktop host family across Mac/Windows. A proposed
  split shell requires evidence/ADR, explicit additional work and user review of
  that tradeoff. Swift control results cannot override the shared-UI requirement.

Current H01 app artifacts already share one web UI/Core. This confirmed requirement
changes candidate suitability/implementation boundaries; it does not change frozen
H01 metrics, workload recipes, dependency pins or past artifact/evidence hashes.
Greenfield P-37 still removes legacy-user/data migration, not future schema safety.
