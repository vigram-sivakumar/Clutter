# Editor interaction specification — R02

Revision 0.27, 2026-11-14. Status: reviewed table-navigation policy within an
otherwise conditional editor specification; no candidate selected. Scoped executed
evidence and remaining native work are recorded in the checkpoint/progress log. Product directions are confirmed
in [product behaviour](product-behaviour.md); model-specific defaults below are
explicit proposals, not previously approved decisions.

## Purpose and authority

Specify the intended Clutter experience, then qualify complete candidates against
it. The current editor is Markdown-oriented evidence, not a target implementation
or a universal behaviour oracle. R01's [inventory](current-capability-inventory.md)
C17–C25 identifies complexity worth testing, not mechanics every candidate must copy.

Three distinct layers prevent the comparison from favouring today's code:

| Layer                 | Meaning                                                                                                                | How to evaluate                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shared reliability    | Correct input/selection/focus/history, identity, recoverability and accessibility                                      | Required of every candidate that offers the relevant product capability                                         |
| Clutter semantics     | Task pages/single location, cut moves/copy duplicates, conversion, read-only embeds and date/reminder rules            | Same product result across candidates, independent of syntax/storage                                            |
| Editing-model profile | Source newline versus paragraph split, marker deletion versus node join, Tab policy, cell Enter and Markdown shortcuts | Declare exact behaviour and evaluate UX deliberately; do not demand identical document internals or key results |

The [case catalogue](editor-interaction-cases.json) is the authoritative set of
initial fixtures/actions/expected results for this revision: **72 cases**, including
**60 shared required contracts, 10 model-specific proposals and two confirmed table-profile contracts**. It is a test
specification, not an executable harness or a pass report. The required label
means product-derived/common correctness obligation; it does not claim the user
personally approved each keyboard default. Open choices are in Q-01 through Q-09.

This draft completes the first R02 specification deliverable. R02 policy review
is still open. Freeze relevant proposals/questions before running them as binding
product acceptance. R03 can draft conditional schema/API alternatives in parallel,
but cannot silently resolve an editor-policy question by choosing a convenient schema.

## Fixture vocabulary and test record

JSON fixtures describe semantic content and user-visible entity identity. They are
not a canonical file format, database design, PM node schema or CM6 offset model.
Each adapter maps them to its representation and records a reproducible mapping.
Source candidates may use blank lines/dialect syntax; structured candidates may
use nodes. Neither is required to adopt the other's representation.

- ASCII offsets such as `p1@5` are zero-based text boundaries within the named
  fixture block, not engine positions. Unicode cases use named grapheme boundaries.
- A text range records anchor and head, including backward direction. Text, whole
  block, table cell and cell-range selections are different kinds, never inferred
  only from a highlighted rectangle.
- Explicit action groups define undo boundaries in grouped fixtures. Record actual
  timing/configuration separately; do not assume a universal library debounce time.
- Reset content/history between independent variants. Sequential cases name their
  prerequisite. Fixtures with clocks, injected failures or second views must record
  those controls. Real native input must not be replaced by transaction injection.
- Wrapped-line movement uses premeasured layout with pinned width/font/zoom and
  preferred horizontal position. A different visual wrap is not automatically a
  content/navigation bug; an unrelated document jump is.

Each run must record case/profile, package/schema versions, exact composition,
source revision, runtime/OS, physical events and modifiers, initial document/view
state, immediate and settled selection, resulting semantic/source state, undo/redo,
focus target, error/outcome and artifacts. Candidate mappings cannot make a
missing required product feature disappear by naming it not applicable.

## Interaction invariants

| ID     | Required invariant                                                                                                                                                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01 | One user input is applied once at its intended logical selection; typing immediately after navigation/pointer selection must not replace a stale range.                                                                                                                                            |
| INV-02 | The active native input range and logical primary selection remain coordinated; custom selection drawing is allowed. Transient differences cannot redirect immediate input. Do not require the browser to render every model range or excuse wrong replacement merely because later state settles. |
| INV-03 | Selection direction/type and mapped anchors remain valid through local edits, updates, media layout and focus changes. No offset points inside an invalid Unicode cluster or unrelated entity.                                                                                                     |
| INV-04 | Ordinary text editing does not silently delete a task body/properties, purge an asset, rewrite an embed target or flatten unsupported content. Explicit block deletion has separate lifecycle semantics.                                                                                           |
| INV-05 | Each semantic operation uses the shared mutation boundary and one coherent document history authority. Nested table/code editors are permissible only if selection/focus/history reconciliation passes the same contracts. A single DOM editor is not itself the acceptance criterion.             |
| INV-06 | Views keep independent cursor/scroll/focus. Another view/tool updates content without taking focus, sharing selection or accidentally entering local undo history.                                                                                                                                 |
| INV-07 | Typing, commands, task toggles, toolbar and native menu routes have equivalent domain meaning; adapters do not duplicate mutation policy.                                                                                                                                                          |
| INV-08 | Failure leaves work protected and errors honest. Rejected intents do not become successful undo groups. Current state/history/asset roots remain consistent.                                                                                                                                       |
| INV-09 | Platform input/IME, keyboard-only navigation and assistive technology are part of editing correctness. Controls and nested editors have an accessible, finite focus escape path.                                                                                                                   |
| INV-10 | Presentation changes alone do not dirty content/create versions or reset selection/history. Saving does not recreate editor state as an update strategy.                                                                                                                                           |

