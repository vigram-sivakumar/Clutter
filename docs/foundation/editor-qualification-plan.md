# Editor qualification and interaction gates — R06

Revision 0.9, 2026-11-14. This prepares experiments; no editor, native key, IME or
accessibility case was executed. The user prioritizes solid keyboard/interactions
and explicitly allows replacing the entire implementation to get the best design.
Current Markdown mechanics, dependencies and migration costs impose no constraint.

## Single authority and comparison

[R02 cases](editor-interaction-cases.json) own the 72 seed expected results and
semantic fixtures; this document owns how to qualify them, not a competing list
of outcomes. [R06 instances](editor-qualification-instances.json) name concrete
initial coverage and additional race/native-input probes. Further combinations
remain required; this is not exhaustive keyboard coverage.

Compare complete proposed integrations, including task/page models, tables, media,
context history and shared operations. A simplified paragraph demo proves only its
scope. Engine state/provisional typing is necessary; a second persistent writable
body, task store or history authority is not. Context selection/history integration
is a selection gate, not polish after choosing the engine.

A clean structured prototype and any eligible source/native alternatives start on
an equal basis. The existing editor is an optional diagnostic control only. PM,
Tiptap, another editor or a native shell can be rejected or replaced entirely.
Compare plain engine versus wrapper only when isolating a fault, not as unequal
feature-complete competitors. Do not require a source editor merely to preserve
investment, and do not award a structured editor points just for using nodes.

## Native input matrix

| Family                 | Required probes                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insertion/deletion     | Immediate replacement, repeated keys, modifier repeat, forward Delete/Fn variants, Unicode grapheme boundaries, dead keys and spellcheck/autocorrect                   |
| Navigation/selection   | Character/word/visual-line/document, Shift extension/contraction, backward ranges, preferred x on wraps, pointer drag/double/triple click, select-all scope            |
| Structure              | Enter/Shift+Enter, Backspace/Delete joins, list indent/outdent, code indentation, task-title/body safety, cross-block replacement and Markdown shortcut reversal       |
| Tables                 | Native cell click followed immediately by typing; cell/range/row/column selections; edge arrows, final-cell Tab, native menus, root undo and paste                     |
| Focus/commands         | Menus/toolbars/dialogs/date picker/find, Escape nesting, tab traversal, window/pane switch while a command or focus restoration is pending                             |
| Clipboard/drop         | Plain/rich/internal structural formats, copy versus move identity, rich sanitizer, cross-note cut failure, native paste-and-match-style, image/PDF imports             |
| Views/history          | Same/overlapping range interleavings, undo of own edits, unsafe inverse refusal, close/reopen, suspended view catch-up, CLI/MCP writes and provider boundary           |
| Native text services   | Japanese/Chinese/Korean composition, candidate selection/cancel, dictation where supported, bidirectional text, emoji picker and input-source switch                   |
| Accessible interaction | VoiceOver and keyboard-only complete paths, named controls, selected/collapsed state, task checkbox semantics, table navigation and finite escape from nested controls |

Record the actual physical chord per OS/layout. Proposed macOS profile uses Command
for app shortcuts; Option-word and Command-line/document movement must be verified
with the exact native runtime. Record Home/End scrolling separately from caret
movement and Fn variants. Do not remap a system convention merely to satisfy a
Linux/browser expectation. Windows gets a separate profile when implemented.

In addition to R02, native spelling replacement must affect the intended range
once and remain undoable; accessibility activation must perform the same command
as pointer activation; native paste-and-match-style strips formatting without
aliasing task identities. Unsupported optional OS text services need an explicit
capability decision; they cannot excuse required IME/accessibility failures.

## Timing and instrumentation

Use deterministic semantic fixtures and pinned viewport/font/zoom. Observe input,
composition, DOM selection/focus, engine selection, view/context, accepted/durable
revision and operation identity. Use synthetic data only. Capture before keydown,
beforeinput/input and composition events where provided, first visual presentation,
then settled state. An immediate follow-up character is the functional oracle:
a correct screenshot after waiting does not prove correct input targeting.

The W3C Input Events draft distinguishes composition input and non-cancelable
composition updates [S1]. This motivates event observation, not an assumption that
all runtimes emit an identical sequence or every input can be intercepted. Record
real native traces and content effects; do not implement commands on keydown alone.

Automation must dispatch through real native keys/clipboard/menu routes for native
acceptance. Transaction/DOM event injection is valuable lower-level evidence but
cannot substitute for IME, VoiceOver, OS clipboard or WKWebView. If automation
cannot drive a text service, record repeatable manual steps, observed artifacts and
reviewer rather than replacing it with fake composition events.

## Explicit exploratory profiles, pending policy review

