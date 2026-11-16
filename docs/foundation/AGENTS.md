# Clutter foundation continuation instructions

Read [START-HERE](START-HERE.md) first. It owns the single current checkpoint,
confirmed user state and next action. This file owns evergreen working rules.
[Product contracts](product-contracts.md) own confirmed behaviour; [changelog](CHANGELOG.md)
and [native progress history](NATIVE-TEST-PROGRESS.md) retain dated execution history.
Historical next-action wording never overrides START-HERE. Read relevant source,
contract and scoped evidence before changing or replaying an experiment.

## Scope and repository safety

- Stay on architecture/clutter-foundation. Inspect Git state and preserve user work.
  Do not reset/clean, pull unrelated main changes, merge to main, commit or push
  merely because a plan describes future work. User applies/commits delivered patches.
- Existing production rules still govern production. Foundation proposals do not
  supersede them implicitly. Current45 work is scoped to docs/foundation; production
  code/real vaults/old sessions remain outside this task. Broader changes need actual
  task authorization, not an inferred roadmap instruction.
- User permits replacing100% of old implementation. It is Markdown-oriented evidence,
  not a target constraint. No existing users/data need migration (P37): no legacy
  converter/compatibility facade/dual-write/cutover project. Initial schema safety,
  future version envelopes, recovery/history and portability remain required.
- One shared web UI/editor across Mac/Windows/future browser, small platform ports
  and composition roots (P38/P39). No OS/framework dependencies in shared product
  logic, duplicate native feature UI or split wrappers without demonstrated benefit.
- One Core/Space semantic authority and command API; UI/CLI/MCP are peer adapters.
  No UI-to-CLI business subprocess or separate mutation/undo/task/persistence policy.
  Task is an independent full page, with the product's body/properties/cover/media
  scope even when a proof schema renders only paragraphs. Product contracts own detail.
- Integration connection once/user-device across current/future local Spaces by
  default; optional restrictions, no per-Space codes/prompts (P36). Internal tickets
  do not create another user-facing enrollment or semantic owner.

## Product/editor and evidence discipline

- table-interaction-contract.md owns agreed behaviour: Enter down same column and
  stop at bottom; Shift+Enter in-cell break; Tab/Shift+Tab arrive at text end and final
  Tab stays; handles add axes preserving active cell/caret/focus. Escape retains
  selected cell without caret; selected-mode Tab moves highlight, Enter edits.
  Triple-click selects cell text. Do not restore withdrawn auto-growth/selection defaults.
- Documents and views have separate lifetimes. Closing a view protects dirty work;
  cursor/selection/layout are view-local, accepted state/revisions have one owner.
- Preserve confirmed manual passes even with absent/duplicate verdict clicks.
  Do not require replay for bookkeeping. Guide only a necessary native variation,
  one concrete step at a time. IME/VoiceOver and Windows claims stay within recorded
  limits; user deferred prioritizing VoiceOver. Never invent a native pass.
- Distinguish confirmed policy, proposed mechanism, Linux helper/proof tests, user
  observations and audited raw native artifacts. A build/test count, schema, Ready
  event, timing proxy or readable trace alone cannot establish H01 measurement.
- H01/workloads/budgets and prior evidence stay hash-stable during comparison.
  No missing metric as zero, JS heap/RSS/RAF substitute, nearest-frame causal guess,
  private API/permission workaround, or post-result threshold change to force a winner.
- Blocked methods have finite stopping rules.43 CLI recording is retired after
  matched failures. Use the current saved-pilot analysis action; missing links need
  exact H11 disposition and scoped observable, not more generic capture/export loops.
- Existing F009 acceptance is for disposable I1 only. F006/F007/F008 and production
  format/authority/host acceptance remain as recorded. Freeze-readiness review does
  not silently accept ADRs, waive gates or move mandatory selection tests to release.

## Delivery and continuation

- Update START-HERE, progress history, CHANGELOG and new scoped evidence for meaningful
  changes/results. Keep current next action in START-HERE; link it elsewhere instead
  of copying checkpoints. Preserve old raw evidence/failing attempts.45 also retains
  pre-consolidation instruction/index copies in its evidence directory.
- Native apps/runtime/cache/traces/reports live in Git metadata/private marked
  fixtures, never staged. Deliberate scoped evidence is separate. No blanket git add.
  Never ask for endpoint/token/private boot files or blind raw-trace uploads.
- Run relevant checks, retain failures/blocked states, and report platform/scope.
  Export/raw XML remains private; shareable summaries omit process names/content.
- Deliver incremental patch ZIP against exact latest delivered tree; validate apply
  and scope. No automatic commit/push. Download filenames in Bash use SPACES in
  quoted paths under '/Users/sivakuv3/Downloads/Arc browser/'. Use direct ZIP links.
- A new chat may lack conversation or scratch state. Provide access to latest repo
  branch/local commits, read this file + START-HERE, inspect actual Git/native result
  state and continue the current action. Source present does not mean Mac step ran.
