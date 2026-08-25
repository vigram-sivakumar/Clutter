# Markdown Editor Keyboard/Caret Behavior — Observed/Expected/Decision Record v1

**Status: investigation only. Nothing in this document has been implemented as a result of it. No files were modified to produce these observations.**

**Audited (see `docs/editor-research/` session record): this revision incorporates corrections from an audit pass against live re-verification. Corrections are folded into the affected sections in place rather than kept as a separate errata list — see the boundary-engagement corrections in §4–§6, the downgraded WikiLink-Backspace claim in §3, and the sequence-reasoning correction in §12.**

**Decided (§16): the product/design questions this ODR originally left open were reviewed and decided in a follow-up discussion — see §16 for the full resolved-vs.-still-open breakdown. No new investigation was performed to produce those decisions; all other technical findings in this document are unchanged.**

Method: every claim below is grounded in one of two sources, marked inline:

- **[CODE]** — read directly from the wired extension list (`MarkdownEditor.tsx`, `createEditorView.ts`) and the construct's own implementation file.
- **[LIVE]** — confirmed against the running app (`npm run dev`, real `EditorView`) during this investigation.

Where a cell is CM6/`@codemirror/lang-markdown` default behavior with **zero** Clutter code in the path, this is stated as a code-level fact (verified by reading every wired extension for keymap/`transactionFilter`/`changeFilter`/cursor-command registrations — there are none touching Enter/Backspace/Delete/Tab/Shift-Tab/Arrow/Home/End anywhere in this codebase), not re-derived character-by-character against upstream CM6's own already-documented defaults. That verification method is itself recorded in §1.

**Methodology limitation, load-bearing for how to read every [LIVE] tag below**: this investigation's live verification is reliable for mouse clicks (including pixel-targeted clicks against measured DOM rects) and character typing, both confirmed to reach the editor correctly via `window.getSelection()`/`document.activeElement` checks. It is **not** reliable for synthetic non-character key dispatch (`ArrowLeft`/`ArrowRight`/`Backspace`/`Delete`/`Enter`/`Tab` sent via the automation's key-press action) — repeated, reproducible testing found these produced **no observable effect** on the editor (confirmed via `getSelection()` before/after, and by typing a marker character afterward to check where it actually landed), despite focus being correctly on `.cm-content`. `Cmd+A`/`Cmd+Z` (browser/OS-level shortcuts) did work reliably. Consequently, **[LIVE] tags on this document's claims about Backspace/Delete/Enter/Arrow outcomes should be read as unconfirmed by this pass** unless the surrounding text says otherwise — those claims rest on [CODE] inference (§1's keymap audit, plus documented CM6 primitives like `atomicRanges`), which is solid, but is a different evidentiary basis than an actual observed keystroke result.

---

## 1. Current editor ownership architecture

**[CODE]** `createEditorView.ts` builds the base `EditorState` with, in order: `updateListener`, `blurHandler`, `editorTheme()`, `highlightActiveLine()`, `drawSelection()`, `EditorView.lineWrapping`, `history()`, `allowMultipleSelections`, `highlightSpecialChars()`, `dropCursor()`, `closeBrackets()`, `codeFolding()`, `foldGutter()`, then the caller's `extensions` (from `MarkdownEditor.tsx`), then finally one `keymap.of([indentWithTab, ...closeBracketsKeymap, ...historyKeymap, ...foldKeymap, ...defaultKeymap])` — registered **last**, i.e. lowest precedence, so anything in `extensions` can override it, but nothing in `extensions` currently binds Enter/Backspace/Delete/Tab/Shift-Tab/Arrow/Home/End.

**[CODE]** `MarkdownEditor.tsx`'s extension list (in order): `markdownLanguageExtension()`, `inlineLivePreviewRegion(participants)`, `wikiLinkLivePreview()`, `headingMarkerDecoration()`, `horizontalRuleDecoration()`, `formatShortcutsKeymap()`, `taskCheckboxMouseHandlers()`, `wikiLinkMouseHandlers()`, `wikiLinkAutocomplete()`, `tagMouseHandlers()`, `dateMouseHandlers()`, `linkMouseHandlers()`, `urlMouseHandlers()`, `semanticCompletion()`.

**[CODE]** Grepped every one of the above for `keymap`, `transactionFilter`, `changeFilter`, `EditorView.domEventHandlers` keydown/keypress, and any Arrow/Backspace/Delete/Enter/Tab-named command. Findings:
- `formatShortcutsKeymap()` — the **only** keymap contributed by Clutter code below the language extension. Binds `Mod-b`/`Mod-i`/`Mod-e` only (toggle-wrap bold/italic/inline-code). Does not touch Enter/Backspace/Delete/Tab/Arrow.
- `EditorView.atomicRanges` is contributed by two extensions: `inlineLivePreviewRegion()` (scoped to the widget-replace family: `Tag`, `Date`) and `wikiLinkLivePreview()` (scoped to at-rest `WikiLink`). This affects the **implementation** of CM6's default cursor-motion/deletion commands (`cursorCharLeft`/`deleteCharBackward`/etc. all consult `atomicRanges` internally) but is not itself a keymap and does not add any binding.
- Nothing else — mouse handlers, autocomplete sources, and decoration `ViewPlugin`s carry no keyboard behavior.
- `@codemirror/lang-markdown`'s `markdown()` extension (via `markdownLanguageExtension()`) contributes its own internal keymap (`insertNewlineContinueMarkup`, `deleteMarkupBackward`) at the language-data level — this is upstream library behavior, not Clutter code, and is the mechanism responsible for e.g. blockquote/list continuation on Enter for constructs that exist in the grammar (list/blockquote are out of scope per this ODR's brief, but Enter's general dispatch path is worth naming here since it also governs headings/paragraphs).