These are recommended comparison configurations, not approved product defaults.
Each Q item remains open in R02; compare a proposal before asking for a product
choice. Do not count an undecided profile as acceptance pass/failure.

| Policy | Concrete exploratory configuration and example                                                                                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01   | Structured Enter splits `Alpha                                                                                                                                                                                                                                 | beta`into`Alpha`and` beta`; Shift+Enter makes a soft break. Boundary join preserves outside IDs/content. Source profile declares its own newline mechanics.                                                                   |
| Q-02   | Enter in `Send                                                                                                                                                                                                                                                 | proposal`leaves original task title`Send`, body/properties intact, and creates adjacent ` proposal` with empty body/default fields. Empty title remains an editable task; Backspace does not silently delete its hidden body. |
| Q-03   | Paragraph Tab traverses focus, list/code Tab indents with declared units; Shift+Tab reverses; an accessible escape returns to outer navigation.                                                                                                                |
| Q-04   | Multi-paragraph cells: Enter paragraph, Shift+Enter soft break, Tab next cell, final-cell Tab creates exactly one row; explicit edge escape. Single-line alternative has a separate profile.                                                                   |
| Q-05   | Pending internal task cut preserves recoverable original until atomic paste commits a move. Failed/cancelled paste preserves identity/content; committed move has one inverse owner. External/plain clipboard is an explicit copy/export path, never an alias. |
| Q-06   | Undo completion refuses if removing the generated next occurrence would destroy independent edits; original/next states stay protected with an actionable explanation.                                                                                         |
| Q-07   | Whole remote winner creates an explicit interactive-history boundary after protecting pending input; retained versions recover overwritten content. Safe rebase can compete if demonstrated.                                                                   |
| Q-08   | Cancel close if neither durable save nor protected recovery succeeds. No implicit destructive discard.                                                                                                                                                         |
| Q-09   | Declare input-shortcut triggers and one-step reversal/literal entry. Storage format and availability of a source mode are separate choices.                                                                                                                    |

The task-title split and table-row policies need schema/inverse proof, not only a
keymap. For cut/move, exact clipboard ownership, expiry and cross-Space semantics
remain Q-05/M-02; a marked pending cut is not permission to hide the only copy.

## Qualification layers and stop conditions

1. Static architecture: declared module/import boundaries, sole owners and mappings.
2. Core integration: fixture identity, commands/inverses, recovery and event catch-up.
3. Engine/browser: model/DOM/selection mapping and deterministic interleavings.
4. Packaged macOS: native input/services, clipboard, menus, accessibility, two windows.
5. Stress/fault: long documents, delayed media, blocked authority, failed saves,
   crash/reconnect and editor history after external commands.

The first experiment opens one document in two views; alternate edits and undo,
then race edits to the same range, close a view, fail a save and restart. Include
real table click-and-type and IME composition early. If selection, context undo or
provisional-input protection needs a workaround, record a separate patched candidate
and unpatched control. Do not build a polished UI before this proves viable.

Any reproducible wrong-range edit, dropped/duplicated input, unprotected work loss,
cross-context undo deletion, task identity violation or inaccessible core editing
path blocks selection. Fix and rerun the affected case group plus boundary/race
neighbours. No weighted score, aggregate pass percentage or faster render offsets
these blockers. Native acceptance remains blocked without actual native evidence.

## Scale and execution report

[Budgets](qualification-budgets.json) own proposed numeric targets and fixture
recipes. Report raw samples and environment with p50/p95/p99 as applicable, maximum
stall and correctness failures. A percentile target never excuses a wrong edit.
Synthetic event timing is not measured physical input-to-screen latency; label the
metric actually observed and use video/OS instrumentation when required.

Each run manifest needs candidate exact lockfile/source hashes, extension order,
keymap priorities, schema, history settings, task/media adapters, local host/backend,
OS/build/hardware/input source and native permissions. Prefer immutable release and
lock identities over claims of latest. Candidate sources/known advisories must be
checked at harness creation. No blanket claim that an engine's default history
already provides origin-selective undo across Clutter views.

For every instance report not-run/pass/fail/blocked/not-applicable with reason,
expected/actual state, selection immediately/settled, focus, undo/redo, artifact
paths and reproducible actions. Mark exploration separately from product acceptance.
One execution may satisfy several referenced requirements; count executions once.
A missing required feature is a capability gap, not not-applicable.

## Primary reference reviewed 2026-11-14

- [S1: W3C Input Events Level 2](https://www.w3.org/TR/input-events-2/)

See [qualification readiness](qualification-readiness.md) for actual environment,
remaining blockers and the concrete first R07 experiment. This document supplies
no runtime result and approves no editor.
