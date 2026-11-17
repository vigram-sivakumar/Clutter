# Stable workspace and view lifecycle review

2026-11-17. Review after55; correction implemented in56 after user authorization.
The findings below describe55. See the implementation outcome at the end.
User: New Page flashes surrounding elements; Open in split still flickers. Address
common architecture instead of per-button/CSS patches. Native55 ordinary navigation
is reported “much better”; no complete no-flicker or lifecycle pass is inferred.

## Confirmed source findings

- WindowWorkspace.busy/navigationBusy and canNavigate/canSelectView feed sidebar,
  toolbar, tabs, note menus and every pane's tools. create() sets busy for its whole
  command/navigation/list chain; commitNavigation() sets navigationBusy for all
  routes, including a new split. style.css button:disabled sets opacity0.45.
  Global disable/enable cycles explain broad control flashing in both operations.
- commitNavigation() calls setTransitionPaused on ALL EditorWorkspaces. Even adding
  a split toggles contenteditable in every existing view. This unnecessarily affects
  editability/caret/focus across unrelated panes. It is not required by Core writes.
- primeNavigation() primes EditorSession/context leases, not an actual PM view.
  Visible navigation is published before NoteView's async mount finishes. A ready
  context is therefore treated as a ready surface, leaving a possible empty first
  frame. The exact contribution to the reported native flicker is not measured.
- NoteView's key includes pageId, while active tab-panel key is tabId. Page changes
  replace the whole pane component; tab changes replace the panel and its views.
  Existing sibling keys survive split addition (already tested), so do not claim
  all old panes remount on every split. Their global disabled/editable state still
  changes. New split width/reflow is expected; blank/opacity flashes are not.
- One useSyncExternalStore at App subscribes to every model notification. The shell
  rerenders for page status as well as navigation. Rerender alone is not DOM loss
  or proof of flicker; broad state-derived presentation and mount lifecycle matter.
- pendingCreate means both in-flight and uncertain retry, so a healthy request
  briefly renders “Retry creation”. Global status also mixes distinct operations.
-55 tests prove old/sibling DOM identity while awaiting metadata, not that no empty
  editor is ever painted. One test even expects the existing view to become read-only
  during split preparation. That expectation must change with the architecture.

## Required ownership and lifecycle

Keep one semantic Core and existing packages. No framework/host/storage rewrite.
Window navigation owns topology and route intent; a UI surface registry owns DOM-view
resources and leases; EditorSession owns retained document/context/history; PM owns
editable DOM. React renders stable containers and never mirrors document bodies.

1. Stable shell, tab hosts and pane hosts. Pane lifetime is keyed by paneId, not
   pageId. Page navigation changes a content-slot binding inside that pane. Existing
   split siblings retain their nodes, selection, scroll and editability. Tab visibility
   changes must not rebuild the visible shell. Retain active/recent prepared surfaces
   under an explicit bounded policy; do not mount every note forever. Eviction releases
   safe surfaces, not pending document contexts or their close/protection obligations.
2. Explicit surface readiness. Resolve destination identity/context, prepare the actual
   PM view, register new recovery identity durably, then reveal. Stage prepared view
   DOM noninteractively in a registry-owned container, with correct owner document
   and destination geometry; transfer/attach without recreating it at reveal. React
   and registry must not both own those children. Native layout/composition behavior
   of staging/attachment must be verified, not assumed from jsdom. New split layout
   appears with ready content in one publication; an existing pane keeps its old
   surface until a replacement is ready. Focus/selection/viewport restoration is
   part of readiness/reveal, not a later window-wide status update.
3. Scoped operations. Track creation by operationId, navigation by pane/request and
   split/tab changes by structural intent. Separate in-flight, uncertain outcome,
   failed/retryable, ready and disposed states. Normal operations do not freeze the
   window, all note menus or sibling editors. Serialize conflicting topology writes
   inside one coordinator without exposing that serialization as a global busy UI.
   Reserve window-wide freeze for real close/shutdown, with appropriate recovery.
4. Latest intent and safe publication. Capture stable destination pane IDs and an
   intent generation. Async completion may reveal/focus only if that intent still
   owns the destination. Rebase queued structural changes on current topology instead
   of publishing an obsolete whole-window clone. Superseded work may still have a
   committed command: retain result/receipt/recovery identity; cancellation never
   deletes an accepted page or silently drops pending content. Same command retry
   reuses its operation ID. Focus moves once for the current action, never later
   from a stale callback that steals it from another pane.
