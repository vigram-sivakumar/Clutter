# Obsidian vs. Clutter Editor — Architecture Audit (Pass 2)

**Status: RESEARCH ONLY. No production TS/TSX, CSS, grammar, tests, or editor behavior were modified to produce this document.**

**Superseded (2026-08-27, later same day) — this document's central "do not migrate markers to widgets" verdict (§1, §24(G)) has been reversed; Clutter has migrated.** Not because this pass's PROVEN source-level facts were wrong — they weren't — but because its *inference* from those facts to a predicted user-visible degradation was never tested against reveal-on-engagement, and turned out not to hold once it was. See §24(G)'s own superseding note (bottom of that section) for the full reconciliation, and `docs/editor-architecture-decisions.md`'s `Decoration.replace()`-with-widget entry for why the migration happened at all (a real, measured bug this pass was not evaluating — a `Decoration.mark`+CSS-shrink concealment technique cannot get both selection-rectangle geometry and horizontal layout width correct at once). This document is kept as-is below (not rewritten) as the historical record of a careful, source-grounded analysis that was nonetheless incomplete on one point — read the superseding note in §24(G), not just this banner, before treating any individual claim below as still-current guidance.

Supersedes Pass 1 of this file. Pass 1's central recommendation ("replace near-zero-font-size marker text with a widget whose `toDOM()` renders the marker text") is **withdrawn as a recommendation and demoted to an OPEN question** — see §1 and §24(G). The reason is not stylistic: tracing the installed CodeMirror 6 source produced PROVEN facts that Pass 1 did not have, and those facts break the recommendation's central assumption.

---

## 1. Executive verdict

**Clutter's editor architecture is sound, and its single greatest architectural asset is the thing Pass 1 almost talked it out of: Clutter runs very close to native CodeMirror 6.**

Six findings drive this pass:

1. **`cm-widgetBuffer` is not an Obsidian invention.** It is generic `@codemirror/view` machinery. PROVEN by reading the installed source. Every conclusion Pass 1 drew from "Obsidian does X" collapses into "CodeMirror does X for any application that uses `Decoration.replace({widget})`" — including Clutter's own WikiLink/Tag/Date widgets today. There is no Obsidian technique to adopt here.
2. **A widget-based marker would make interior marker positions visually degenerate.** PROVEN from source: `EditorView.moveByChar` steps through document positions with no knowledge of decorations, while `WidgetTile.coordsIn` collapses *every* position inside a widget to one of the widget's two edge rects. For a 2-character marker like `**` that is three logical positions mapping to at most two visual coordinates. Real text — even at `0.05px` — produces distinct per-character rects. **The current mechanism is better on this axis, not worse.**
3. **The only way to fix that degeneracy is `atomicRanges`, which Clutter has already Locked as forbidden for ordinary formatting markers** (whole-marker deletion in one Backspace — a bug pattern the original audit named). So the widget path forces a choice between two known-bad outcomes.
4. **CodeMirror itself contains an explicit Safari zero-width-rect workaround** (`if (browser.safari && !flatten && rect.width == 0) rect = Array.prototype.find.call(rects, r => r.width) || rect`). PROVEN. This reframes the WebKit history: Clutter was not doing something exotic that CM6 never anticipated — it was operating right at a boundary CM6 already knows is hazardous and already partially compensates for.
5. **Clutter's override surface is genuinely minimal and almost entirely justified.** A full grep of every interception point the brief named found exactly four non-trivial items, three of which are Markdown semantics rather than editor behavior.
6. **Two real, previously-unnamed defect risks were found**, both from the hostile CSS audit rather than from Obsidian: a wired `font-size: 0` on horizontal-rule lines that is the *exact* CSS pattern proven to break WebKit ArrowDown, and a `transactionFilter` selection override for blockquote whose stated justification no longer matches blockquote's current implementation.

**Verdict: keep the architecture. Do not migrate markers to widgets. Fix the two newly-found risks. Formalize CM6-first as a locked invariant.**

---

## 2. Evidence and confidence model

Four levels, used literally throughout:

- **PROVEN** — read directly from installed source in this repository (`node_modules/@codemirror/view@6.43.9`, `@codemirror/state@6.7.1`, `@codemirror/commands@6.11.0`, `@codemirror/language@6.12.4`, `@lezer/markdown@1.7.2`) or from Clutter's own source files.
- **OBSERVED** — established from actual runtime DOM/behavior. In this pass that means: the Obsidian DOM snippet supplied by the user, and prior Clutter investigations recorded in `docs/tauri-webkit-editor-issues.md` / `docs/editor-architecture-decisions.md` that were themselves conducted against real browsers. **No new runtime observation was performed in this pass** — no browser was driven, no editor was mounted. That is a real limitation and is why §22/§23 exist.
- **STRONGLY INFERRED** — supported by multiple consistent PROVEN/OBSERVED signals, but not directly confirmed.
- **UNKNOWN** — cannot be determined from available material.

**What was supplied for Obsidian, restated because it bounds everything in §4:** one `.cm-content` DOM snippet (five lines, `==highlight==` cases only) and one block of `:root` CSS custom properties. **No Obsidian editor CSS rules, no JS, no source, no engaged-state markup, no heading/list/blockquote/link/code markup, no behavior recordings.** Obsidian's version and active plugin set are UNKNOWN.

---

## 3. Clutter architecture map

**Evidence:** direct source read of every file under `apps/app/src/features/markdown/editor/`. **Confidence: PROVEN.**

### 3.1 Foundation (`createEditorView.ts`)

Stock CM6, with an unusually restrained extension list: `drawSelection`, `EditorView.lineWrapping`, `history`, `allowMultipleSelections`, `highlightSpecialChars`, `dropCursor`, `closeBrackets`, `codeFolding`, `foldGutter`, `highlightActiveLine`, and one lowest-priority `keymap.of([indentWithTab, ...closeBracketsKeymap, ...historyKeymap, ...foldKeymap, ...defaultKeymap])`. Folding consumes `foldNodeProp` data that `@codemirror/lang-markdown` supplies for free — no Clutter-authored fold detection. The file even documents which standard CM6 extensions were deliberately *not* wired (`bracketMatching`, `rectangularSelection`, `crosshairCursor`) and why.

**Implication:** cursor motion, selection, editing mechanics, transactions, undo/redo, scrolling, and viewport management are 100% CM6-owned. This is the baseline the brief asks to protect, and it is currently intact.

### 3.2 Decoration inventory (PROVEN, by grep of every `Decoration.*` call site)

| File | Primitive(s) | Wired? |
|---|---|---|
| `inlineLivePreviewParticipants.ts` | `mark` (content + markers), `replace({})` (Link/Autolink markers), `replace({widget})` (Tag/Date) | **yes** |
| `inlineLivePreviewRegion.ts` | `set`, `atomicRanges` (widget family only) | **yes** |
| `wikiLinkLivePreview.ts` | `replace({widget})`, `replace({})`, `atomicRanges`, `Prec.high` | **yes** |
| `blockquoteMarkerDecoration.ts` | `mark` (marker + content, `--concealed` modifier) | **yes** |
| `blockquoteLineDecoration.ts` | `line` | **yes** |
| `headingMarkerDecoration.ts` | via `liveMarkDecoration` → `replace({})` + `liveMarkSelectionSnap` | **yes** |
| `horizontalRuleDecoration.ts` | `line` (4 variants) + `replace({})` | **yes** |
| `leadingIndentDecoration.ts` | `mark` | **yes** |
| `listMarkerDecoration.ts` | `replace({widget})`, `atomicRanges` | dormant |
| `listLineDecoration.ts` / `listIndentWhitespaceDecoration.ts` | `line` / `replace` | dormant |
| `tableDecoration.ts` | `line`, `mark`, `Prec.lowest` | dormant |
| `emojiListMarkDecoration.ts` | `mark` | dormant |

Four `WidgetType` subclasses exist: `WikiLinkWidget`, `TagWidget`, `DateWidget`, `TaskCheckboxWidget`. All four implement `eq()` (content-based, correct for reuse) and `ignoreEvent()` (letting `mousedown` through to `domEventHandlers`). Three of four set `role` + `aria-label`. **PROVEN.**