These invariants constrain implementations; they do not choose the number of DOM
roots, native versus web editor technology, source versus structured storage or a
specific library. An experimental selection repair is a distinct candidate with
maintenance/regression evidence, not an assumed production fix.

## Editing-model profiles

### Source-oriented profile

Declare source paragraph/soft-break rules, which markers are visible/editable,
selection movement around concealed syntax, list indentation units, marker
Backspace/Enter semantics, code treatment and table source/projection mode.
Preserve intentional source edits and document losses in interchange. Do not
inherit old fixed-width indentation decisions without a product rationale.

A source newline inside a paragraph and a semantic new paragraph are different
operations. EI-061 records the former for comparison; it is not the desired result
for every editor. Source-only marker/caret tests are additional tests for that
profile, not failures assigned to a candidate with no editable marker text.

### Structured profile

Declare paragraphs versus soft line breaks, block splitting/joining, text versus
node selection, list/task title boundaries, schema constraints and embedded-widget
behaviour. Preserve semantic identity through those operations. EI-062–EI-070 and
EI-072 provide explicit proposed outcomes; accepting the profile is still a review
step, not a consequence of picking PM/Tiptap.

Typing Markdown-looking characters may be literal text or an input shortcut.
That is a product input policy, not proof that the document must be Markdown.
EI-071/Q-09 keeps it distinct from the canonical representation.

### Candidate descriptor required before comparison

Record editing model(s), representation mapping, visible syntax, supported content,
selection kinds, exact key bindings, grouping/history ownership, nested controls,
unsupported content policy and profile choices. A hybrid is allowed but must
explain mode changes, selection mapping, identity, undo and fidelity on each switch.
Do not introduce a second writable document authority to implement two modes.

Compare shared correctness first, then the usability of the declared profiles.
A structured candidate does not fail because Enter differs from CM6, and a source
candidate does not pass merely because it matches current Markdown tests. Neither
may omit required task/media/page behaviours. UX/maintainability determine trade-offs;
migration effort has zero decision weight. Profile-specific checks are reported
separately instead of producing a misleading combined engine pass percentage.

## Case groups and ownership

| Cases         | Scope                                                                                                       | Primary owner / acceptance link                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| EI-001–EI-013 | Plain text, graphemes/bidi, arrows/selection, wrapped lines, near-focus input and copy                      | Editor selection/input adapter; T-01/T-03/T-09                                           |
| EI-014–EI-022 | IME, toolbar/dialog/date-picker focus, accessible controls                                                  | Input/focus adapter plus domain commands; T-01/T-08/T-18/T-19                            |
| EI-023–EI-033 | Grouped undo, multiple contexts/views, CLI updates, catch-up, remote replacement and close                  | Context history, Space authority and recovery; T-02/T-03/T-04/T-05/T-12                  |
| EI-034–EI-044 | Task pages/inbox, move/copy/delete/indent, task state and page conversion                                   | Task/placement/conversion commands plus editor intent; T-18/T-19/T-20                    |
| EI-045–EI-050 | Read-only embeds, open original, media boundaries, asset retention and delayed layout                       | Reference/media view plus lifecycle commands; T-01/T-08/T-11/T-20                        |
| EI-051–EI-060 | Table selection/history, rich/file paste, opaque blocks, comments and chained sequences                     | Table/clipboard adapters and shared mutation/history; T-01/T-03/T-06/T-09/T-14/T-18/T-20 |
| EI-061–EI-072 | Declared source/structured proposals for Enter/join/list exit/code/Tab/table/task shortcuts and replacement | Product profile review, then editor adapter; conditional expectations until approved     |

Per-case initial state, action, document result, selection/focus and undo expectation
are in the JSON catalogue. Do not create a parallel prose table of different expected
results. UI/sidebar/CLI representations share entity state; they need not use the
same editable surface, and a view is never a second location for a task.

### Deletion and task boundary distinction