**Conclusion, stated once so it isn't re-derived per matrix cell below**: for every construct in scope, Enter/Backspace/Delete/Tab/Shift-Tab/ArrowLeft/ArrowRight/ArrowUp/ArrowDown/Home/End/selection-creation/selection-deletion/typing is **100% CM6 core + `@codemirror/lang-markdown` default behavior**, mediated only by whether the caret's target position falls inside an `atomicRanges` range (WikiLink-at-rest, Tag-at-rest, Date-at-rest — Tag/Date are out of this ODR's requested minimum surface but share the exact mechanism, noted where relevant). No Clutter transaction filter, change filter, or keymap entry exists for any of these operations, for any construct.

---

## 2. Supported Markdown construct inventory (in scope per brief)

| Construct | Parser | Live Preview / visual | Decoration mechanism | Atomic at rest? | Custom Clutter keyboard behavior | Currently wired? |
|---|---|---|---|---|---|---|
| Plain text | CommonMark core | n/a | n/a | No | None | — |
| Heading (ATX `#`–`######`, Setext `===`/`---`) | CommonMark core | Marker concealed at rest; content classed `tok-heading1`–`6` | `headingMarkerDecoration()` (marker, `liveMarkDecoration`, `'physical-line'` engagement) + content classing folded into `inlineLivePreviewRegion.ts` (unconditional, always-descend branch, not a participant) | No | None | **Yes** |
| Bold / Strong (`**x**`/`__x__`) | CommonMark core (`StrongEmphasis`) | Markers concealed at rest, content classed `tok-strong` | `inlineLivePreviewRegion` shared participant (`delimitedInlineRenderer('EmphasisMark','tok-strong')`) | No | None | **Yes** |
| Italic / Emphasis (`*x*`/`_x_`) | CommonMark core (`Emphasis`) | Same shape, `tok-emphasis` | Same mechanism | No | None | **Yes** |
| Strikethrough (`~~x~~`) | GFM extension | Same shape, `tok-strike` | Same mechanism | No | None | **Yes** |
| Highlight (`==x==`) | Clutter grammar extension (`highlightSyntax.ts`, `Highlight`/`HighlightMark`) | Same shape, `tok-highlight` | Same mechanism | No | None | **Yes** |
| Inline code (`` `x` ``) | CommonMark core (`InlineCode`) | Same shape, `tok-code` | Same mechanism | No | None | **Yes** |
| Link (`[text](url)`) | CommonMark core (`Link`) | `[`, `](url "title")` concealed; label classed `tok-link`, stays character-editable | `inlineLivePreviewRegion` shared participant, dedicated `linkRenderer` (not `delimitedInlineRenderer` — asymmetric mark shape) | **No** (deliberately, Locked) | Click-to-navigate (`linkMouseHandlers`) is product interaction, not a keyboard/cursor behavior | **Yes** |
| Bare URL / Autolink (`https://…`, `<https://…>`) | GFM (`Autolink`) / core (`URL`) | `Autolink` reuses `delimitedInlineRenderer('LinkMark','tok-link')`; bare `URL` gets a minimal `urlRenderer`, no concealment | `inlineLivePreviewRegion` shared participants | No | Click-to-navigate | **Yes** (rendering); styling/navigation resolved 2026-08-25 per decisions log |
| WikiLink (`[[Page]]`, `[[Page\|Alias]]`) | Clutter grammar extension (`wikiLinkSyntax.ts`, `WikiLink`) | At rest: single atomic widget (alias/filename, folder path never shown). Engaged: raw `[[`/filename/`\|alias`/`]]`, **folder prefix still concealed even while engaged** | **Standalone** extension `wikiLinkLivePreview.ts` — deliberately outside `inlineLivePreviewRegion` (different contract) | **Yes, at rest only** (`EditorView.atomicRanges`) | Click-to-navigate/create (`wikiLinkMouseHandlers`); autocomplete (`wikiLinkAutocomplete`) is insertion-only | **Yes** |
| Horizontal rule (`---`/`***`/`___` native; `~---~`/`=---=`/`.---.` Clutter variants) | CommonMark core (native) + 3 Clutter block-parser extensions | At rest: collapsed to a thin CSS divider line (`cm-hr-line*`), raw dashes hidden via `Decoration.replace` on a `Decoration.line` collapsed-metrics line. Engaged: raw marker text at normal size, no divider | Standalone `ViewPlugin` (`horizontalRuleDecoration.ts`), `isRuleEngaged`/`'physical-line'`-equivalent (own local re-implementation, not `liveMarkDecoration`) | No (`EditorView.atomicRanges` not registered for it) | None | **Yes** |

**[CODE]** Tag (`#tag`), Date (`@YYYY-MM-DD`), Task checkboxes, emoji-list, tables, and lists all have real parser + (for Tag/Date) real Live Preview code in this codebase, but are **explicitly out of scope** per the task brief ("Lists … out of scope") or, for Tag/Date, simply not named in the requested minimum surface. They are mentioned only where their mechanism is directly relevant to something in scope (e.g. Tag/Date share the exact `atomicRanges`/widget-replace mechanism WikiLink partially does, which is relevant context for §14's ownership classification). Tables (`tableDecoration.ts`) and Lists (`listMarkerDecoration.ts` et al.) are parsed but **not currently wired** in `MarkdownEditor.tsx` — raw pipe/dash syntax is what actually renders today if either is typed.

---

## 3. Keyboard interaction matrix

Per §1's conclusion, every cell here is **CM6 core / `@codemirror/lang-markdown` default**, no Clutter override, for every construct in §2 — **with one structural exception**: whenever the caret's motion or deletion target would land inside an `atomicRanges` range (WikiLink-at-rest is the only in-scope case), the *same* default CM6 command (`cursorCharLeft`, `deleteCharBackward`, etc.) treats the whole range as one unit instead of one character, because `atomicRanges` is a documented CM6 primitive those commands already consult — not a Clutter-authored override of the command itself.

| Operation | Ordinary text / Bold / Italic / Strike / Highlight / Inline code / Link / Autolink / bare URL / Heading content / HR (engaged) | WikiLink (at rest) | HR (at rest, collapsed line) |
|---|---|---|---|
| Enter | CM6 default: splits the paragraph at the caret, ordinary two-paragraph result. **[LIVE]-adjacent**: confirmed no Clutter Enter handler exists in the wired extension list (§1); exact split behavior not independently re-keystroked in this pass since it is unreachable-by-Clutter-code by construction. | Enter is not itself blocked; the caret cannot be *inside* an at-rest atomic WikiLink to begin with (arrow/click motion treats it as one stop) | Same as adjacent text — HR's own line is a real document line; Enter before/after it just splits/creates an adjacent paragraph line, ordinary default behavior |
| Backspace | CM6 default `deleteCharBackward`/lang-markdown's `deleteMarkupBackward` | **[CODE]-derived, not live-verified**: `atomicRanges` is a documented CM6 primitive that `deleteCharBackward` consults, and its configuration here (§1, §2) would produce one-step whole-node deletion when the caret sits at the node's right boundary — but this specific outcome was not actually confirmed with a working Backspace keystroke in this investigation. An earlier attempt to verify it conflated a WikiLink *click* (which activates navigation, per §14 item 5) with the Backspace result; the page-navigation side effect of that click was mistakenly read as evidence of atomic deletion. Per the methodology note above, re-verifying this needs either a differently-instrumented test (e.g. a Vitest-level `EditorView` test dispatching a real transaction, consistent with this codebase's existing test patterns) or a keyboard-dispatch path this session's tooling didn't reliably drive. | Backspace from the line after HR: deletes back into the (concealed) rule text one atomic-range-free character at a time — no `atomicRanges` registered for HR, so this is ordinary default character deletion against real (collapsed-looking but not atomic) text |
| Delete | CM6 default `deleteCharForward` | Same [CODE]-derived, not live-verified reasoning as Backspace, mirrored for forward direction | Ordinary default, no atomicRanges |
| Tab | CM6 default: `indentWithTab` (from `createEditorView.ts`'s own final keymap) — indents/inserts a tab character; no Clutter Markdown-aware Tab behavior anywhere | Same | Same |
| Shift-Tab | CM6 default `indentWithTab`'s de-indent half, same keymap entry | Same | Same |
| ArrowLeft / ArrowRight | CM6 default `cursorCharLeft`/`cursorCharRight`, consulting `atomicRanges` | One press treats the entire at-rest widget as a single stop (hop over, not into) — **[CODE]** confirmed no per-construct Arrow keymap exists; this is `atomicRanges`' documented cursor-motion effect, and per the decisions log this is a *deliberate, superseded-and-reverted-to-default* state (a bespoke hop/boundary-landing keymap existed earlier and was explicitly removed 2026-08-23; today's one-atomic-step behavior is CM6's own default consequence of `atomicRanges`, not a re-implementation of the removed mechanism) | n/a (not atomic) |
| ArrowUp / ArrowDown | CM6 default `cursorLineUp`/`cursorLineDown`, purely visual-line based; no Markdown awareness | Same | Same |
| Home / End | CM6 default `cursorLineBoundaryBackward`/`Forward` | Same | Same |
| Modifier-assisted movement (word/line jumps, Cmd/Ctrl-Arrow, Alt-Arrow) | CM6 default (`defaultKeymap`'s own word/group motion commands) | Same, still atomic-range-aware | Same |
| Selection creation (drag, Shift-Arrow, double/triple-click) | CM6 default | **[CODE]**: `tokenSelectionSnap.ts`/`*SelectionSnap.ts` files exist but are explicitly unwired dormant modules (per the 2026-08-23 "CodeMirror owns cursor and selection behavior" decision) — so drag-selection landing partway inside an at-rest WikiLink is **not** corrected/snapped to the boundary today; it is whatever CM6's own native behavior produces against the widget's rendered footprint | n/a |
| Selection deletion/replacement | CM6 default `deleteSelection`/type-over-selection | If the selection spans (or is contained by) the atomic range, deleted as part of the selection edit like any other selected text — `atomicRanges` affects cursor *motion* commands, not selection-replace transactions, per the "Verified against installed APIs" note in the decisions log ("`atomicRanges` … does **not** prevent programmatic selection changes") | n/a |
| Normal typing | CM6 default insertion at caret | Typing while the caret sits *inside* an engaged (not at-rest) WikiLink is ordinary character insertion into raw text, same as any other construct | Typing on the HR's own line (engaged) inserts into the raw marker text like any other line |

---

## 4. Caret-position matrix (representative positions, all in-scope inline constructs)

**[CODE]-grounded and [LIVE]-corrected** — engagement is a pure, single function of `(syntaxTree, selection)` (`isTokenEngaged`: `selection.from >= node.from && selection.to <= node.to`), so every position's preview/source state is fully determined by which node(s) contain it. Both comparisons are **inclusive**: a zero-width caret exactly at `node.from` or exactly at `node.to` satisfies the check and is therefore **engaged**, not at rest. This was live-verified with pixel-targeted clicks against `X**bold**Y` (`StrongEmphasis` with `node.from=1`, `node.to=9`): clicking to place the caret at document position 1 (immediately before the opening `**`, right after `X`) and at position 9 (immediately after the closing `**`, right before `Y`) both produced the fully-raw `X**bold**Y` rendering. "At rest" begins only **strictly outside** `[node.from, node.to]` — i.e. one character further out than "immediately before/after the construct." Below, `owner` names which mechanism decided the *rendering* at that position; caret *motion itself* through these positions is always CM6 default (§3) regardless of which owner rendered the surrounding decoration.

A related, separately-verified nuance: clicking at the *apparent visual boundary pixel of an already-collapsed (at-rest)* construct does not usually land exactly at `node.from`/`node.to` — since the concealed marker occupies zero width, the browser's click-to-caret resolution instead lands at the nearest edge of the *visible content mark*, i.e. `openMark.to`/`closeMark.from` (confirmed live: clicking the collapsed left edge of `X**bold**Y` landed at offset 3 = `openMark.to`, not offset 1 = `node.from`; the collapsed right edge landed at offset 7 = `closeMark.from`, not offset 9 = `node.to`). Both of those are still inside `[node.from, node.to]`, so the rendering outcome (collapsed → engaged) is unaffected — but the exact resulting document position differs from a naive "click lands exactly at the node boundary" assumption, which matters for what a subsequent keystroke would do.

For `**bold text**` (StrongEmphasis, participant in `inlineLivePreviewRegion`):

| Position | Rendering state | Owner |
|---|---|---|
| `\|**bold text**` (caret exactly at `node.from`) | **Engaged**: full raw text visible (inclusive boundary — see above) | `inlineLivePreviewRegion` (`isTokenEngaged` true) |
| `*\|*bold text**` (inside opening marker pair) | Engaged: full raw text visible | Same |
| `**\|bold text**` | Engaged | Same |
| `**b\|old text**` | Engaged | Same |
| `**bold text\|**` | Engaged | Same |
| `**bold text**\|` (caret exactly at `node.to`) | **Engaged**: full raw text visible (inclusive boundary) | Same |

"At rest" for this construct requires the caret strictly outside `[node.from, node.to]` — e.g. one character further left than the first row above, or one character further right than the last row.

Same shape (structurally identical `delimitedInlineRenderer`) for Italic (`Emphasis`/`EmphasisMark`), Strikethrough (`Strikethrough`/`StrikethroughMark`), Highlight (`Highlight`/`HighlightMark`), Inline code (`InlineCode`/`CodeMark`) — **[CODE]** all five are literally the same factory function with different node/class names, so there is no behavioral divergence to test per-construct; a difference would be a code bug, not a design choice, and none was found reading the four other registrations in `inlineLivePreviewParticipants.ts`. The same inclusive-boundary correction applies identically to all four.

For `[link](url)` (dedicated `linkRenderer`, asymmetric shape):

| Position | Rendering state | Owner |
|---|---|---|
| `\|[link](url)` (caret exactly at `node.from`) | **Engaged**: everything raw (inclusive boundary, same rule as bold/italic above — not independently re-clicked for `Link` specifically in this pass, but the mechanism is the identical, unmodified `isTokenEngaged` call) | `linkRenderer` |
| `[\|link](url)` | Engaged: everything raw | Engaged |
| `[link\|](url)` | Engaged | Engaged |
| `[link]\|(url)` | Engaged (this position is still inside the `Link` node — the node spans through the closing `)`) | Engaged |
| `[link](url\|)` | Engaged | Engaged |
| `[link](url)\|` (caret exactly at `node.to`) | **Engaged**: everything raw (inclusive boundary) | Engaged |

For `[[Page]]` (standalone `wikiLinkLivePreview`, atomic at rest):

| Position | Rendering state | Owner | Note |
|---|---|---|---|
| Strictly before `node.from` (e.g. one character further left than `\|[[Page]]`) | At rest: single atomic widget | Not engaged | — |
| `\|[[Page]]` (caret exactly at `node.from`) | **Engaged** (inclusive boundary — [LIVE]-confirmed for this exact case: clicking to place the caret exactly at a WikiLink's own `node.to` in `before [[Zorp Page]] after` engaged it, revealing the raw `[[Zorp Page]]`; the symmetric `node.from` case follows the same unmodified `isTokenEngaged` call and was not separately re-clicked, but there is no code-level reason it would differ) | `wikiLinkLivePreview`'s own `isTokenEngaged` call | Reaching this exact position via a single ArrowRight/click is a separate, [CODE]-derived (not live-confirmed, per the methodology note) claim about `atomicRanges`' cursor-motion effect — see §3 |
| Any position with `from`/`to` strictly inside `[[Page]]`'s node range | Engaged: raw `[[`/`Page`/`]]`, **except** the folder-prefix segment (none, in this example — no `/`) which stays concealed even while engaged, per WikiLink's own genuinely-different contract | `wikiLinkLivePreview`'s own `isTokenEngaged` call, widened via `widenToEnclosingLivePreviewRegion` when nested (see §7) | This is the one in-scope construct whose engaged state is *not* "fully raw source" — the locked exception to the shared contract |
| `[[Page]]\|` (caret exactly at `node.to`) | **Engaged** — [LIVE]-confirmed directly: clicking to place the caret exactly at `node.to` in `before [[Zorp Page]] after` revealed the raw WikiLink text rather than leaving it collapsed | Same | |
| Strictly after `node.to` | At rest: single atomic widget | Not engaged | — |

**Difference between underlying document positions and the visible/widget representation (WikiLink specifically, as the brief asks to call out)**: at rest, the document contains `[[Page]]` (8 chars) but the rendered widget occupies whatever width `Page` (the resolved display label) needs — a click or drag against the *rendered* widget footprint maps back to document positions 0–8 as a single unit via `Decoration.replace({widget})`, not proportionally. **[CODE]**: this replace-with-widget + atomic-range combination is exactly why WikiLink is the one construct in scope where "caret position" and "visible position" genuinely diverge; every other in-scope construct (bold/italic/strike/highlight/code/link/heading/HR) uses `Decoration.replace({})` (nothing rendered, zero-width) or `Decoration.mark`/`Decoration.line` (real text still present, just styled/concealed) — none of those substitute a differently-sized visible object for the underlying text the way the WikiLink widget does.

For Heading (`# Heading`):

| Position | Rendering state | Owner |
|---|---|---|
| `\|# Heading` (before the whole line, e.g. previous line's end) | n/a — different line | — |
| `\|# Heading` (start of this line) — technically position 0 of a heading node | Marker hidden (not engaged, `'physical-line'` mode) if selection isn't on this physical line; if the caret is literally at doc position `node.from`, `isPhysicalLineEngaged` compares *lines*, so being at column 0 of the heading's own line **is** engaged | `headingMarkerDecoration` (`liveMarkDecoration`, `'physical-line'`) |
| `#\| Heading` | Engaged (marker + separator space visible) | Same |
| `# \|Heading` | Engaged | Same |
| `# Heading\|` | Engaged (same physical line) | Same |

Heading's engagement granularity is **physical-line**, not node-range — the one in-scope construct where that distinction matters, because a caret anywhere else on that same visual line (even past the content, in trailing whitespace) still counts as engaged, whereas bold/italic/etc. require the caret strictly inside the node's own character range.

For Horizontal Rule (`---` alone on its line):

| Position | Rendering state | Owner |
|---|---|---|
| Caret on the line before HR | HR renders collapsed (not engaged) | `horizontalRuleDecoration`, `isRuleEngaged` false |
| Caret on the HR's own line (any column — the line is collapsed to near-zero height at rest, so "any column" is mostly a document-position concept, not a clickable pixel range) | Raw marker visible, normal line height | `isRuleEngaged` true |
| Caret on the line after HR | Collapsed | Not engaged |

---

## 5. Boundary matrix (`X **bold** X` and equivalents)

**[LIVE] confirmed**: typed `X **bold** X` and it rendered as `X ` + bold `bold` + ` X`, ordinary text on both sides, no interaction with the boundary text (§ initial screenshot in this investigation). Note this example has a space between `X` and the construct — `X**bold**X` (no space) is the tighter case, addressed below with the §4 boundary correction applied.

| Position | Owner | Note |
|---|---|---|
| `X\|**bold**X` (caret in the plain-text `X`, strictly outside the node) | CM6 (plain text, no participant) | Not engaged — genuinely outside `[node.from, node.to]` |
| `X**\|bold**X` (caret just inside the opening marker) | Construct's engagement mechanism (varies by construct — node-range for bold/italic/strike/highlight/code/link, physical-line for heading, standalone-widened for WikiLink) | Engaged |
| `X**bold**\|X` (caret exactly at `node.to`, immediately after the closing marker, before the boundary `X`) | Construct's engagement mechanism | **Engaged**, per §4's boundary correction — `node.to` is an inclusive boundary for `isTokenEngaged`, so this position is *not* at rest despite visually looking like "just past" the construct. Only the position one character further right (inside `X`, i.e. strictly `> node.to`) is at rest. |

This pattern repeats identically for every in-scope inline construct (`*italic*`, `~~strike~~`, `==highlight==`, `` `code` ``, `[link](url)`, `[[Wiki]]`), boundary-adjacent to `X` on both sides — the same inclusive-boundary rule from §4 applies uniformly, with WikiLink's atomic-hop caveat from §3/§4 applying at its own boundary specifically.

**Ownership answer to the brief's explicit question ("who owns the behavior")**: for every boundary case above, the owner is whichever construct's decoration mechanism is named in §2/§4 (never "browser/contenteditable" — CM6 draws its own selection/caret via `drawSelection()`, and the boundary crossing itself is an ordinary CM6 cursor-motion step, not a DOM/contenteditable-native behavior). No boundary case found a `browser/contenteditable` or `unknown` owner.

---

## 6. Repeated-construct matrix

`**one** **two** **three**` — three sibling `StrongEmphasis` nodes at the `Paragraph` level, each independently evaluated by `inlineLivePreviewRegion`'s traversal (§ implementation detail: `syntaxTree.iterate` visits siblings independently; there is no cross-sibling state).

| Position | Rendering | Owner note |
|---|---|---|
| Beginning (`\|**one** **two** **three**`, caret exactly at `**one**`'s own `node.from`) | Per §4's boundary correction, `**one**` is **engaged** at this exact position (inclusive `node.from` boundary), not at rest; `**two**`/`**three**` are unaffected and stay at rest | `**one**`'s own `isTokenEngaged` check — independent per node, as this table's other rows already establish |
| Caret inside `**two**` | Only `**two**` engaged; `**one**` and `**three**` stay at rest | Each `StrongEmphasis` node's engagement is independently computed — no shared/adjacent-reveal behavior |
| Caret on the space between `**one**` and `**two**` | Neither engaged (space is outside both nodes) | Plain text position |
| Caret immediately beside a construct (e.g. `**one**\| **two**`) | Not engaged (position is the node's own `to`, and `isTokenEngaged` requires `selection.to <= node.to`, i.e. position `node.to` itself still counts as *inside* by the `<=`/`>=` inclusive check — worth flagging precisely) | **[CODE] precision**: `isTokenEngaged`'s boundary check is `selection.from >= node.from && selection.to <= node.to` — a zero-width caret exactly at `node.to` satisfies `to <= node.to` (equal), so it **is** engaged. This means `**one**\|` (caret immediately after the closing `**`, before the following space) is still engaged, not at-rest — a subtlety worth naming since visually it looks identical to "just past the construct." |
| Between two different constructs (`**bold** *italic*`) | Same independent-per-node evaluation; no special-cased pairwise behavior anywhere (`inlineLivePreviewRegion.ts`'s own doc comment explicitly requires "nothing here may name a *combination* of constructs") | — |

Mixed repeated construct `[[One]] **[[Two]]** ==[[Three]]==`: parses as three independent `Paragraph` children (`WikiLink`, then `StrongEmphasis > [EmphasisMark, WikiLink, EmphasisMark]`, then `Highlight > [HighlightMark, WikiLink, HighlightMark]`). `[[Two]]` and `[[Three]]` are each individually subject to `widenToEnclosingLivePreviewRegion` (§7) when their own caret positions are queried; `[[One]]` (no enclosing delimited construct) is not. This is a genuine nested case, covered in §7.

---

## 7. Nested/mixed-construct matrix

**[CODE] mechanism, confirmed for the shared-participant family (bold/italic/strike/highlight/code, all combinations among themselves)**: `inlineLivePreviewRegion.ts`'s traversal visits outer-before-inner and **stops descending** the moment it finds an engaged ancestor (`enter` returns `false`) — so an engaged outer construct makes every nested participant inside it render as raw source too, unconditionally, regardless of the nested construct's own engagement state. This is the *region*, not the individual node, being the unit — explicitly documented and, per the decisions log, the fix for a previously-shipped bug (`~~__Text__~~` half-revealing).

| Combination | Behavior | Owner |
|---|---|---|
| `***bold italic***` (`StrongEmphasis > Emphasis`, or vice versa depending on delimiter run parsing) | At rest: both concealed, nested content classed by whichever is outer (inner's own class is never applied — traversal never descends into the inner node once the outer is confirmed not engaged... **correction, precisely**: not-engaged does *not* stop descent, only *engaged* does. So at rest, both marks are visited and both concealed/classed, nesting correctly as `tok-strong > tok-emphasis` or similar via CM6's own mark-nesting (same-source decorations, no precedence conflict, per the decisions log's "Shared DecorationSet" section) | `inlineLivePreviewRegion`, ordinary two-level nesting, no special-casing needed |
| `**bold ==highlight *italic*==**` | At rest: outer `StrongEmphasis` concealed/classed, `Highlight` inside it concealed/classed, `Emphasis` inside that concealed/classed — three levels, same mechanism, no depth limit in the code | Same |
| Caret inside the innermost `*italic*` only | Only `Emphasis` engaged; `Highlight` and `StrongEmphasis` stay at rest (their own ranges don't contain the caret) | Same, no ancestor engaged so no short-circuit triggers |
| Caret inside `Highlight` but not `Emphasis` (i.e., in the highlight's own text, outside the nested italic) | Only `Highlight` engaged. Per §4.4's "accepted consequence" (documented explicitly in `inlineLivePreviewRegion.ts`'s own comment): if a sibling construct existed at the same level it would also reveal, but a *strictly nested* construct one level further in (here there isn't one at this exact position) is unaffected either way — the engaged ancestor's own short-circuit only fires when the ancestor itself is engaged | Same |
| Caret inside the outermost `**...**` | Engaged ancestor found first — traversal returns `false` before visiting `Highlight` or `Emphasis` at all, so the **entire region** (all three levels) renders as raw source simultaneously | This is the region-resolution fix — confirmed as the intended, current behavior, not a regression |
| WikiLink nested in delimited constructs (`**[[Page]]**`, `*[[Page]]*`, `~~[[Page]]~~`, `==[[Page]]==`) | At rest: outer mark concealed, content-mark wraps the WikiLink's own at-rest widget (`tok-strong > tok-wikilink` DOM nesting, confirmed via the decisions log's "Cross-source mark/widget composition" regression fix — `Prec.high` on `wikiLinkLivePreview` is what makes this nest instead of split). Engaged: **[CODE]** WikiLink's own `widenToEnclosingLivePreviewRegion` walks up through any chain of delimited-mark ancestors (structural check: "two identically-named children ending in `Mark`" — generic, not construct-named) so that the *entire* `**[[Page]]**` engages as one region the moment the caret is anywhere inside the outer `**`, not only once it reaches the WikiLink's own narrower node range. This was a real, fixed regression (the "Independent-engagement boundary-gap" case in the decisions log) — a caret strictly between the outer `**` and the WikiLink's own `[[` used to show an impossible half-state (`**Page**`); now it doesn't. | `wikiLinkLivePreview` (standalone), `inlineLivePreviewRegion` (outer marks) — two independent mechanisms coordinating via the generic ancestor-walk, not a shared traversal |
| Link nested in delimited constructs / delimited constructs nested in Link label (`**[link](url)**`, `[**bold**](url)`) | Shared-participant, same mechanism as any two nested `inlineLivePreviewRegion` participants — no special case, `Link`'s renderer participates in the exact same traversal | `inlineLivePreviewRegion` |
| WikiLink nested inside a Link's label (`[See [[Page]]](url)`) | **[CODE] — a recorded, live, *not yet fixed* gap, called out explicitly in the decisions log** (`docs/editor-architecture-decisions.md`, "A live, already-shipped side effect discovered while investigating Link"): `Link`'s first/last children are both named `LinkMark` (shared name across `Link`/`Image`/`Autolink`), which satisfies `isDelimitedMarkConstruct`'s generic "two identically-named `*Mark` children" structural check even though `Link` is not a registered `delimitedInlineRenderer` participant. Consequence: placing the caret at `Link`'s own opening `[` (nowhere near the nested WikiLink) can incorrectly widen and reveal the nested WikiLink's raw `[[Page]]`. **This is a genuine, already-known bug, not something newly found in this ODR — recording it here because it is directly relevant to the nested-construct brief, not fixing it (per the "do not implement" instruction).** | `wikiLinkLivePreview`'s ancestor-walk, mis-triggered by `Link`'s incidental grammar shape |

---

## 8. Links and WikiLinks matrix

| Form | Editable at rest? | At-rest representation | Engaged representation | Mechanism |
|---|---|---|---|---|
| `[link](url)` | Label yes (ordinary text); URL/parens no (concealed) | Label only, classed `tok-link` | Full raw `[label](url "title")` | Shared participant, `Decoration.mark` for label + `Decoration.replace` for syntax — **never atomic** |
| `[[Wiki]]` | No, at rest (whole node is one atomic widget) | Compact widget: local alias, else target's primary frontmatter alias, else filename — **never** the folder-qualified path | Raw `[[`/filename/`\|alias`/`]]`, folder-prefix segment (if any) still concealed | Standalone extension, `Decoration.replace({widget})` + `atomicRanges` at rest |
| `**[[Wiki]]**` | Same WikiLink rules, widened engagement region (§7) | `tok-strong > tok-wikilink` nested widget | Raw, whole region, folder still hidden | Both mechanisms, coordinated via ancestor-walk |
| `==[[Wiki]]==` / `~~[[Wiki]]~~` / `*[[Wiki]]*` | Same pattern | Same nesting shape with respective class | Same | Same |
| `[[Wiki]] **bold**` | Two independent sibling nodes, no interaction | Widget + bold rendered independently | Independent engagement | No coordination needed — siblings |
| `**[link](url)**` | Label editable within the bold region once engaged | `tok-strong > tok-link` (label only visible at rest, nested inside bold styling) | Raw `**[label](url)**` once caret enters the `StrongEmphasis` | `inlineLivePreviewRegion`, ordinary two-level nesting (Link is a shared participant, no widening logic needed since it's not standalone) |
| `[**bold**](url)` (bold nested *inside* a Link label) | Confirmed via decisions log: parses as ordinary nested inline content between the label's two `LinkMark`s — bold renders inside the (already-`tok-link`-classed) label, same shared-traversal nesting as any other case | — | — | `inlineLivePreviewRegion` |

**Normal editable text / atomic / partially editable / decoration-backed / parser-backed / Clutter-extension classification, per the brief's explicit ask**:
- `[link](url)` label: **normal editable text**, decoration-backed (styling/concealment only), parser-backed (CommonMark core `Link`), no Clutter extension involved in parsing.
- `[[Wiki]]` at rest: **atomic widget**, not editable at all until engaged (click, or caret enters via a non-atomic path — e.g. Home/End landing at a line boundary that happens to coincide, or programmatic selection). Parser-backed by a genuine Clutter grammar extension (`wikiLinkSyntax.ts`).
- `[[Wiki]]` engaged: **partially editable** — everything is ordinary editable text *except* the folder-prefix substring, which stays concealed (zero-width `Decoration.replace`) even while the rest of the node is raw. This is the one in-scope construct that is genuinely "partially editable" in the brief's sense; every other in-scope construct is either fully editable (engaged marker-hiding family) or fully atomic (WikiLink at rest only).

---

## 9. Heading matrix

**[LIVE] confirmed** (§ initial screenshot): `# Heading one` renders as a large, bold, marker-concealed line at rest.

| Case | Behavior | Owner |
|---|---|---|
| `# Heading`, `## Heading`, `### Heading` | Marker (`#`/`##`/`###` + one separator space) concealed at rest; content classed `tok-heading1`/`2`/`3` | `headingMarkerDecoration` (marker) + `inlineLivePreviewRegion`'s unconditional heading-class branch (content) |
| `# **Heading**` | Both mechanisms compose: heading class always applied (unconditional branch, never short-circuited by heading engagement), `StrongEmphasis` inside independently concealed/revealed per its own engagement — **[CODE]** this exact composition (`# **Bold** heading`) is the case the decisions log calls out as previously broken (`headingHighlighting()`'s `TreeHighlighter`-based approach split rather than nested) and specifically fixed by moving heading classing into the shared traversal as an always-descend branch | Both, coordinated by design (not by accident) |
| `# ==Heading==` / `# *Heading*` / `# [[Wiki]]` | Same composition pattern, each nested participant independently engaged regardless of heading's own marker-engagement state | Same |
| `# **==Heading==**` | Three-level nesting (heading class, then bold, then highlight) — same "always descend for heading, ordinary nested short-circuit for the two shared participants" composition | Same |
| Enter inside heading content | CM6 default paragraph/line split — no Clutter Enter handler exists (§1); not independently re-verified whether the resulting new line retains "heading-ness" (this is exactly the kind of question CM6/lang-markdown's own reparse governs, not Clutter code) | CM6 core |
| Enter at heading boundaries (start/end of heading line) | Same — CM6 default | CM6 core |
| Backspace at heading start | CM6 default `deleteMarkupBackward` (from `@codemirror/lang-markdown`'s own keymap) — this is the one case in scope where an *upstream library* (not Clutter, not bare CM6 core) contributes special Markdown-aware Backspace behavior (e.g. deleting a heading's `#` marker in one step at the very start). Recorded explicitly here since the brief asks not to skip CM6-owned behavior just because it's not customized. | `@codemirror/lang-markdown` |
| Delete at heading end | CM6 default `deleteCharForward` | CM6 core |
| ArrowLeft/Right around heading markers | CM6 default cursor motion; the marker itself is a `Decoration.replace({})` (zero-width, not atomic — `headingMarkerDecoration` never registers `atomicRanges`), so motion through a concealed-but-not-atomic marker still costs one keystroke per hidden character, same tradeoff pattern as WikiLink's folder-prefix concealment (§8) but for a different reason (headings were never made atomic; WikiLink's *whole node* is atomic only at rest, headings are never atomic in any state) | CM6 core + `headingMarkerDecoration`'s concealment (not atomicity) |
| Typing around heading markers | Ordinary CM6 insertion; typing at document position `node.from` (col 0, the physical line that's currently engaged) inserts before the `#` run, changing the marker text itself | CM6 core |
| Surrounding text before/after heading | Independent lines/paragraphs, no interaction | — |
| Selection involving heading markers/content | CM6 default selection mechanics; `headingMarkerDecoration` has no `atomicRanges` contribution, so a selection spanning into/through a concealed marker behaves like selecting through any other concealed-but-not-atomic zero-width range | CM6 core |

---

## 10. Horizontal-rule matrix

**[LIVE] confirmed** (§ initial screenshot): `---` alone on its own line, preceded and followed by blank-adjacent paragraph lines, rendered as a thin divider with no visible dash text once the caret moved off that line.

**[CODE]** Underlying document representation: a real physical line containing the literal marker text (`---`, `***`, `___`, or one of the three Clutter variants `~---~`/`=---=`/`.---.`) — never removed from the document, never widget-replaced with a foreign DOM node (explicitly contrasted with WikiLink in the file's own doc comment: "no foreign widget, no replacement DOM node, the real Markdown text stays in place throughout"). At rest, `Decoration.line({class: 'cm-hr-line*'})` collapses that line's box metrics via CSS (`font-size`/`line-height: 0`, in `MarkdownEditor.css`) and `Decoration.replace({})` hides the marker text itself; engaged, neither decoration is applied and the raw marker renders at normal size.

| Operation | Behavior | Owner |
|---|---|---|
| ArrowLeft/Right approaching HR from adjacent lines | CM6 default line-boundary motion; HR's line has no `atomicRanges` registration, so it is not skipped/hopped — the caret can land on it via ordinary Up/Down or Left/Right-across-line-boundary motion like any line | CM6 core |
| ArrowUp/Down | CM6 default visual-line motion; landing on the (collapsed-looking) HR line is possible, at which point `isRuleEngaged` immediately flips to true (selection now on that physical line) and the line "expands" to show raw marker text on the same render pass | CM6 core + `horizontalRuleDecoration`'s engagement re-evaluation |
| Enter before HR | Ordinary CM6 paragraph/line split on the line before it; HR itself is a separate line, unaffected | CM6 core |
| Enter after HR | Same, on the following line | CM6 core |
| Backspace before HR (i.e., at the start of the line right after HR, backspacing into HR's own newline) | CM6 default: merges the two lines per ordinary Backspace-at-line-start behavior; no `atomicRanges` protects HR from this — a single Backspace here removes the newline and merges HR's raw text onto the same line as whatever followed it (mechanically ordinary, but worth flagging since it means "delete the newline right after an HR" is not specially protected the way WikiLink's node is) | CM6 core, no Clutter protection |
| Backspace after HR (from inside HR's own line) | Ordinary character deletion through the (collapsed-at-rest, revealed-once-engaged) raw marker text | CM6 core |
| Delete before/after HR | Symmetric to Backspace above, forward direction | CM6 core |
| Selection across HR | Ordinary CM6 selection spanning multiple lines including HR's; no atomic-range protection | CM6 core |
| Typing adjacent to HR | Ordinary insertion on the adjacent line; typing directly on HR's own line (once engaged) edits the raw marker text, which — if the edit breaks the `---`/`***`/`___`/variant pattern — reparses as plain text on the next parse pass (no Clutter-side validation or correction) | CM6 core + reparse |

**Represented by a decoration/widget**: **decoration only, not a widget.** No `WidgetType`/foreign DOM node is ever involved for HR — this is the one in-scope construct whose at-rest form is a pure CSS/decoration collapse of real text, not a substituted rendered object (contrast directly with WikiLink, §8).

---

## 11. Selection behavior matrix

| Case | Behavior | Owner |
|---|---|---|
| Selecting text inside a construct (e.g. dragging within `**bold text**`'s content) | Ordinary CM6 selection; if the drag starts and ends strictly inside the node, the construct is engaged for the duration (selection containment), so the drag happens against raw visible text | CM6 core, `isTokenEngaged` engagement follows the live selection continuously |
| Selecting an entire construct (drag from just before to just after) | Ordinary CM6 selection; **[CODE]** no atomic-sweep correction exists for marker-hiding constructs (that mechanism, `tokenSelectionSnap.ts`, is dormant/unwired per the 2026-08-23 decision, and was scoped to the semantic-token/widget family, not marker-hiding constructs, even when it was wired) | CM6 core |
| Selecting across two constructs (`**bold** *italic*`, drag spanning both) | Ordinary CM6 range selection; both nodes independently re-evaluate engagement against the live selection on every update (`inlineLivePreviewRegion`'s `ViewPlugin.update` rebuilds on `selectionSet`) | CM6 core + independent per-node engagement |
| Selecting from inside to outside a construct | Same — no special boundary handling; the selection's `from`/`to` are simply outside the node's full-containment test once it exits, so the construct disengages at that instant | CM6 core |
| Selecting across a WikiLink (at rest, atomic) | **[CODE]**: per the "Verified against installed APIs" note, `atomicRanges` "does not prevent programmatic selection changes" — and per the 2026-08-23 decision, the drag-selection atomic-sweep corrector that used to force such a selection to snap to the WikiLink's boundary was removed. So today, a drag that starts before and ends partway through an at-rest WikiLink's rendered widget footprint is governed by ordinary CM6/browser mouse-selection mechanics against that widget's DOM footprint, with **no Clutter correction** — **[LIVE] not independently re-tested via an actual mouse-drag gesture in this pass** (the `computer` tool used for live verification in this investigation drove clicks/keys, not sub-pixel drag gestures against the widget); flagged as an open empirical gap in this ODR (§17), not asserted as confirmed either way. | Unclear without a drag-specific test — see §17 |
| Replacing a selection (type-over) | Ordinary CM6 `EditorState.changeByRange` replace-selection semantics | CM6 core |
| Deleting a selection | Ordinary CM6 `deleteSelection` | CM6 core |
| Typing over a selection | Same as replace | CM6 core |

---

## 12. Multi-step sequences

**[LIVE]-informed for the general shape (undo grouping); individual sequence outcomes derived from §3/§4's rules** — every step in every sequence below routes through the same stateless, selection-derived engagement recomputation (`ViewPlugin.update` rebuilds `decorations`/`atomic` on every `docChanged`/`selectionSet`/`viewportChanged`, with no cached/stateful engagement flag anywhere in the codebase — confirmed by reading every `ViewPlugin.fromClass` in scope).

**Correction, since this statelessness was originally over-read as "multi-step sequences don't need individual verification"**: purity of `render(doc, selection)` and predictability of a *sequence's outcome* are two different claims. What's true: rendering at any single point in time depends only on the current `(doc, selection)` pair, with no separate cached engagement flag — there is no "stale decoration" failure mode to worry about. What does **not** follow from that: that a sequence's outcome can be inferred by inspection without carefully tracking what `selection` actually *is* after each step. Getting that arithmetic wrong is exactly the risk multi-step testing catches — not stale state, but a wrong assumption about where the caret lands. A concrete, live-discovered example (§4's WikiLink boundary correction, restated here because it's a sequence-shaped fact): deleting an ordinary, non-atomic character (e.g. a plain space) immediately after an at-rest WikiLink can leave the resulting caret exactly at that WikiLink's own `node.to`. Since `node.to` is, by the same inclusive-boundary rule established in §4, an intentionally-engaged position, the WikiLink rendering as engaged (raw) immediately after that deletion is the **expected** consequence of the existing, unmodified `isTokenEngaged` check — not a separate or surprising behavior. It is recorded here purely as a worked example of the general lesson: a sequence is worth tracing explicitly whenever an edit's resulting caret position could coincide with a construct's engagement boundary, because the render function being pure doesn't mean the human predicting the sequence correctly tracked where that boundary-coincidence would occur. One already-documented, explicitly-pinned exception to *pure* statelessness follows below (initial-load caret seeding), which is a different kind of exception (document *history* mattering, not selection-arithmetic).

**`**bold text**` sequence** (place caret inside → Enter → Backspace → Delete → ArrowLeft → ArrowRight → type text → Enter again):
1. Caret inside → engaged, raw text visible (§4).
2. Enter → CM6 default paragraph split at that position; the resulting two lines are each independently reparsed — if the split leaves e.g. `**bold ` and `text**` on separate lines/paragraphs, `**bold ` is no longer a syntactically valid `StrongEmphasis` (no closing marker on its own line) and reparses as plain text with literal `**` characters, on both halves independently. This is an ordinary, unremarkable consequence of Markdown being the sole source of truth (per the architecture's own Locked foundational principle) — there is no "memory" of the original construct across the split.
3. Backspace/Delete on the resulting plain-text lines → ordinary character deletion (§3), no atomic behavior since the text is no longer inside a recognized `StrongEmphasis` node after step 2's reparse.
4–7. ArrowLeft/Right/typing/Enter again → all ordinary CM6 default behavior on whatever the document now contains.

**`**bold** *italic*` sequence** (navigate through → Backspace across boundary → Delete across boundary → type → Enter → continue typing → navigate back → repeat):
- Each construct is an independent sibling node (§6) — "navigating through" moves the caret via ordinary CM6 motion, crossing from an engaged `StrongEmphasis` through the plain-text space into an engaged `Emphasis`, with each independently (dis)engaging exactly at its own boundary (§4/§5), no coupling between them.
- Backspace/Delete across the boundary (i.e., at the space between them) is ordinary character deletion; if it deletes far enough to make the two constructs' text adjacent or merged, the next reparse determines whatever the resulting text's syntactic structure actually is — again, no "memory" of prior construct identity survives an edit that changes the underlying characters.

**Pinned, known state-dependent exception** (the one genuine "path matters" case in this codebase, **[CODE]**, from the decisions log, §"Emphasis (Bold/Italic) Live Preview — shipped"): a document whose content is (or ends with) exactly one emphasis-family construct loads with the caret at `doc.length` (`createEditorView.ts` seeds `selection: {anchor: doc.length}`), which sits on that construct's own boundary and — per `isTokenEngaged`'s inclusive `<=`/`>=` check (§6) — counts as engaged. So that construct renders as raw source on initial load and stays that way until the caret moves, even though "just opened this document, never touched it" and "just typed this and haven't moved the caret yet" are indistinguishable to a pure function of `(tree, selection)`. This is explicitly documented as a known, deliberately-deferred limitation, not a bug being tracked for a fix, and is the one case in scope where document *history* (was this freshly typed vs. freshly loaded) would matter but isn't and can't be observed by the current mechanism.

---

## 13. Current CM6/`@codemirror/lang-markdown` behavior (summary)

- Enter, Backspace, Delete, Tab, Shift-Tab, all Arrow keys, Home, End, modifier-assisted movement, selection creation/deletion/replacement, and normal typing are CM6 core defaults for every in-scope construct, full stop — no Clutter transaction filter, change filter, or competing keymap entry exists anywhere in the wired extension list (§1).
- `@codemirror/lang-markdown` contributes its own Markdown-aware keymap entries (`insertNewlineContinueMarkup`, `deleteMarkupBackward`) at the language level — upstream library behavior, most visible for block constructs (lists/blockquotes, out of scope here) but also touching heading Backspace-at-start (§9).
- `indentWithTab`, `closeBracketsKeymap`, `historyKeymap`, `foldKeymap`, `defaultKeymap` (from `createEditorView.ts`'s own final, lowest-precedence `keymap.of(...)`) supply every other binding actually in effect.
- `closeBrackets()` auto-closes `()`/`[]`/`{}`/quotes, confirmed (per the file's own comment) not to corrupt WikiLink's `[[`/`]]` typing (auto-close + type-over-skip cancel out to the same result).
- `atomicRanges` (a documented CM6 primitive, not a Clutter invention) is the *only* point where Clutter code changes the effective behavior of a default command, and only for the widget-replace family (WikiLink at rest in scope; Tag/Date at rest out of scope but same mechanism).

## 14. Current Clutter-specific behavior (kept deliberately minimal, per the brief)

1. **`Mod-B`/`Mod-I`/`Mod-E` toggle-wrap keymap** (`formatShortcutsKeymap.ts`) — the only Clutter-authored keyboard binding in the entire editor. Wraps/unwraps the selection in `**`/`*`/`` ` ``. Does not touch Enter/Backspace/Delete/Tab/Arrow.
2. **`atomicRanges` scoped to the widget-replace family at rest** (WikiLink in scope) — makes CM6's own default cursor-motion/deletion commands treat the whole node as one step, per §3.
3. **WikiLink's folder-prefix concealment persisting through the engaged state** — the one in-scope construct whose engaged form is not fully raw source (§8).
4. **Heading content classing as an always-descending, non-engagement-gated branch** inside the shared traversal (§9) — a deliberate structural choice (not a per-construct keyboard behavior) to keep nested participants independently engageable regardless of heading engagement.
5. **Click-to-navigate/activate** on WikiLink and Link/Autolink/URL (mouse, not keyboard — included here only because the brief's ownership question spans both) — product interaction, explicitly not a cursor/selection behavior per the locked 2026-08-23 decision.

Everything else in scope — every keyboard operation on plain text, bold, italic, strikethrough, highlight, inline code, headings, and horizontal rules, and every keyboard operation on Link/WikiLink except the two atomic/concealment facts above — is unmodified CM6/`@codemirror/lang-markdown` default behavior.

## 15. Obsidian differences

Only one was named in the task's own briefing:

| Clutter | Obsidian | Mechanism | Status |
|---|---|---|---|
| Enter inside inline formatting (`**bold| text**`) performs the ordinary CM6 paragraph split; the two resulting fragments reparse independently | Inline formatting is preserved across the split (each resulting line re-wrapped in the same marker) | Clutter: CM6 default, no Clutter code involved (§13). Obsidian: a deliberate, non-default plugin-level behavior — not investigated further here | **Resolved, per product discussion (see §16): not treated as a general open design decision.** Normal formatting already preserves correctly in the current editor for the general case. The `==[[...]]==` case originally flagged here as a separate, narrower issue was re-tested after a subsequent WikiLink fix and confirmed working — see §16 item 5 for the resolution record. |

No other Obsidian comparison was performed in this pass — the brief scoped Obsidian comparison to "if Obsidian behaves differently, record it," and no other concrete Obsidian behavioral claim was investigated or asserted here. Treat the absence of other entries as "not investigated," not "no other differences exist."

## 16. Decisions

Product/design questions raised by this ODR (originally listed as "Open decisions" in §16) were reviewed and decided one-by-one in a follow-up discussion. This section records what was decided and what remains genuinely open — no new investigation was performed to produce it.

### Resolved

1. **Engagement gesture / boundary discoverability** ("press again at the boundary" felt-experience) — **leave current behavior as-is.** No new gesture or intervention.
2. **Arrow-key hop/boundary-landing mechanism for the semantic-token family** (WikiLink/Tag/Date) — **decided: no custom semantic-token navigation.** Arrow keys remain character-by-character, per §3/§13/§18's existing CM6-default description. Do not add a hop mechanism.
3. **Bare URL/Autolink at-rest treatment** — **decided: raw URLs remain fully visible as ordinary text.** No special rendering, concealment, or widget treatment.
4. **WikiLink-inside-Link-label false-widening bug** (§7) — confirmed as a known technical finding, but **not being fixed as part of this ODR's work.** Investigation/fix is deferred until the relevant mixed/nested-construct work.
5. **Enter inside inline formatting** (§15) — **not treated as a general open design decision.** Normal formatting already preserves correctly in the current editor. The `==[[...]]==` case, originally flagged as a specific construct-combination issue to investigate separately after this ODR, was re-tested after a subsequent WikiLink fix landed and is now confirmed working correctly. The observed failure was downstream of that WikiLink bug, not caused by `==` (Highlight) formatting itself — no `==`-specific root cause was ever established, and none was needed once the WikiLink fix resolved it. No separate investigation, implementation, or special-case handling for the `==` + WikiLink combination is required. General Enter behavior remains unchanged.
6. **Tab / Shift-Tab** — **leave current behavior unchanged**; it already behaves as expected/Obsidian-like. Confirmed: CM6 owns it (§3, §13).
7. **Delete at WikiLink boundaries** — **decided: CM6 owns it; no Clutter-specific behavior.** (The underlying single-step-deletion mechanics remain a technical verification item — see §17's kept-open list — this is the separate product-level decision that no *additional* Clutter behavior is wanted here regardless of how that verification resolves.)
8. **Backspace at WikiLink boundaries** — same decision as Delete: **CM6 owns it; no Clutter-specific behavior.**
9. **WikiLink adjacent deletion → resulting caret at `node.to` → WikiLink becomes engaged** (§12) — **recorded as an observed technical fact only; not being fixed.** Its desirability does not need to become an implementation task.

### Still open — no decision made

These remain genuinely unresolved. They are carried forward, not decided here, and not to be treated as settled by omission:

- **Case-sensitivity of WikiLink path matching**, relative to `VaultPath`'s actual behavior.
- **Folder-path targets** (`[[Projects]]` where `Projects` is a folder, not a page).
- **Empty local alias** (`[[path|]]`) display-equivalence to "no local alias."

None of these are keyboard/caret behavior specifically — they're carried from `docs/editor-architecture-decisions.md`'s own standing "Open" set, which this ODR's scope overlaps with.

## 17. Unknowns requiring further investigation

**Kept explicitly open — these are technical/verification gaps, not decided or closed by the product discussion in §16, and none should be treated as an implementation task on the strength of being listed here:**

1. **Drag-selection behavior against an at-rest WikiLink's rendered widget footprint** (§11) — not empirically re-tested with an actual mouse-drag gesture in this pass; derived only from the documented fact that `atomicRanges` doesn't constrain selection and that the prior corrective mechanism is unwired. A real drag-gesture test (not available via the automation tools used in this investigation, which drove discrete clicks/keys rather than continuous drag coordinates) would confirm the actual landing behavior.
2. **Exact resulting document text of Enter-mid-construct for every in-scope construct** (§12) — derived from CM6's documented default paragraph-split semantics plus the observation that no Clutter code intercepts it; not individually re-keystroked and diffed against the resulting `state.doc` for all 8 constructs (bold/italic/strike/highlight/code/link/heading/HR) in this pass, since none of the code paths differ per construct (there is exactly one Enter-handling code path, CM6's own, for all of them).
3. **IME composition behavior** near concealed markers/atomic widgets — explicitly flagged as unresolved in the decisions log itself ("not resolved by research alone … needs direct manual testing"), and not tested in this pass either.
4. **Whether the WikiLink-inside-Link-label widening bug (§7) also affects Tag/Date** (out of scope for this ODR's requested minimum, but the same `isDelimitedMarkConstruct` structural check is shared machinery) — not investigated.
5. **Precise selection/click behavior at the exact pixel boundary of a collapsed HR line** (§10) — the line's collapsed CSS metrics (`line-height: 0`) make its actual clickable/selectable footprint a genuine open question not resolved by reading the code alone; not live-tested with pixel-precise clicks in this pass.
6. **Whether Backspace/Delete/Arrow actually produce the `atomicRanges`-governed single-step behavior described in §3, for WikiLink specifically** (added per audit) — the [CODE]-level inference is strong (this is exactly what `EditorView.atomicRanges` is documented to do to CM6's default commands), but per the methodology note above, this session's tooling could not reliably dispatch synthetic non-character keys, so it was never actually keystroke-confirmed. Needs a differently-instrumented test (e.g. a Vitest-level `EditorView` test dispatching a real transaction) rather than another browser-automation attempt.

## 18. Explicit areas where we should NOT customize CM6 yet

Per the task's own instruction not to convert observations into requirements, consistent with the architecture's already-Locked 2026-08-23 "CodeMirror owns cursor and selection behavior" decision, and now reinforced by the §16 product decisions:

- Enter/Backspace/Delete/Tab/Shift-Tab/Arrow behavior on any in-scope construct — **decided (§16)**, not merely un-investigated: no Clutter override for any of these. The existing bespoke Arrow-hop/selection-snap mechanisms were already tried, found unnecessary against today's decoration set, and deliberately reverted; §16 confirms no hop mechanism is wanted going forward either.
- Formatting preservation across Enter splits (§15) — **decided (§16)**: not a general Enter-behavior change. The one narrower, specific case (`==[[...]]==`) originally called out here as a separate future investigation is now resolved (§16 item 5) — it was a symptom of the WikiLink bug, fixed alongside that fix, not a reason to touch general Enter behavior.
- Delete/Backspace at WikiLink boundaries — **decided (§16)**: CM6 owns it, no Clutter-specific behavior wanted, independent of how the still-open technical verification in §17 resolves.
- Any drag-selection "atomic sweep" correction for WikiLink or the marker-hiding family — dormant code exists (`tokenSelectionSnap.ts`, `liveMarkSelectionSnap.ts`'s heading-only current use) but re-wiring it should wait for a concrete, evaluated need per the same standing decision; not decided against outright, but not something to build now.

---

## Summary lists (per brief, §17 of the task)

**A. CM6-owned behavior we should probably leave alone**
- Enter/Backspace/Delete/Tab/Shift-Tab/Arrow/Home/End/modifier-motion for every in-scope construct (plain text, bold, italic, strike, highlight, code, link, WikiLink-engaged, heading, HR).
- Selection creation/deletion/replacement and normal typing, everywhere in scope.
- `@codemirror/lang-markdown`'s own Backspace-at-heading-start behavior.
- `indentWithTab`/`closeBrackets`/history/fold keymaps.

**B. Clutter-specific behavior that currently exists**
- `Mod-B`/`Mod-I`/`Mod-E` toggle-wrap keymap.
- `atomicRanges` scoping to WikiLink-at-rest (in scope; Tag/Date-at-rest out of scope but same mechanism).
- WikiLink's folder-prefix concealment persisting through the engaged state.
- Heading content classing as an unconditional, non-engagement-gated branch inside the shared traversal.
- Click-to-navigate/activate for WikiLink/Link/Autolink/URL (mouse, not keyboard).

**C. Potential Clutter-specific behavior worth evaluating later**
- A drag-selection atomic-sweep correction for at-rest WikiLink, if the unknown in §17.1 turns out to produce a bad result once actually tested — not decided against, genuinely contingent on that verification.
- Fixing the WikiLink-inside-Link-label false-widening bug (§7) — known, **decided (§16): deferred until the relevant mixed/nested-construct work**, not evaluated as a standalone item.

Two items previously listed here are now decided, not merely "worth evaluating later" — see §16: Enter-inside-inline-formatting preservation (not a general design change) and an Arrow-hop/boundary-landing mechanism for the semantic-token family (decided against; no custom navigation).

**D. Unknowns that require further investigation**
- Drag-selection behavior against an at-rest WikiLink widget (§17.1).
- IME composition near concealed markers/atomic widgets (§17.3).
- Pixel-precise click/selection behavior at a collapsed HR line's boundary (§17.5).
- Whether the Link-label widening bug also reaches Tag/Date (§17.4).
- Whether Backspace/Delete actually produce `atomicRanges`-governed single-step deletion for at-rest WikiLink — [CODE]-derived, not keystroke-confirmed by this session's tooling (§17.6).