### 3.3 Concealment mechanisms — four coexisting patterns

| Pattern | Used by | Concealment | Real text in DOM? |
|---|---|---|---|
| `Decoration.mark` + `font-size: 0.05px; line-height: 1` | Emphasis, StrongEmphasis, Strikethrough, Highlight, InlineCode | shrink | yes |
| `Decoration.mark` + `color: transparent` | Blockquote `QuoteMark` | transparent, full width reserved | yes |
| `Decoration.replace({})` | Heading `HeaderMark`, Link/Autolink marks, HR rule text | removed | **no** |
| `Decoration.replace({widget})` + `atomicRanges` | WikiLink, Tag, Date, Task | replaced | no |

This four-way split is deliberate and documented (`markdown-dom-structure-agreement.md` §1.7 explicitly refuses to force uniformity). It is defensible per-construct. It is also the single largest cognitive load in the codebase — see §19.

---

## 4. Obsidian architecture map

**Evidence:** the supplied DOM snippet only.

- **`data-language="hypermd"` on `.cm-content`.** Obsidian's editor is CodeMirror 6; its Markdown mode is named `hypermd`. **PROVEN** (literal attribute).
- **Concealed `==` renders as `<img class="cm-widgetBuffer" aria-hidden="true"><span contenteditable="false"></span><img class="cm-widgetBuffer" aria-hidden="true">`.** **PROVEN** (literal markup). The marker characters are absent from the DOM.
- **Content renders as `<span class="cm-highlight">highlighted</span>`.** **PROVEN.**
- **Nested `**==x==**` renders as one flat `<span class="cm-highlight cm-strong">`, with the two marker pairs as separate widget groups outside it.** **PROVEN.**
- **`=text==` (a 1-char opening run) renders as fully plain text.** **PROVEN** — the parser rejected it; consistent with a `>= 2` minimum-run gate, same as Clutter's own.
- **Empty line renders `<div class="cm-line" dir="ltr"><br></div>`** — stock CM6, identical to Clutter. **PROVEN.**

### 4.1 The `cm-widgetBuffer` question, answered definitively

The brief asks whether the buffer pattern is (1) Obsidian-specific, (2) generic CM6, (3) HyperMD, or (4) a combination.

**Answer: (2), generic CM6. Not Obsidian, not HyperMD.**

**Evidence — `node_modules/@codemirror/view/dist/index.js`, PROVEN:**

```js
// These are drawn around uneditable widgets to avoid a number of
// browser bugs that show up when the cursor is directly next to
// uneditable inline content.
class WidgetBufferTile extends Tile {
    constructor(flags) {
        let img = document.createElement("img");
        img.className = "cm-widgetBuffer";
        img.setAttribute("aria-hidden", "true");
        super(img, 0, flags);
    }
    get isHidden() { return true; }
    get overrideDOMText() { return Text.empty; }
```

Its theme rule, also from CM6's own `baseTheme`:

```js
".cm-widgetBuffer": { verticalAlign: "text-top", height: "1em", width: 0, display: "inline" },
```

And the insertion rule, in `addInlineWidget`:

```js
// Adjacent same-side-facing non-replacing widgets don't need buffers between them
let noSpace = this.afterWidget && (widget.flags & PointWidget) && (this.afterWidget.flags & PointWidget) == (widget.flags & PointWidget);
if (!noSpace) this.flushBuffer();
let parent = this.ensureMarks(marks, openStart);
if (!noSpace && !(widget.flags & Before)) parent.append(this.getBuffer(1));
```

And the `contenteditable="false"` on Obsidian's span is likewise CM6's, not Obsidian's:

```js
static of(widget, view, length, flags, dom) {
    if (!dom) {
        dom = widget.toDOM(view);
        if (!widget.editable) dom.contentEditable = "false";
    }
```

**Implication:** the entire visual signature Pass 1 read as "Obsidian's superior technique" is what CM6 emits for *any* `Decoration.replace({widget})`. **Clutter already produces byte-equivalent DOM around its own WikiLink, Tag, Date, and Task widgets today.** There is no Obsidian technique here to adopt. **Confidence: PROVEN.**

**Recommendation:** delete "adopt Obsidian's buffer pattern" from consideration entirely. It is not a differentiator.

### 4.2 The flat-multi-class question

The brief asks whether `<span class="cm-highlight cm-strong">` is an architectural advantage or an artifact of Obsidian's decoration pipeline.

**Evidence:** CM6's own `Decoration.mark` doc states nesting order is determined by facet precedence and that elements are "split on... the boundaries of lower-precedence decorations." Clutter's own `editor-architecture-decisions.md` records empirically that **decorations produced within one shared `Decoration.set()` compose differently from decorations produced by independent extensions.** Clutter deliberately keeps its inline participants in one shared set for exactly this reason.

**Analysis:** two same-range `Decoration.mark`s from the *same* source can be merged by CM6 into one element with both classes — which is precisely the shape Obsidian's DOM shows. That makes flat-multi-class most likely a **consequence of single-source decoration with coincident ranges**, not a deliberate architectural strategy.

**Confidence: STRONGLY INFERRED.** The supplied evidence does not establish Obsidian's decoration pipeline. Critically, `**==x==**` is a *range-coincident* case (highlight content and strong content occupy identical ranges); the snippet contains **no** partially-overlapping case (`**bold _and_ italic**`, `~~**bold strike**~~` with differing extents, links+formatting, code+formatting), so whether Obsidian flattens in general or only when ranges coincide is **UNKNOWN**. Every deeper combination the brief lists (`***bold italic***`, `~~==**deeply nested**==~~`, wikilinks+formatting, tags+formatting, block+inline) is **UNKNOWN** — none appear in the supplied material.

**Recommendation:** do not treat flat-multi-class as a target. Clutter's true-nesting composition is the more general model (it expresses partial overlap, which flat classing on one element structurally cannot), and Clutter's own real regressions here were about *precedence between independent sources*, not about nesting itself.

---

## 5. Native CodeMirror 6 Baseline

**This is the governing section. Every proposal elsewhere in this document must answer to it.**

### 5.1 What CM6 gives Clutter for free (PROVEN from installed source)

| Capability | CM6 mechanism | Notes |
|---|---|---|
| Horizontal caret motion | `moveByChar` → `moveVisually` over bidi spans | Operates on **document text and bidi spans only** — decorations are not consulted |
| Word motion | `moveByGroup` → `byGroup` + `state.charCategorizer` | Locale-aware categorizer |
| Vertical caret motion | `moveVertically` → `coordsAtPos` + `posAtCoords` scan | Geometry-driven; see §8 |
| Line boundary (Home/End) | `moveToLineBoundary` | Wrap-aware |
| Atomic skipping | `skipAtomicRanges` / `skipAtomsForSelection` | Applied to `moveByChar`, `moveByGroup`, `moveVertically`, and selection |
| Bidi/RTL | `view.bidiSpans(line)`, `textDirectionAt`, `BidiSpan.find`, bidi-aware binary search in `InlineCoordsScan` | Fully built in |
| DOM ↔ position mapping | `Tile` tree; `coordsIn` per tile kind; `posAtCoords`; `domAtPos`/`posAtDOM` | |
| Widget buffering | `WidgetBufferTile` | §4.1 |
| Widget `contenteditable=false` | `WidgetTile.of` | Automatic |
| Copy through widgets | `WidgetTile.overrideDOMText` returns `doc.slice(start, start+length)` | Copy yields **source text**, not widget text — PROVEN |
| Widget reuse / churn control | `widget.eq()`, `updateDOM()`, tile cache `find`/`maybeReuse` | |
| Composition/IME | `TileFlag.Composition`, `addComposition` path | |
| Line-height/char measurement | `measureTextSize` → `heightOracle.refresh` | §7.2 |
| Safari zero-width-rect compensation | explicit `browser.safari` branch in `TextTile.coordsIn` | §11 |
| Markdown Enter/Backspace | `insertNewlineContinueMarkupCommand`, `deleteMarkupBackward` | `@codemirror/lang-markdown` |
| Markdown folding | `foldNodeProp` | Free with the language |