5. Independent metadata pipeline. Keep durable registration of new recovery IDs
   before their views accept editing, serialized monotonic private layout writes,
   and latest-layout close checkpoint. Warm position/history bookkeeping stays off
   the reveal path. Metadata failure is an operation-local failure: existing safe
   panes stay interactive; failed new destination is not exposed editable. Close
   must settle every operation and retained context, including superseded/hidden
   work. Clear separation between pending registration and visible layout; never
   roll back accepted content to make the UI appear successful.
6. Narrow render subscriptions. Shell/tab topology, page index, per-pane route/view,
   per-context save status and operation errors expose scoped snapshots. Stable IDs
   and references prevent unrelated effects from reattaching views. No body copies,
   second page database or second Core. Publish an authoritative new-page summary
   through the page index rather than letting a broad list refresh drive reveal.
   Cosmetic memoization alone cannot substitute for these lifecycle boundaries.

## Consistent operation behavior

| Operation | While preparing | Publication |
| --- | --- | --- |
| Open/Back/Forward | Current content remains; latest pane intent tracked | Replace that pane's ready content only |
| New Page | Existing workspace remains; creation has distinct in-flight state | Accepted new page enters index and ready view opens at intended destination |
| Open in split | Existing panes remain editable and mounted | Add ready pane and resize layout together; focus once if intent still current |
| Switch tab | Retained surfaces preferred; previous visible content stays until ready | Select prepared tab without rebuilding shell |
| Error/retry | Preserve current usable views; local error | Exact command/registration retry, no duplicate page |
| Close | Real window-wide freeze and settling barrier | Close only after metadata and all contexts saved/protected |

No decorative fade, arbitrary delay, hide-disabled CSS trick or global read-only
switch is the solution. Do not promise permanent elimination of every rendering bug;
make these invariants enforceable and check actual native presentation.

## Implementation order and acceptance

This work remains stage2 architecture correction; stage3 UX discussion still precedes
stage3 code. Implement one coherent slice: scoped operation coordinator + stable pane/
surface lifecycle + narrow subscriptions + metadata/close integration. Avoid shipping
another partial New Page-only change. Core/editor semantic ownership and native host
remain intact; expose a small browser view lifecycle adapter only if necessary.

Automated checks must deliberately hold creation, registration, context and view
preparation independently. Verify sibling DOM identity, contenteditable, focus and
scroll remain stable; no empty destination is published; no surrounding disabled/
label/opacity churn; rapid repeated intents and late completions cannot overwrite
newer routes/focus; duplicate-create retry remains exact; same-note split consistency,
metadata failure and close during preparation/supersession remain safe. Test actual
production React/PM/Core/SQLite paths, not only a mocked readiness flag. Update55's
read-only-on-split expectation. Bounded surface eviction must retain protected work.

A browser/native presentation check is separately required: normal note navigation,
New Page, split addition and tab switching, including delayed preparation. Compare
frames/visible behavior; DOM assertions and requestAnimationFrame callbacks alone
are not proof of no blank paint. No revival of the old host-ranking research needed.
Current104 checks passed for55; no implementation tests were run for this design-only
review and none establish that the proposed lifecycle already exists.

## Implementation outcome56

The reviewed lifecycle is implemented: stable shell/tab/pane hosts, scoped subscriptions
and creation state, actual ready PM surface staging/attachment and bounded recent DOM
retention, destination-aware/rebased intents, same-pane supersession and focus guards,
serialized registration/metadata plus all-preparation close settling. Existing panes
remain editable. Surface eviction retains contexts and mapped selection/scroll/history.
No new dependencies, second body store or semantic/native/runtime change.

109 integration/resource tests pass, strict Core/runtime TS and42-source boundaries
pass. Additional production-bundle tests observe PM staging before reveal and stable
shell/pane/PM identity under delayed creation/registration/editor-open. The disabled
mutation assertion allows legitimate Back/Forward history availability changes; it
rejects unrelated shell/tool disable cycles. Native visual/IME/layout/caret/scroll
is still pending; no no-flicker/performance qualification is inferred from jsdom.