Deleting selected task title text is different from deleting its whole placement.
The latter deletes that task under P-27; it is not a shortcut to convert it into
an independent inbox task. The former must protect body/properties. Q-02 decides
empty-title/Backspace/Enter behaviour and hidden-content safety before implementation.
Indentation is visual nesting only, never parent-task status/dates or subtasks.

Cut/paste across notes is one domain move with stable identity/content/history;
copy/paste creates independent entity IDs and content. Existing source-line clipboard
text is not evidence of this semantic guarantee. A failed paste, external clipboard
or cancelled cut requires Q-05; plain-text interchange must not accidentally alias
another task. A task cannot become a reference reused in multiple notes.

### Tables, read-only content and media

Keep text-range selection distinct from cell/row/column/block selection. A nested
cell editor must reconcile root history and selection rather than expose two undo
stacks. The [table contract](table-interaction-contract.md) now confirms navigation, hard
breaks, final boundaries, explicit addition controls and two view-local modes.
Escape removes the caret while retaining the highlighted cell; selection-mode
Tab/Shift+Tab move the highlight and Enter returns to editing. Triple-click in a
cell selects all of its text as a text range, not the cell structure. Cell schema/complex selection
details remain scoped independently; do not restore the withdrawn Enter/Tab defaults.

Read-only page embeds may allow text copy/selection and opening the original;
inner typing/formatting cannot mutate original or silently act on another view.
Deleting a selected embed placement affects its source reference only. Removing
an image/PDF placement must not purge bytes reachable from history/recovery.
Loading previews is presentation, not content typing.

### Focus, IME and platform commands

A macOS profile records actual physical bindings for character/word/visual-line/
document movement, extension, forward delete, selection-all, undo/redo and focus
escape. Primary modifier is Command on macOS; future Windows bindings are tested
separately. Do not equate Home/End with caret movement on every platform. Record
Fn/Delete variants and browser/OS handling rather than overriding them globally.

EI-010 reproduces the near-focus _class_ of problem using the declared line-start
binding. Also test physical Home/End against their declared native convention;
if they scroll without moving the caret, that is not a selection failure. Test
immediate typing and delayed updates; a screenshot after a wait cannot establish
input correctness. Composition, dead keys, accents and candidate acceptance must
use real input paths during native qualification.

Toolbars, menus, dialogs, table controls and PDF/image overlays need visible focus,
correct accessibility roles/names, and defined dismissal/return. Escape goes to
the active nested control first; it must not globally discard text. Focus restore
must be cancelled if another view/window became the intentional focus owner.

## Required variation coverage before qualification

The 72 catalogue rows are seed contracts, not a claim of full combinatorial coverage.
Expand relevant rows into explicit instances before execution. Never multiply
unexecuted variants into a reported pass count.

| Dimension            | Required instances / boundary                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position and content | Start/middle/end, empty/nonempty, adjacent boundaries, first/last item, supported nesting; task title versus task page body; no task-parent semantics                 |
| Selection            | Collapsed/forward/backward, one/multiple blocks, text/block/cell/range, all-content selection, inline formatting and Unicode boundaries                               |
| Block model          | Paragraph/heading/list/task/code/table/reference/read-only embed/image/PDF; unsupported schema content is preserved/refused, not silently converted                   |
| Interaction route    | Physical keys/modifiers, native menus, pointer drag/click/double/triple click, toolbar and accessibility activation; commands/injected transactions are supplementary |
| Timing and focus     | Immediate input, settled input, near-focus delays, toolbar/dialog cancellation, async media/parse refresh, view/window switch during pending actions                  |
| Sequence             | Enter/Backspace/Tab/Shift+Tab/Delete combinations, format/typing grouping, paste/undo/redo, task move/copy/undo, focus/navigation/typing                              |
| Platform text input  | Latin, accents/dead keys, CJK IME, emoji modifiers/ZWJ/flags/combining marks and bidirectional text; spellcheck/autocorrect/dictation where supported                 |
| Lifecycle            | Open/change/close last view, failed save/import, restart recovery, lost notifications, local external command and provider whole-state replacement                    |
| Scale                | Agreed small/typical/large text/media/table fixtures and zoom/width; D-11 still needs numeric latency/memory budgets                                                  |

A candidate feature outside supported schema may be explicitly not applicable only
when product scope allows it. For example, drawings are outside scope; image/PDF,
task page, backward selection and table interactions cannot be hidden as optional
because a candidate lacks an extension. Comment UI tests depend on comment delivery
phase; its identity/history fixture obligation remains in schema qualification.

## Policy review ledger

These questions are bounded to newly specified interactions. They do not reopen
confirmed properties/task/page/archive/sync decisions. The proposed alternatives
below are not implementation permission; cite the ledger item until resolved.