### 5.2 What Clutter currently overrides — complete inventory

Every interception point the brief listed was grepped across the editor tree. **Nothing else was found.** This is the entire override surface:

| # | Override | Category | Necessary? |
|---|---|---|---|
| 1 | `markdownEnterKeymap()` — `Prec.high` Enter + Backspace, replacing `markdownKeymap` (`addKeymap: false`) | **Markdown semantics** | **CM6 provides the primitive; Markdown requires a legitimate extension.** The file documents three measured gaps against `@codemirror/lang-markdown@6.5.2`: (a) tight-list blank-item behavior, solved by *configuring* upstream's own `nonTightLists: false` flag, not reimplementing; (b) blockquote single-press exit, solved by *delegating* to CM6's own `deleteMarkupBackward`; (c) indentation-only continuation lines, the one case with no CM6 primitive at all and the only place editing the document directly. Both custom handlers return `false` outside their narrow case. Backspace is bound to CM6's unmodified `deleteMarkupBackward`. **This is close to the ideal shape for a justified override.** |
| 2 | `formatShortcutsKeymap()` — Mod-B/I/E | **Markdown semantics** | **CM6 does not provide this.** Justified. Pure `state.changeByRange` text transform with no rendering or engagement awareness. Binds keys CM6's `defaultKeymap` does not use. |
| 3 | `liveMarkSelectionSnap()` — `EditorState.transactionFilter`, scoped to `userEvent === 'select.pointer'` | **Editor behavior** | **Split verdict — see §5.3.** Justified for heading; **premise appears stale for blockquote.** |
| 4 | `*MouseHandlers` (`tokenMouseHandlers`, `taskCheckboxMouseHandlers`, `linkMouseHandlers`, …) — `EditorView.domEventHandlers` on `mousedown`, calling `posAtCoords`/`coordsAtPos`, `preventDefault()` on activation | **Product feature** | **CM6 does not provide this.** Justified — these implement *activation* (open a link, toggle a checkbox), a product behavior CM6 has no opinion about. They use `posAtCoords`/`coordsAtPos` as *readers*, never replacing CM6's own selection handling. `preventDefault()` fires only when an activation actually occurs. |

**Not found anywhere (confirmed absent):** custom `keydown`/`keyup`/`beforeinput`/`input` handlers, custom composition handling, custom Arrow/Home/End/word-movement bindings, custom Tab/Shift-Tab, custom clipboard/copy/paste, custom drag-selection, custom DOM-selection manipulation, custom `domAtPos`/`posAtDOM`, custom scroll or viewport handling, custom bidi handling, custom `changeFilter`, custom `inputHandler`, custom `WidgetType.coordsAt`, custom `updateDOM`.

The removed bespoke arrow-hop keymap and drag-selection snap (commit `58c7d9d7` and the follow-up audit) stay removed and unwired. `tokenSelectionSnap.ts` and the per-kind `*SelectionSnap.ts` files exist but are **not wired anywhere** — confirmed by grep.

**Evidence: PROVEN. Implication: Clutter's override surface is four items, three of which are not editor behavior at all. This is a genuinely strong position and should be locked as an invariant (§20).**

### 5.3 The one override worth challenging: `liveMarkSelectionSnap` for blockquote

**Evidence (PROVEN, from source):** the mechanism's own doc comment states its justification precisely:

> "The collapsed marker range renders zero pixels, so a click aimed at 'just past the last visible character' and a click aimed at 'the invisible marker that used to sit there' land on the exact same pixel... This is a pure DOM hit-testing artifact of **zero-width `Decoration.replace` ranges specifically** — WikiLink doesn't share it... its at-rest widget renders real, non-zero pixels, so a click at its edge is an ordinary unambiguous DOM boundary."

It is wired by `liveMarkDecoration.ts` (`return [decorations, liveMarkSelectionSnap(...)]`), which has exactly two live consumers: `headingMarkerDecoration` and — via `isPhysicalLineEngaged` — the blockquote family.

**The problem:** blockquote **no longer uses zero-width `Decoration.replace`.** Its 2026-08-27 migration moved it to `Decoration.mark` + `.cm-quote-marker--concealed { color: transparent }`, whose entire purpose is that *"the real character is always present, its natural rendered width is always reserved."* By the snap's own stated criterion — real, non-zero rendered pixels means an unambiguous DOM boundary — blockquote is now in the same category as WikiLink, which the comment explicitly says does *not* need this.

**Confidence: STRONGLY INFERRED** (the reasoning is proven; whether the snap is still *observably* doing anything for blockquote was not runtime-tested in this pass).

**Implication:** this may be a live `transactionFilter` overriding CM6's own pointer-selection result for a construct that no longer needs it — precisely the class of unnecessary editor-behavior override the brief asks to flag. Note the snap has already needed one blockquote-specific correction (the `'physical-line'` `markBoundaryRange` branch, added after a click landed the caret at document position 0), which is itself evidence of friction between this mechanism and blockquote's shape.

**Recommendation:** experiment E4 (§23). Do not remove without a runtime A/B. Heading's need is unaffected and remains justified — heading still uses `Decoration.replace({})`, still renders zero pixels, still has the real ambiguity.

### 5.4 Behavior matrix

"Native CM6" = PROVEN from installed source. "Obsidian" = UNKNOWN unless the DOM snippet establishes it, which for behavior it never does.

| Behavior | Native CM6 | Clutter | Obsidian | Custom Clutter code necessary? |
|---|---|---|---|---|
| ArrowLeft/Right | `moveByChar`→`moveVisually`, decoration-blind, then `skipAtoms` | unmodified | UNKNOWN | **NO** |
| ArrowUp/Down | `moveVertically`, geometry scan, then `skipAtoms` | unmodified | UNKNOWN | **NO** |
| Home/End | `moveToLineBoundary`, wrap-aware | unmodified | UNKNOWN | **NO** |
| Shift+Arrow | same primitives, range-extending | unmodified | UNKNOWN | **NO** |
| Word movement | `byGroup` + `charCategorizer` | unmodified | UNKNOWN | **NO** |
| Backspace | `deleteCharBackward`; `deleteMarkupBackward` for Markdown | CM6's `deleteMarkupBackward`, rebound only because `addKeymap:false` | UNKNOWN | **NO** (rebinding only) |
| Delete | `deleteCharForward` | unmodified | UNKNOWN | **NO** |
| Enter | `insertNewlineContinueMarkupCommand` | configured + 2 narrow handlers for measured gaps | UNKNOWN | **YES, narrowly** (Markdown semantics) |
| Tab / Shift+Tab | `indentWithTab` | unmodified | UNKNOWN | **NO** |
| Mouse click | native + `posAtCoords` | unmodified for selection; `mousedown` handlers for *activation* only | UNKNOWN | **NO** for selection; **YES** for activation |
| Drag selection | CM6, `userEvent: 'select.pointer'` | unmodified, except the snap in §5.3 | UNKNOWN | **NO** / see §5.3 |
| Copy | `overrideDOMText` yields source text | unmodified | UNKNOWN | **NO** |
| Paste | CM6 | unmodified | UNKNOWN | **NO** |
| Undo/Redo | `history()` + `historyKeymap` | unmodified | UNKNOWN | **NO** |
| IME | CM6 composition tiles | unmodified | UNKNOWN | **NO** |
| DOM ↔ position | Tile tree | unmodified (read-only use) | UNKNOWN | **NO** |
| Widget navigation | `atomicRanges` opt-in | opt-in for WikiLink/Tag/Date/Task only | UNKNOWN | **NO** |
| Selection around widgets | `skipAtomsForSelection` | as above | UNKNOWN | **NO** |

**Every row that is pure editor behavior answers NO.** That is the headline result of this section.

---

## 6. DOM audit

Additions beyond §3/§4 (Pass 1's construct-by-construct DOM table stands and is not repeated):

- **Clutter emits no `cm-widgetBuffer` for the inline marker family**, because that family uses `Decoration.mark` (real text), which produces `MarkTile`s, not `WidgetTile`s. It *does* emit buffers around WikiLink/Tag/Date/Task. **PROVEN.** Pass 1 framed the absence as "opted out of CM6's mitigation"; the correct framing is "chose a primitive that does not need it, because real text has real rects."
- **Marker spans are `MarkTile`s, and `MarkTile` children are excluded from CM6's own text measurement.** `measureTextSize` requires every child of a candidate line to satisfy `child.isText()`; a decorated line fails immediately. **PROVEN.** Consequence: CM6 never measures `textHeight` from a formatted line, so a 30px inflated line could not have poisoned the height oracle's `textHeight`. (Per-line heights *are* separately measured and passed to `oracle.refresh`, so variable line heights are handled.) This is a useful negative result: the 30px bug was a visual/geometry bug, not a height-oracle corruption.
- **`overrideDOMText` on `WidgetTile` returns the real document slice.** **PROVEN.** So copy/paste correctness across widgets is a CM6 guarantee, identical for both editors, and not a differentiator either way.

---

## 7. CSS / layout audit

### 7.1 New finding — P1: wired `font-size: 0` on horizontal-rule lines

**Evidence (PROVEN, `MarkdownEditor.css`):** `.cm-hr-line`, `.cm-hr-line-wavy`, `.cm-hr-line-double`, `.cm-hr-line-dotted` each declare `font-size: 0; line-height: 0`. `.cm-table-align-row` declares the same. `horizontalRuleDecoration()` **is wired** in `MarkdownEditor.tsx` (re-enabled 2026-08-25); `tableDecoration()` is dormant.

**Why this matters:** `font-size: 0` is the *exact* CSS value that `docs/tauri-webkit-editor-issues.md` Issue 1 proves causes Safari/WebKit to skip entire physical lines during CM6-owned ArrowDown. The mitigation adopted there (`0.05px`) was applied to `.cm-marker--concealed` only. These HR rules were never revisited.

**Mitigating factor:** the HR line's own raw text is removed via `Decoration.replace({})`, so unlike the marker case there may be no text run for the degenerate geometry to arise from — the line's content is a `BreakWidget`. **The two situations are not identical, and this is not a claim that the bug reproduces.**

**Confidence: the CSS pattern is PROVEN present and wired; whether it reproduces the Issue-1 defect is UNKNOWN.** It was never tested — the 13-line WebKit regression corpus in `tauri-webkit-editor-issues.md` contains no horizontal rule.

**Recommendation:** experiment E1 (§23) — highest priority in this document, because it is a *possible live shipping defect* rather than an architectural question.

### 7.2 Line-height

Restated with new evidence: `--lh-body: 24px` is absolute (`tokens.css:127`), applied on `.cm-content`. Obsidian's supplied `:root` declares `--line-height-normal: 1.5` with `--font-text-size: 16px` — relative, computing to the same 24px. **PROVEN both sides** (these are literal declarations). An absolute value must be kept in sync with `--text-body` by convention; a relative one cannot desynchronize. Real but low-severity.

`.cm-marker--concealed`'s `line-height: 1` fix stands and is correct — CSS2.1 half-leading around a near-zero glyph is standard behavior, not a browser quirk, and the fix is minimal and construct-agnostic.

### 7.3 Latent line-height inconsistency in dormant list code

`.cm-bullet-list-marker` sets `font-size: 1.2em; line-height: 1` (safe). `.cm-emoji-list-marker` sets `font-size: var(--text-label)` with **no** `line-height` — structurally the same setup as the fixed bug. Dormant, so not manifesting. **PROVEN** (CSS read). Flag for the list re-enable pass.

### 7.4 `.cm-list-line` `.cm-line` geometry

Still violates `markdown-dom-structure-agreement.md` §1.4's hard invariant via `padding-left`/`text-indent`. Still dormant. Already tracked in Clutter's own docs; repeated only to confirm it remains current.

### 7.5 Theme-layer correctness

`editorTheme.ts` overrides `.cm-activeLine` and `.cm-selectionBackground` through `EditorView.theme()` rather than static CSS, with a documented, empirically-verified reason (CM6 injects `baseTheme()` at construction time, after bundled CSS, so later source order wins). It also documents the `&`-prefix selector-compilation requirement, verified via `element.matches()` on a real node. **This is working *with* CM6's mechanism rather than fighting it, and is a positive finding**, not a risk.

---

## 8. Caret / selection audit — and the widget question

### 8.1 The decisive source-level finding

**`EditorView.moveByChar` does not consult decorations.** PROVEN:

```js
function moveByChar(view, start, forward, by) {
    let line = view.state.doc.lineAt(start.head), spans = view.bidiSpans(line);
    let direction = view.textDirectionAt(line.from);
    for (let cur = start, check = null;;) {
        let next = moveVisually(line, spans, direction, cur, forward), char = movedOver;
```

Only the outer wrapper applies atomicity:

```js
moveByChar(start, forward, by) { return skipAtoms(this, start, moveByChar(this, start, forward, by)); }
```

**`WidgetTile.coordsIn` collapses all interior positions to widget edge rects.** PROVEN:

```js
coordsInWidget(pos, side, block) {
    let custom = this.widget.coordsAt(this.dom, pos, side);
    if (custom) return custom;
    ...
    let rects = this.dom.getClientRects(), rect = null;
    if (!rects.length) return null;
    let fromBack = (this.flags & Before) ? true : (this.flags & After) ? false : pos > 0;
```

**`TextTile.coordsIn` produces real per-character rects.** PROVEN:

```js
let rects = textRange(this.dom, from, to).getClientRects();
if (!rects.length) return null;
let rect = rects[(flatten ? flatten < 0 : side >= 0) ? 0 : rects.length - 1];
if (browser.safari && !flatten && rect.width == 0)
    rect = Array.prototype.find.call(rects, r => r.width) || rect;
```

### 8.2 What this means for the widget-marker proposal

Take `**bold**`. Positions 0, 1, 2 sit within the opening marker.

**Current (real text at `0.05px`):** arrow-by-char visits 0, 1, 2. `TextTile.coordsIn` returns a genuine (sub-pixel-distinct) rect per position. Backspace deletes one `*`. Selection can land at 1. Everything the Markdown source expresses is reachable and individually addressable. This is behaviorally correct — just visually near-invisible.

**Widget marker WITHOUT `atomicRanges`:** arrow-by-char still visits 0, 1, 2 (motion is decoration-blind), but `WidgetTile.coordsIn` maps all three to the widget's left or right edge. Three logical positions, at most two visual coordinates. The caret would appear frozen for a keypress; `moveVertically`'s goal-column would be computed from a collapsed coordinate; click hit-testing could not distinguish 1 from 0 or 2. **This is a strictly worse degeneracy than the current mechanism, not a better one.**

**Widget marker WITH `atomicRanges`:** the degeneracy disappears — but `skipAtomicRanges` now makes the whole `**` a single deletion/motion unit. That is precisely the behavior `editor-architecture-decisions.md` Locked as forbidden for ordinary formatting markers, backed by a documented real-world CM6 bug report where broad `atomicRanges` turned ordinary character deletion into whole-span jumps.

**Evidence: PROVEN (all three mechanisms read from installed source).**
**Confidence in the conclusion: PROVEN for the mechanism; STRONGLY INFERRED for the felt-experience claim** (no runtime test was performed).
**Implication: Pass 1's recommendation trades a *tuned* problem for a *structural* one.**
**Recommendation: OPEN, leaning NO. See §24(G).**

### 8.3 Behavioral checklist for a hypothetical widget marker

| Concern | Assessment | Confidence |
|---|---|---|
| Cursor positions / affinity | **Regression** — interior positions collapse to edges | PROVEN mechanism |
| ArrowLeft/Right | **Regression** without atomic; **contract violation** with | PROVEN |
| ArrowUp/Down | goal column from a collapsed coordinate — likely regression | STRONGLY INFERRED |
| Home/End | unaffected (`moveToLineBoundary` is line-scoped) | PROVEN |
| Shift+Arrow | inherits the ArrowLeft/Right verdict | PROVEN |
| Mouse click / drag / hit testing | **Regression** — cannot resolve interior positions | PROVEN |
| Backspace / Delete | one-char delete works without atomic; whole-marker with | PROVEN |
| Word movement | `charCategorizer` is text-based, unaffected | PROVEN |
| Copy / paste | unaffected — `overrideDOMText` yields source | PROVEN |
| Undo / redo | unaffected — document-level | PROVEN |
| IME / composition | plausibly *better* (`contenteditable=false` island) | STRONGLY INFERRED |
| Native browser selection | plausibly better (widget excluded) | STRONGLY INFERRED |
| Line wrapping | UNKNOWN | UNKNOWN |
| Bidi / RTL | UNKNOWN — CM6 handles bidi for both; interaction with per-tile widget rects untested | UNKNOWN |
| Accessibility / screen readers | UNKNOWN for both (§10) | UNKNOWN |
| Spellcheck | plausibly better (`contenteditable=false` excluded) | STRONGLY INFERRED |
| Line-height stability | **improvement** — no glyph-metric participation | STRONGLY INFERRED |
| Safari / Chromium / Firefox | UNKNOWN — would need the full E2 sweep re-run | UNKNOWN |
| Zoom / DPR / font scaling | plausibly better (no subpixel threshold) | STRONGLY INFERRED |
| Nested / partially-engaged constructs | UNKNOWN — engaged-region marker walk assumes mark ranges | UNKNOWN |

**Net: 6 regressions or contract violations (mostly PROVEN), 6 plausible improvements (all INFERRED), 6 unknowns.** That distribution does not support an architectural recommendation.

---

## 9. Markdown construct matrix

Abbreviated to the 22 dimensions' load-bearing columns; every row is PROVEN from source. `—` = not applicable. Behavior columns marked *CM6* mean "unmodified CM6 default," which is the desired answer.

| Construct | Parser | Decoration | Concealment | Atomic | Cursor/Sel/Del/Undo | Wired | Notable risk |
|---|---|---|---|---|---|---|---|
| Plain text | — | none | — | no | CM6 | yes | none |
| Emphasis / Strong | Lezer | `mark`+`mark` | `font-size:0.05px` | no | CM6 | yes | subpixel threshold |
| Strikethrough | GFM | same factory | same | no | CM6 | yes | same |
| Highlight | Clutter `MarkdownConfig` | same factory | same | no | CM6 | yes | same |
| Inline code | Lezer | same factory | same | no | CM6 | yes | same |
| Link | Lezer | bespoke `linkRenderer` | `replace({})` | no | CM6 | yes | asymmetric marker; no marker span |
| Autolink | Lezer | shared factory, no `markerClass` | `replace({})` | no | CM6 | yes | out of §7.1 migration scope |
| Bare URL | Lezer | `urlRenderer` | none | no | CM6 | yes | parent-name guard is name-based |
| WikiLink | Clutter | standalone `Prec.high` | widget | **yes** | CM6 + `skipAtoms` | yes | `isDelimitedMarkConstruct` false-positive on `Link` (already documented, unfixed) |
| Tag / Date | Clutter | `widgetReplaceRenderer` | widget | **yes** | CM6 + `skipAtoms` | yes | none new |
| Heading | Lezer | `liveMarkDecoration` | `replace({})` | no | CM6 + **snap** | yes | snap justified |
| Blockquote | Lezer | `mark` + `line` | `color:transparent` | no | CM6 + **snap** | yes | **snap premise stale (§5.3)**; wrapped-row indent gap (known) |
| Thematic break (+3 Clutter variants) | Lezer + Clutter | `line` + `replace({})` | line CSS | no | CM6 | yes | **`font-size:0` (§7.1)** |
| Lists (bullet/ordered/nested) | Lezer | `replace({widget})` + `line` | widget | **yes** | CM6 + `skipAtoms` | **no** | §1.4 violation; emoji marker line-height |
| Task lists | Lezer | permanent widget | — (semantic UI) | **yes** | CM6 | decoration no, click yes | mouse handler wired without its widget |
| Tables | GFM | `line`+`mark`, `Prec.lowest` | `.cm-table-align-row` `font-size:0` | no | CM6 | **no** | same `font-size:0` pattern |
| Emoji list marker | Clutter | `mark` | none | no | CM6 | **no** | no `line-height` (§7.3) |
| Leading indent | — | `mark` `.cm-indent` | none | no | CM6 | yes | `inline-block` in text flow |
| Fenced/indented code blocks | Lezer | **none** | — | no | CM6 | n/a | **no Live Preview treatment at all** |
| Images / embeds | Lezer | **none** | — | — | CM6 | no | decided in-family, unimplemented |
| Hard breaks | Lezer | none | — | no | CM6 | n/a | untreated |
| Footnotes / HTML / comments | — | **not implemented** | — | — | — | no | out of scope today |

**Inconsistencies worth naming:** (a) four different concealment mechanisms across constructs; (b) two constructs (heading, blockquote) get a selection-snap that the inline marker family does not, despite the inline family now also rendering near-zero-width markers; (c) task mouse handlers are wired while the widget they target is dormant; (d) code blocks receive no Live Preview treatment of any kind and are absent from every design document read.

---

## 10. Accessibility audit

**What a screen reader announces for a concealed `**bold**`, `==highlight==`, `~~strike~~`, `` `code` ``: UNKNOWN. No screen reader was run in this pass, and no prior Clutter document records one being run.**

What *is* PROVEN:

- Clutter's concealed marker spans carry **no** `aria-hidden`. The marker characters remain real text nodes in the accessibility tree. `font-size` is a visual property with no defined effect on accessibility-tree text content.
- Clutter's widget family (`WikiLinkWidget`, `TagWidget`, `DateWidget`, `TaskCheckboxWidget`) **does** set `role` and `aria-label`/`aria-checked` — accessibility was considered for that family.
- CM6's `cm-widgetBuffer` sets `aria-hidden="true"` — but that is the buffer, not any widget content.
- Obsidian's supplied snippet shows `aria-hidden="true"` on buffers only; its concealed-marker span is empty, so there is nothing to announce — but its *content* span carries no ARIA either.

**Assessment: neither system is demonstrated to solve this.** Obsidian's empty-widget approach removes marker text from the tree as a side effect of removing it from the DOM, which is an accidental advantage rather than a designed one; whether that produces a *better* screen-reader experience (formatting becomes entirely invisible to a non-sighted user, with no way to know text is bold) or a *worse* one is a genuine product question neither system has answered.

**This is the strongest leapfrog opportunity in the document.** See §16.

---

## 11. Browser compatibility audit

- **CM6 contains an explicit Safari zero-width-rect workaround in `TextTile.coordsIn`** (§8.1). **PROVEN.** Implication: WebKit returning degenerate rects for text ranges is a *known* hazard that CM6 already partially compensates for. Clutter's `0.05px` sits in exactly this territory. This does not invalidate the fix; it explains why the fix was needed and suggests the safety margin is prudent.
- **`moveVertically`'s direction-dependent bias is confirmed present in 6.43.9.** PROVEN: `view.coordsAtPos(startPos, start.assoc || ((start.empty ? forward : start.head == start.from) ? 1 : -1))` — for an empty selection with `assoc === 0`, this is `+1` when moving down and `-1` when moving up. The asymmetry documented in `tauri-webkit-editor-issues.md` Issue 2 remains real in the installed version.
- **`moveVertically` scans in `heightOracle.textHeight >> 1` steps.** PROVEN. If `textHeight` were ever measured as 0, `halfText` would be 0 and the scan loop would not advance. `measureTextSize` excludes decorated lines and falls back to a dummy `.cm-line`, so this is not currently reachable — but it is a sharp edge worth knowing.
- **Firefox: entirely UNKNOWN.** No Clutter document records any Firefox testing. Given Tauri targets WebKit on macOS and Chromium elsewhere, and the app also runs in browsers, this is a real coverage gap.
- **Chromium: UNKNOWN with confidence.** `editor-architecture-decisions.md` explicitly records that the `line-height: 1` fix "was not verified with real confidence this session" in Chromium.
- **Zoom / DPR / font scaling: UNKNOWN.** The `0.05px` threshold was measured in one environment at one scale factor. `tauri-webkit-editor-issues.md` names this as an explicit reason for the 3× margin.

**Governing principle the brief states, and this audit endorses:** choose primitives that minimize dependence on undocumented browser geometry. On that criterion, `Decoration.replace({})` (no DOM node — no geometry to be wrong about) scores best, `Decoration.mark` + real text scores middle, and a `font-size`-tuned real text run scores worst. But primitive choice must also satisfy the *behavioral* constraints in §8.2, and §8.2 is where the widget option fails.

---

## 12. Performance audit

**Evidence: PROVEN from source reading; no profiling was performed. All complexity claims are analytical.**

- **Traversal scope is viewport-bounded.** `buildDecorations` iterates `view.visibleRanges` only, not the whole document. Cost scales with *visible* content, not document length. **This is the single most important performance property and it is correct.**
- **Rebuild trigger:** `update.docChanged || update.viewportChanged || update.selectionSet`. Selection-derived engagement means every caret movement rebuilds the visible decoration set. That is inherent to the model, viewport-bounded, and the standard CM6 pattern.
- **`syntaxTree.iterate` is O(visible nodes).** The engaged-region branch adds one extra `revealedMarkerRanges` subtree walk — but only for the single engaged region, and it runs *instead of* resuming ordinary traversal, so it does not double-traverse. **No O(n²) found.**
- **`Decoration.set(ranges, true)` sorts.** O(k log k) in ranges per pass, deliberately chosen over `RangeSetBuilder` because nested constructs emit out-of-order ranges. Correct trade.
- **`skipAtomicRanges` is a fixed-point loop** (`for(;;)` re-running until no atom moves the position). Worst case is bounded by the number of nested atomic ranges at one position, which for Clutter is 1 — atomic ranges are the widget family only, and widgets do not nest. **Not a risk as currently configured.** It *would* become one if atomic ranges were ever applied to nested markers — an additional argument against the widget-with-atomic path.
- **DOM node count:** the marker migration replaced 0 nodes (`Decoration.replace`) with 2 real spans per construct. A line with N inline constructs went from ~N spans to ~3N. Nested constructs multiply. **This is a real, un-benchmarked increase**, and it is worth noting that the widget alternative would *also* add nodes (widget + up to 2 buffer `<img>` each — potentially more than the mark approach).
- **Widget churn is controlled** by `eq()` on all four widget classes plus CM6's tile cache. Correct.

**Classification: no evidence of a performance problem; two theoretical risks (decoration count per line after the marker migration; rebuild-on-every-selection-change) that are untested rather than suspected.** Experiment E5.

---

## 13. Where Clutter is better

Each with evidence; where the comparison cannot be made, it says so.

1. **Minimal override surface (§5.2).** Four overrides, three of them Markdown semantics. **PROVEN** from a complete grep. Obsidian's override surface is **UNKNOWN** — but Clutter's is *demonstrable*, which is itself the advantage: it is auditable in an afternoon.
2. **Per-character addressability of markers.** Real text yields real per-character rects (§8.1). Obsidian's widget markers structurally cannot. **PROVEN** mechanism; whether it matters to users is a product question, but the Markdown source is fully addressable in Clutter and demonstrably not in Obsidian.
3. **Selection-derived engagement with zero stored state.** Undo/clipboard/IME correctness follows for free. Obsidian: **UNKNOWN**.
4. **Region-atomic nested visibility, structurally derived.** Fixed a real verified regression (`~~__Text__~~`). Adding a participant is one map entry. Obsidian: **UNKNOWN**.
5. **True nested-mark composition expresses partial overlap**; flat multi-class on one element cannot (§4.2).
6. **Parser design grounded in library internals** — `Highlight` reuses `@lezer/markdown`'s own run-scanner, with the decision not to port `Emphasis` peeling justified by reading `resolveMarkers`. **PROVEN.**
7. **Evidence discipline.** Real-Safari OS-level input testing (after finding synthetic CDP events unreliable), mounted-`EditorView` DOM assertions, explicit Superseded/Open states. This pass was buildable almost entirely from Clutter's own trail.

---

## 14. Where Obsidian is better

Honest and short, because §4.1 eliminated most of Pass 1's list.

1. **Relative base line-height (`1.5`) vs. Clutter's absolute `24px`.** PROVEN both sides. Scales under zoom/text-scaling without token maintenance. Small but real. **Adopt the principle.**
2. **No subpixel font-size dependency for concealment.** Its concealed markers have no glyph metrics to go degenerate. PROVEN structurally. **But** §8.2 shows the cost, so this is *better on one axis*, not better overall.
3. **Rejects `=text==` at the parser level.** PROVEN from the snippet — consistent with Clutter's own `>= 2` gate, so this is parity, not superiority. Included only because the brief asked for asymmetric-delimiter comparison, and to record that mismatched-but-both-≥2 behavior is UNKNOWN.

**Everything Pass 1 credited to Obsidian's DOM design — buffers, `contenteditable=false`, widget caret handling — is CodeMirror's, not Obsidian's.** Obsidian's genuine editor-level advantages cannot be assessed from a DOM snapshot.

---

## 15. Where both are weak

- **Accessibility of concealed Markdown syntax.** Neither demonstrated. §10.
- **Selection at paired-marker boundaries.** Clutter's own docs flag this as explicitly unverified for the paired case. Obsidian: UNKNOWN.
- **IME with concealed markers adjacent to a composition range.** Clutter flags it as unresolved by research alone. Obsidian: UNKNOWN. No public CM6 contract covers it.
- **Bidi/RTL with concealed markers.** CM6 handles bidi thoroughly (PROVEN), but neither editor's *concealment* is tested against RTL. UNKNOWN both.
- **Deeply nested constructs.** Clutter has a structural answer; the DOM-depth and performance consequences are untested. Obsidian: UNKNOWN beyond one 2-level case.
- **Zoom / DPR / font scaling.** Clutter's threshold measured at one scale. Obsidian: UNKNOWN.
- **Mobile / touch editing.** Neither examined. UNKNOWN both.
- **Code blocks.** Clutter has no Live Preview treatment and no design document. Obsidian: UNKNOWN.

---

## 16. Opportunities to leapfrog

1. **Be the first to actually answer accessibility for concealed Markdown.** Run real screen readers, decide the product contract (should a screen-reader user perceive `**`? or hear "bold: text"?), and implement it deliberately — `aria-hidden` on markers plus semantic wrapping of content, or an explicit decision not to. Neither system has this. Highest-value, lowest-contention.
2. **Turn the 12-item standalone-renderer checklist into a parameterized test fixture** run automatically against every registered participant. Converts "adding a construct never requires touching another's tests" from an intention into a mechanically enforced property.
3. **Publish a browser-geometry invariant** — "no editor CSS may set `font-size: 0` or `line-height: 0` on any element in the editable text flow" — and enforce it with a lint rule or a source-level tripwire test (the pattern `markerConcealedLineHeight.test.ts` already establishes). This would have caught §7.1 automatically.
4. **Extend the WebKit regression corpus to cover block constructs** (HR, blockquote, heading, table rows), not just inline ones.
5. **Relative typography tokens** — small, safe, immediate.

---

## 17. Things we should NOT copy

- **`cm-widgetBuffer`/`contenteditable=false`** — nothing to copy; it is CM6's, and Clutter already gets it wherever it uses widgets. **PROVEN.**
- **Widget-based markers for the inline formatting family** — §8.2. Would degrade caret/click addressability or violate a Locked atomicity decision.
- **Flat multi-class content composition** — less general than true nesting; likely an artifact rather than a design (§4.2).
- **`cm-formatting-*` / `HyperMD-*` naming** — already correctly rejected in `markdown-dom-structure-agreement.md` §98; restated as still correct.
- **Any Obsidian behavior inferred from DOM alone.** An Obsidian implementation detail is not evidence of a requirement.

---

## 18. Things worth adopting

| Item | Why | Answer to "why can't native CM6 do this?" |
|---|---|---|
| Relative base line-height | Zoom/text-scaling robustness | CM6 does not set app typography; this is Clutter's own token, correctly Clutter's to fix |
| The *principle* of avoiding glyph-metric dependence for concealment | Reduces undocumented-geometry exposure | CM6 offers `replace({})` (already used by heading/Link) which fully satisfies it — no new mechanism needed |

That is the entire list. Everything else Pass 1 proposed adopting turned out to be CM6's own behavior.

---

## 19. Architectural risks

| # | Risk | Severity | Confidence |
|---|---|---|---|
| R1 | Wired `font-size: 0` on HR lines matches a proven WebKit defect pattern; untested | **P1** | pattern PROVEN, reproduction UNKNOWN |
| R2 | `liveMarkSelectionSnap` overrides CM6 pointer selection for blockquote on a premise that no longer holds | **P2** | STRONGLY INFERRED |
| R3 | Concealed markers have no accessibility contract | **P1** | PROVEN absent; impact UNKNOWN |
| R4 | `0.05px` is a threshold measured in one environment; zoom/DPR/WebKit-version drift untested | **P2** | acknowledged in Clutter's own docs |
| R5 | Four coexisting concealment mechanisms raise the cost of reasoning about any construct | **P2** | PROVEN; deliberate per §1.7 |
| R6 | `isDelimitedMarkConstruct` false-positives on `Link` (structural resemblance, not registration) | **P2** | already documented, still unfixed |
| R7 | Firefox never tested; Chromium not confidently verified for the line-height fix | **P2** | PROVEN gap |
| R8 | Decoration/DOM-node count per line rose with the marker migration; unbenchmarked | **P3** | PROVEN change, impact UNKNOWN |
| R9 | Code blocks have no Live Preview design at all | **P3** | PROVEN absence |
| R10 | Task mouse handlers wired while their widget is dormant | **P3** | PROVEN |

**No P0.** Nothing found constitutes a currently-proven architectural-correctness failure.

---

## 20. Proposed invariants

Ordered by importance. The first is new and is the most important output of this pass.

1. **CM6-first hierarchy (NEW — propose Locked).** Native CM6 → CM6 primitive configured for Markdown → minimal Markdown-specific layer → custom editor behavior only with a reproduced defect as evidence. Never: observe another editor → copy it → override CM6. Every proposed change must answer *"why can't native CM6 already do this?"*
2. **Editor behavior stays CM6-owned; only Markdown semantics may be extended (NEW — propose Locked).** Cursor motion, selection, editing mechanics, DOM positioning, composition, undo/redo, transactions, scrolling, viewport: CM6. Parsing, concealment policy, engagement, traversal, Markdown decoration/indentation: Clutter. Every new mechanism must be classified into one of these two buckets, and anything in the first requires a reproduced defect to justify.
3. **No element in the editable text flow may declare `font-size: 0` or `line-height: 0` (NEW — propose Locked, pending E1).** Derived from a proven WebKit defect, and currently violated by wired HR CSS.
4. **Concealment must not depend on a numeric threshold tuned against undocumented browser behavior (NEW — propose Recommended, not Locked).** Recommended rather than Locked because the currently-available alternatives each violate invariant 5 or 6; this states the goal without mandating a mechanism that is not yet proven better.
5. **`atomicRanges` remains scoped to the semantic-token/widget family only.** Already Locked — reconfirmed, and now with an additional argument: it is also what keeps `skipAtomicRanges`'s fixed-point loop trivially bounded (§12).
6. **Every Markdown source position must remain individually addressable by caret, selection, and deletion, except where a construct is deliberately atomic by product contract.** (NEW — propose Locked.) This is the invariant that decides the widget question, and it is why §24(G) answers as it does.
7. **Engagement stays selection-derived; region visibility stays structurally derived from the syntax tree.** Already Locked — reconfirmed.
8. **Base typography tokens should be relative, not absolute** (NEW — Recommended).

---

## 21. Decision table

| Decision | Verdict | Evidence | Confidence |
|---|---|---|---|
| Keep CodeMirror 6 + Lezer | **KEEP** | Every mechanism examined is sound and CM6-native | PROVEN |
| Keep real-source-backed markers | **KEEP** | Per-character addressability; invariant 6 | PROVEN |
| Migrate markers to widgets | **NOT YET / leaning NO** | §8.2 | PROVEN mechanism |
| Keep `font-size: 0.05px` on `.cm-marker--concealed` | **KEEP for now** | Best available given invariant 6; margin justified | OBSERVED (prior testing) |
| Keep `line-height: 1` | **KEEP** | Correct, minimal, construct-agnostic | OBSERVED |
| Fix `font-size: 0` on HR lines | **INVESTIGATE — highest priority** | §7.1 | pattern PROVEN |
| Re-examine `liveMarkSelectionSnap` for blockquote | **INVESTIGATE** | §5.3 | STRONGLY INFERRED |
| Keep it for heading | **KEEP** | Premise still holds | PROVEN |
| Keep `markdownEnterKeymap` | **KEEP** | Three measured gaps; configures/delegates rather than reimplements | PROVEN |
| Keep `formatShortcutsKeymap` | **KEEP** | CM6 has no equivalent | PROVEN |
| Keep mouse activation handlers | **KEEP** | Product feature, not editor behavior | PROVEN |
| Adopt flat multi-class composition | **REJECT** | §4.2 | STRONGLY INFERRED |
| Adopt `cm-widgetBuffer` | **N/A** | Already have it wherever widgets are used | PROVEN |
| Relative line-height token | **ADOPT** | §7.2 | PROVEN |
| Accessibility contract for markers | **DESIGN — new work** | §10 | UNKNOWN both systems |
| Lock CM6-first hierarchy | **ADOPT** | §5 | PROVEN |

---

## 22. Open questions requiring real manual experiments

1. Does the wired `font-size: 0` on HR lines reproduce the Issue-1 ArrowDown skip in real Safari/WebKit?
2. Does `liveMarkSelectionSnap` still change any pointer-selection outcome for blockquote now that its marker reserves real width?
3. What do VoiceOver / NVDA / JAWS actually announce for concealed and engaged markers?
4. Does the paired-marker concealment survive drag-selection and Backspace-at-boundary? (Clutter's own docs flag this as unverified.)
5. Does the `0.05px` threshold hold at 50%–200% zoom, on 1×/2×/3× DPR, and with OS text scaling?
6. Does IME composition behave correctly adjacent to a concealed marker in each of Japanese, Korean, Chinese, Hindi, and dead-key input?
7. Does everything behave in Firefox? (Never tested.)
8. Is the line-height fix confirmed in Chromium? (Explicitly not confidently verified.)
9. What is the real per-line decoration/DOM-node count and rebuild cost on a large document with dense formatting?
10. Would a widget-based marker actually exhibit the predicted caret degeneracy? (§8.2 is a source-level prediction, not a measurement.)
11. How does Obsidian handle `==x===`, `***bold italic***`, `~~==**nested**==~~`, links+formatting, code+formatting? (All UNKNOWN from supplied material.)
12. Do concealed markers behave correctly in RTL/bidi content?

---

## 23. Recommended next experiments

| ID | Experiment | Answers | Priority |
|---|---|---|---|
| **E1** | Add HR lines (all four variants) to the 13-line WebKit corpus; sweep ArrowUp/ArrowDown in real Safari via OS-level input. Then A/B `font-size: 0` vs `0.05px` on `.cm-hr-line` via injected CSS only. | Q1 | **1 — possible live defect** |
| **E2** | Mount the real app; click at every pixel boundary around a concealed `>` marker with the snap wired and with it stubbed out; compare `window.getSelection()`. | Q2 | 2 |
| **E3** | Run VoiceOver over a document containing all five marker constructs, at rest and engaged; transcribe. Repeat with `aria-hidden` injected on `.cm-marker--concealed` to compare. | Q3 | 2 |
| **E4** | Drag-select across `**bold**` and press Backspace at each marker boundary; record resulting document text and selection at every step. | Q4 | 3 |
| **E5** | Instrument `buildDecorations` with a range counter and `performance.now()` on a 5,000-line densely-formatted document; measure per-keystroke and per-caret-move cost. | Q9 | 3 |
| **E6** | Build a throwaway branch with a `MarkerWidget` whose `toDOM()` renders the literal marker text, wire it for `Highlight` only, and run the full §8.3 checklist against it. **This is the only thing that can convert §24(G) from NOT YET to YES or NO.** | Q10 | 3 |
| **E7** | Zoom/DPR/text-scaling matrix against the existing corpus. | Q5 | 4 |
| **E8** | IME sweep across five input methods. | Q6 | 4 |
| **E9** | Run the existing corpus in Firefox and Chromium. | Q7, Q8 | 4 |
| **E10** | Type the deeper nested combinations into real Obsidian and capture the DOM. | Q11 | 5 — informational only |

---

## 24. Final recommendation — direct answers

### A. Is Clutter's current overall editor architecture sound?

**Yes.** More so than Pass 1 credited. The decisive evidence is §5.2: the entire override surface is four items, three of which are Markdown semantics rather than editor behavior, and every pure-editor-behavior row in §5.4 answers "custom code necessary? **NO**." Clutter is running native CodeMirror 6 with a Markdown decoration layer on top. That is the correct architecture for this problem.

### B. Five biggest technical weaknesses

1. Wired `font-size: 0` on horizontal-rule lines — the exact pattern proven to break WebKit ArrowDown, never tested (R1).
2. No accessibility contract for concealed markers; real text with no `aria-hidden` and no screen-reader evidence (R3).
3. Concealment depends on a threshold (`0.05px`) tuned against undocumented WebKit behavior in one environment (R4).
4. A `transactionFilter` overriding CM6 pointer selection for blockquote on a premise that no longer matches blockquote's implementation (R2).
5. Four coexisting concealment mechanisms, plus untested Firefox and not-confidently-verified Chromium (R5, R7).

### C. Five strongest things Clutter is doing

1. Near-zero override of CM6 editor behavior — auditable, and the single biggest asset.
2. Selection-derived engagement with no stored state.
3. Region-atomic nested visibility derived structurally from the syntax tree.
4. Parser design grounded in reading `@lezer/markdown` internals rather than guessing.
5. Evidence discipline — real-browser testing, mounted-DOM assertions, explicit Superseded/Open states.

### D. Five strongest things Obsidian is doing

Honestly, only two are established, and one is parity:

1. Relative base line-height (`1.5`) — genuinely better than an absolute token.
2. Concealment with no glyph-metric dependence — better on the geometry axis, worse on the addressability axis (§8.2).
3. Parser-level rejection of `=text==` — parity with Clutter, not superiority.
4. *(Not Obsidian's)* `cm-widgetBuffer` / `contenteditable=false` — CodeMirror's, PROVEN.
5. *(Not established)* everything else — UNKNOWN from a DOM snapshot.

### E. What should we adopt from Obsidian?

The relative line-height *principle*, and the *goal* of concealment that doesn't depend on glyph metrics. **Nothing else.** No implementation detail survived §4.1.

### F. What should we explicitly NOT adopt?

Widget-based markers for inline formatting; flat multi-class composition; `cm-formatting-*` naming; and any behavior inferred from Obsidian's DOM without an identified underlying problem that CM6 does not already solve.

### G. Should we replace near-zero-font-size marker text with widgets?

## **NOT YET — and the evidence currently points toward NO.**

**Evidence:** `moveByChar` is decoration-blind (PROVEN); `WidgetTile.coordsIn` collapses interior positions to widget edges (PROVEN); `TextTile.coordsIn` yields real per-character rects (PROVEN); `atomicRanges` is the only fix for the collapse, and applying it to ordinary formatting markers is already Locked as forbidden (PROVEN from Clutter's own decision log, backed by a documented upstream bug report).

**Confidence:** PROVEN for the mechanisms; STRONGLY INFERRED for the resulting user-visible degradation.

**Implication:** Pass 1's recommendation would trade a *tuned, measured, currently-working* problem for a *structural* one, and would violate proposed invariant 6 (every Markdown source position individually addressable). It also fails the CM6-first test in a subtle way: it is not "CM6 can't do this" — CM6 offers three primitives here and Clutter has *already* picked the one that preserves addressability.

**Recommendation:** leave `.cm-marker--concealed` exactly as it is. Do not migrate. Re-open only if E6 produces measurements contradicting §8.2. Pass 1's contrary recommendation is formally withdrawn.

**Superseded (2026-08-27, later same day) — the "STRONGLY INFERRED... user-visible degradation" conclusion above did not hold under direct testing, and Clutter has migrated.** What changed: this section's own PROVEN facts (`moveByChar` is decoration-blind; `WidgetTile.coordsIn` collapses interior positions to widget edges) are unchanged and still correct — what turned out wrong was the *inference* from "coordinates collapse" to "user-visible degradation," which this section reasoned about but never tested against the one thing that actually determines the user-visible outcome: reveal-on-engagement. Direct testing (an isolated CM6 sandbox, then the real Clutter webapp, both real-browser, not jsdom) found:
- ArrowUp/ArrowDown through lines starting with 1/2/3/4-character concealed markers, and through a heading and nested list items containing them: zero skips, both directions, matching or exceeding the old technique's own guarantee.
- `moveByChar` (ArrowLeft/ArrowRight) steps through every logical position exactly as this section's own proof says it must — confirmed directly, identical DOM Range offsets to the pre-migration technique.
- Backspace/Delete remain strictly per-character (`EditorView.atomicRanges` is not, and per this document's own Locked invariant 6 could not be, applied to this widget) — confirmed directly, including at the specific between-the-two-opening-`*` position this document's own §5.5 already covers for the mark-based predecessor.
- The reason the coordinate collapse this section proves never surfaces to a user: **any** position inside a concealed construct's range satisfies `isTokenEngaged`'s containment check, which reveals the *entire* construct as real text on the very same render. Landing at collapsed sub-position 0 vs. 1 vs. 2 of an about-to-be-revealed, still-invisible marker is not a distinguishable outcome — the user always ends up looking at the same fully-revealed real text, with a cursor somewhere sane inside it. This section reasoned about the geometry correctly but did not check whether the architecture already neutralizes its consequence; it does.

The actual, different reason this migration happened is a bug this section was not evaluating: `Decoration.mark` + a shrunk `font-size`/`transform` cannot simultaneously get vertical geometry (CM6 `drawSelection()`'s selection-rectangle math) and horizontal layout (no width reserved for concealed markers) correct, because both are governed by the same real glyph run's font metrics. See `docs/editor-architecture-decisions.md`'s `Decoration.replace()`-with-widget entry for the full investigation and measurements, and `docs/markdown-dom-structure-agreement.md` §5.5's own follow-up status update. Verified this session in this pane's Chromium engine; not independently re-verified in real Safari/WebKit, though `WidgetTile.coordsIn`'s collapsing behavior this section proves is stated as general CM6 behavior here, not WebKit-specific, so there is no specific reason to expect a different outcome there.

### H. What experiments must run before deciding?

E6 is the only one that can settle G. E1 must run first regardless — it may be a live defect. E3 and E4 bound the risk of *keeping* the current mechanism. E7/E8/E9 close the environment-coverage gaps that make the current threshold feel fragile.

### I. Where can Clutter realistically surpass Obsidian?

Accessibility of concealed Markdown (neither has solved it — the clearest open ground); mechanically-enforced construct independence via a parameterized interaction-matrix test; a published and lint-enforced browser-geometry invariant; broader real-browser regression coverage including block constructs and Firefox; and — already true today, worth defending rather than achieving — a minimal, auditable override surface.

### J. What invariants should become Locked after this research?

Propose Locked: (1) the CM6-first hierarchy; (2) editor behavior stays CM6-owned, only Markdown semantics may be extended; (3) no `font-size: 0` / `line-height: 0` in the editable text flow (pending E1); (6) every Markdown source position individually addressable unless deliberately atomic by contract. Reconfirm as Locked: (5) `atomicRanges` scoped to the widget family; (7) selection-derived engagement and structurally-derived region visibility. Propose Recommended-not-Locked: (4) no undocumented-threshold dependence; (8) relative typography tokens.