| ID   | Decision still open                                                       | Concrete proposal / safe boundary                                                                                                                                                                                                                                      | Blocks                                                                        |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Q-01 | Target paragraph/block/list splitting/joining and cross-block replacement | Evaluate declared source and structured profiles independently; structured proposals EI-062–EI-065/EI-072 preserve outside content/identity and source EI-061 stays literal. No exact-key equality requirement.                                                        | Freezing corresponding R02 cases and destructive structural commands          |
| Q-02 | Task title Enter/empty-title/Backspace and body boundary                  | EI-070 proposes a fresh adjacent task with empty body/default fields; protect original body. Never delete a task page body just because its title emptied. Empty demotion/merge needs explicit product choice.                                                         | Task title keymaps, selection-to-entity mapping and schema/API inverse detail |
| Q-03 | Plain paragraph Tab, list/code indentation and focus escape               | Propose Tab focus navigation in plain paragraphs, context indent/outdent for lists/code and an always-accessible escape. Source profile may choose text indentation. Specify units/caps per profile.                                                                   | Final keymaps, focus/accessibility tests                                      |
| Q-04 | Navigation/addition confirmed 2026-11-14; broader table UX still open     | [Table contract](table-interaction-contract.md) supersedes Enter paragraph-split and final-Tab growth proposals. EI-068/EI-069 are now confirmed. Handles, in-cell breaks and caret-end navigation are required; merged cells/menus/range bindings remain unqualified. | Native retest and remaining table schema/accessibility/history qualification  |
| Q-05 | Cross-document cut lifecycle, undo owner and external clipboard           | Preserve task identity and accessibility until move succeeds; clipboard expiry/failure must not lose it. Choose the move context/inverse policy and supported cross-Space/device behaviour; copy creates new IDs.                                                      | Task move transaction/clipboard protocol and cross-document undo              |
| Q-06 | Undo of recurrence completion after next occurrence changed               | One idempotent completion/generation operation; never delete independent edits to the next task during undo. Define refusal/narrowing and redo identities explicitly.                                                                                                  | Completion inverse/API and history semantics                                  |
| Q-07 | Interactive undo across a remote winning snapshot                         | Protect pending input/history first; propose a visible history boundary if safe rebase cannot preserve local undo. Retained overwritten versions remain accessible; never silently undo remote state as local typing.                                                  | Provider-to-view/history integration, not basic local-only typing             |
| Q-08 | Explicit discard during failed-save close                                 | Default preserves work/cancels close until protected. Existing implementation offers explicit close-and-lose; target P-07 does not yet define that exception. Do not inherit it silently.                                                                              | Destructive lifecycle override, not the normal close path                     |
| Q-09 | Markdown-looking input shortcuts and source/rich modes                    | Declare triggers, Escape/literal entry and reversible grouping per profile. No automatic requirement for source mode or PM input rules.                                                                                                                                | Shortcut UX; does not decide native storage format                            |

A follow-up product review can settle these one at a time with concrete examples.
Exploratory prototypes may compare unresolved profiles before approval, provided
results are labelled exploratory and not product acceptance. Do not ask the user
to select an engine or abstract model before showing its relevant experience.
Record date/decision/rationale here or in a linked superseding record; update affected
catalogue cases and their authority before declaring R02 policy approved. Unaffected
schema/API drafting may proceed conditionally. Do not ask the same broad question
again merely because another chat starts.

## Execution, evidence and acceptance

Run core semantic/inverse tests for shared intent, browser integration for model/DOM
mapping, then actual macOS/WKWebView for input, focus, IME, native menus, clipboard,
accessibility and media controls. Source-only transaction tests and Linux WebKit
are preliminary. No runtime or native acceptance is implied by this R02 delivery;
R01's existing baseline assertions are separate evidence of older implementation.

Use pass/fail/blocked/not-applicable with a reason and count actual expanded cases.
A case whose policy/profile is undecided is blocked for product acceptance, not a
candidate failure. A required feature unsupported by a candidate is a capability
gap, not an approved not-applicable result. Publish all configuration patches,
remaining regressions and candidate limitations; avoid overall engine rankings
from non-equivalent compositions or counting only easy paragraph cases.

R02 advances to approved specification only after relevant policy decisions and
explicit variant instances are frozen. R07 records execution later; R08 selects
technology from that evidence. R03 must specify canonical identity, mapping and
command/inverse contracts that make these behaviours possible, without silently
binding the product to Markdown mechanics or PM internals.

## R06 qualification preparation

[R06 qualification plan](editor-qualification-plan.md) defines native evidence and
stop conditions without duplicating these seed oracles. Its [instance catalogue](editor-qualification-instances.json)
expands timing and native/race probes; all are not-run. Q-01–Q-09 remain open for
binding acceptance. The user allows full implementation replacement.
