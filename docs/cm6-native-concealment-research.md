# CM6-Native Recommendation: Concealed Markdown Markers (Pass 3)

## Status

RESEARCH ONLY. No production TS/TSX, CSS, grammar, tests, or editor behavior was
modified to produce this document. Findings below are sourced from the installed
`@codemirror/view` 6.43.9 (and sibling `@codemirror/*`/`@lezer/*` packages) at
`node_modules/`, cross-referenced against this repo's own current implementation
and `docs/tauri-webkit-editor-issues.md`.

## tl;dr

- **CM6 has no built-in "conceal text" primitive.** `grep -i "conceal"` across every
  installed `@codemirror/*` and `@lezer/markdown` package returns zero matches.
  Concealment is, by design, left to the application — this is not a gap we're
  failing to find, it's the documented shape of the API surface (`atomicRanges`'
  own doc comment explicitly tells the app to opt in separately; `Decoration.replace`'s
  doc comment literally says "or simply hides it," offering no further guidance).
- **The `0.05px` value is not a CM6 requirement.** It is a WebKit/Safari
  vertical-caret-motion workaround, fully documented in
  [`docs/tauri-webkit-editor-issues.md`](tauri-webkit-editor-issues.md). CM6's own
  `moveVertically`/`coordsAtPos` code is engine-agnostic; the degenerate behavior
  at near-zero font sizes is WebKit-internal geometry handling, reproduced only in
  real Safari/WKWebView, never in Chromium. **This does not mean Option A (real
  text + tiny font) is wrong** — it means the *specific number* `0.05px` is a
  browser-compat constant we own and must keep re-verifying against WebKit, not
  a value CM6 ever asked for.
- **`Decoration.mark` is the only primitive that preserves full native
  position-level addressability** (arrow keys, selection, IME, IME, bidi, hit-testing) for
  every individual character, because it leaves real text nodes in the DOM. This
  is true regardless of what CSS is applied to that mark's span — `font-size`,
  `color: transparent`, or anything else that doesn't remove the node.
- **`Decoration.replace`/`Decoration.widget` deliberately trade away per-position
  DOM granularity.** Without a custom `WidgetType.coordsAt`, every document
  position inside a no-widget replace decoration collapses to one DOM rect. Doc
  offsets and edit-mapping remain sound (the RangeSet still tracks them), but
  native caret geometry does not distinguish them. This is exactly why
  Heading/Link marker removal is fine (the whole marker is one unit the user
  isn't meant to edit into) and why it would be the wrong tool for something like
  `**` where individual characters may need independent addressing mid-edit.
- **Recommendation: keep Option A (real text, CSS-only concealment) as the
  CM6-first choice for ordinary formatting markers**, because it is the only
  option that requires zero custom editor-behavior overrides and preserves every
  CM6-native guarantee this document tested for. The open question is not
  "widget vs. real text" — Pass 2 already closed that — it's "which CSS technique",
  and the answer there is **`0.05px` remains the correct choice over the untested
  alternatives**, for reasons in §3/§6 below. Blockquote's `color: transparent` is
  not a competing option for this construct family; it was already ruled out by
  the width-reservation argument in the current CSS (§4).

---

## 1. CM6-native primitives — what each one is for and what it guarantees

This table synthesizes source-verified findings (via the installed
`@codemirror/view` 6.43.9 source — see method note at the end) against the twenty
questions in the research brief. "✅ native" = CM6 provides this for free; "⚠️
app-owned" = CM6 leaves this to the application; "n/a" = doesn't apply to this
primitive's shape.

| Property | `Decoration.mark` | `Decoration.replace` (no widget) | `Decoration.widget` |
|---|---|---|---|
| What it's for | Style/wrap a text range without changing content | Remove/replace a range's rendering | Insert a synthetic point of content |
| Per-position DOM addressability | ✅ native (`TextTile`, real text nodes) | ⚠️ collapses to one `WidgetTile`/rect (see §1.1) | n/a (a widget occupies a single doc position, zero width) |
| ArrowLeft/Right | ✅ native | ✅ native at the boundary; interior positions exist in the model but aren't independently reachable via geometry (browser will still land on `from`/`to`) | ✅ native (jumps over the point) |
| ArrowUp/Down (`moveVertically`) | ✅ native | ⚠️ works, but any interior "landing" collapses to the replace's single rect | ✅ native |
| Home/End | ✅ native | ✅ native (line-level, unaffected by point content) | ✅ native |
| Shift-selection | ✅ native, char-granular | ⚠️ granular only at `from`/`to`; interior selection endpoints exist in the offset model but can't be *placed* there by mouse/keyboard without app help | ✅ native (selection can include/exclude the point) |
| Backspace/Delete | ✅ native, char-by-char | ⚠️ default CM6 delete commands treat it as ordinary text unless separately registered in `atomicRanges` — deleting one character at a time inside it is possible unless atomicity is added | n/a — single position, deleting removes the widget's decoration via normal edit-mapping, not multi-step |
| Mouse hit-testing | ✅ native (`getClientRects()` per char) | ⚠️ hit-tests to the single DOM node; can't distinguish "clicked position 3 of 5" from "position 4 of 5" inside it, absent `WidgetType.coordsAt` | ✅ native for the point; widget interior hit-testing is whatever `toDOM()` renders |
| Drag selection | ✅ native | ⚠️ same granularity limits as click | ✅ native at the point granularity |
| IME/composition | ✅ native (real text under composition) | ⚠️ untested here — composition normally targets real text nodes, so composing *inside* a no-widget replace range is not a real text-editing scenario CM6 designs for | n/a — widgets aren't composition targets |
| Bidi/RTL | ✅ native (subject to normal bidi reordering; can opt into `bidiIsolate` via `MarkDecorationSpec.bidiIsolate` + `EditorView.bidiIsolatedRanges`) | ⚠️ the whole range acts as one bidi unit | ⚠️ same — one bidi unit |
| Copy/paste | ✅ native — copies the real marker text | ⚠️ copies whatever text still exists in the document range (the *decoration* doesn't remove document content, only its rendering) — actually consistent behavior, since the doc string is unaffected either way | n/a — widgets don't correspond to copyable document text by themselves (the underlying doc range they cover, if any, still copies as text) |
| Undo/redo | ✅ native (decorations aren't undo state; only document edits are) | ✅ native, same reason | ✅ native, same reason |
| Accessibility | ✅ native (real text is screen-reader visible unless separately hidden) | ⚠️ depends entirely on what (if anything) `toDOM`/fallback renders; the current NullWidget fallback is `aria`-agnostic | ⚠️ entirely app-owned via `toDOM()`/`aria-*` attributes |
| Wrapping | ✅ native | ✅ native (participates in line layout like any inline content) | ✅ native, subject to `WidgetType.lineBreaks` |
| Line-height/geometry | ✅ native, driven by real glyph metrics (or CSS override, as Clutter already does) | ✅ native — the widget tile has whatever geometry its DOM node reports | ✅ native, same |
| Performance | ✅ native, no extra machinery | ✅ native, but `ContentBuilder` allocates and diffs `WidgetTile`s (cached by `(widget, length, flags)` — cheap when stable, but a different code path than plain text) | ✅ native, same caching |
| Requires custom editor-behavior override? | **No** | **Only if** interior-position addressability or atomic delete/select semantics are required (then `atomicRanges` + possibly a custom `coordsAt` are needed) | **No**, by design (a widget is inherently a single point) |

### 1.1 The core mechanism (source-verified, not inferred)

- `Decoration.mark` wraps real text in a `span` (`MarkDecoration`, `view/dist/index.js:250-322`). The DOM node is still a text node underneath; `TextTile.coordsIn` (`index.js:2054-2101`) uses a native DOM `Range.getClientRects()` over that text — this is what gives every offset its own exact geometry, natively, for free.
- `Decoration.replace({})` (no widget) resolves at render time to `NullWidget.inline`/`.block` (`index.js:2879-2890`, `isHidden: true`), rendered as one `WidgetTile` spanning the *entire* `to - from` range as a single DOM node (`index.js:2744-2781`). `WidgetTile.coordsIn` → `coordsInWidget` (`index.js:2121-2140`) calls `widget.coordsAt()` first; absent an override it falls back to `getClientRects()`/`getBoundingClientRect()` of the *whole* widget node, essentially ignoring the specific `pos` argument. This is the concrete, source-level reason a no-widget replace decoration cannot give you per-character caret geometry without you writing a custom `coordsAt`.
- `EditorView.atomicRanges` (`.d.ts:1341-1352`) is a *separate, opt-in* facet — CM6 does not automatically make `Decoration.replace`/`Decoration.widget` ranges atomic for cursor motion. The doc comment explicitly instructs the app: "If you want decorated ranges to behave like atomic units for cursor motion and deletion purposes, also provide the range set containing the decorations to `EditorView.atomicRanges`." This confirms replace/widget and atomicity are orthogonal, deliberately: you can have a replace decoration that CM6 still lets you type/delete into character-by-character, or one you've explicitly hardened into an atomic unit — CM6 draws no default.
- `cm-widgetBuffer` (`WidgetBufferTile`, `index.js:2167-2180`) is confirmed CM6-native (as Pass 2 already established), but it solves a different problem: an `<img aria-hidden>` buffer placed *around* uneditable widget content, specifically to avoid WebKit/browser bugs "when the cursor is directly next to uneditable inline content." It is not a mechanism for concealing markdown syntax characters — it's plumbing CM6 uses internally whenever any widget is placed inline, regardless of what that widget represents.

---

## 2. Does CM6 have a native way to visually hide text?

**No.** Zero matches for "conceal"/"hidden"/"invisible" as a *public API concept*
anywhere in `@codemirror/view`, `@codemirror/state`, `@codemirror/language`,
`@codemirror/lang-markdown`, or `@lezer/markdown` (installed versions). The only
hits are:

- `WidgetType.isHidden` — an `@internal`-tagged getter (default `false`), used to
  control caret-tile resolution near widgets and to gate `ignoreEvent` dispatch.
  It is not exposed as something an application decoration can set on arbitrary
  real text; it exists on widgets CM6 itself renders (`NullWidget`,
  `WidgetBufferTile`), and isn't documented as a public extension point for "hide
  this span of real text."
- The base theme (`index.js:7024-7029` and surrounding style object) has no
  `visibility`/`opacity`/`font-size: 0` rule for any concealment purpose — only
  cosmetic classes (`cm-placeholder`, `cm-highlightSpace`, `cm-trailingSpace`,
  etc.), none of which are about hiding real editable content.
- `@lezer/markdown`'s `Emphasis`/`StrongEmphasis`/`EmphasisMark`/etc. tags exist
  purely for parsing/highlighting classification (they get mapped to
  `tags.processingInstruction` for the default highlight style) — there is no
  shipped "hide the mark tokens" utility alongside the grammar.

**Conclusion: CM6 intentionally leaves syntax concealment to the application
layer.** This is consistent with CM6's general design philosophy (small core,
composable facets, no built-in "language mode" opinions) and matches what
`Decoration.replace`'s doc comment already implies ("or simply hides it" — offered
as one possible *use* of the primitive, not a dedicated hiding API). There is no
undiscovered CM6 mechanism being missed here; the honest state of the API is that
"hide these characters, keep them addressable" is something you build **from**
`Decoration.mark` + CSS, not something CM6 hands you.

---

## 3. CSS-based concealment options

| Technique | Stays in DOM? | Selectable/addressable? | Retains layout width? | Retains char geometry? | Affects line-height? | `coordsAtPos` usable? | `posAtCoords` maps clicks? | ArrowUp/Down reliable? | WebKit-safe? | Chromium-safe? | Firefox-safe? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `visibility: hidden` | ✅ | ❌ (removed from hit-testing/click target, though still occupies layout box) | ✅ (reserves space) | ✅ geometry exists but isn't visually verifiable | No | ✅ (box still exists) | ⚠️ untested here, but `visibility:hidden` boxes are excluded from `elementFromPoint`-style hit-testing in browsers generally | Likely ✅ (box exists) | Not verified here | Not verified here | Not verified here |
| `opacity: 0` | ✅ | ✅ (opacity doesn't remove hit-testing) | ✅ | ✅ | No | ✅ | ✅ | ✅ | Not verified here — no failure mode reported in `tauri-webkit-editor-issues.md`, but also never the value actually shipped, so no positive real-Safari vertical-motion confirmation exists either | Not verified here | Not verified here |
| `color: transparent` | ✅ | ✅ | ✅ (reserves full glyph width — this is exactly why the current CSS comment rejects it for inline markers: "confirmed by measurement (19.5px reserved width)") | ✅ | No | ✅ | ✅ | ✅ (real glyph size, no near-zero-size WebKit interaction) | ✅ (already shipped for blockquote markers) | ✅ | Not verified here |
| `font-size: 0` | ✅ | ✅ geometrically, but proven broken for CM6 vertical motion in WebKit | Collapses to ~0 | Degenerate at exactly `0` in WebKit (Issue 1) | Yes — separate line-height bug, same at `0`/`0.05px`/`1px` per the codebase's own comment | ⚠️ WebKit produces degenerate results for `moveVertically`'s geometry query specifically (Issue 1) | Point-based hit testing (`caretRangeFromPoint`) confirmed **still correct** at `font-size: 0` — only CM6's vertical-motion algorithm degenerates, not general hit-testing | **No** — documented WebKit failure (Issue 1) | **No** — documented failure | Not reported as broken (issue is WebKit-specific) | Not verified here |
| `font-size: 0.01px` | ✅ | ✅ | Near-0 | Near-0, but still in WebKit's degenerate band for ArrowUp | Yes, same bug | Same degenerate band for ArrowUp specifically (Issue 2) | ✅ (unaffected — point-based lookup, not `moveVertically`) | ArrowDown ✅, **ArrowUp ✗** (Issue 2 — threshold is 0.015px fail / 0.018px pass) | **Partially** — fixes Issue 1, not Issue 2 | ✅ | Not verified here |
| `font-size: 0.05px` (current, shipped) | ✅ | ✅ | Near-0, "measured indistinguishable from literal 0" | Near-0, but above the measured WebKit threshold for both directions | Fixed separately via explicit `line-height: 1` on the same rule | ✅ | ✅ | ✅ both directions, full sweep verified (Issue 2) | ✅ (with ~3x safety margin over measured threshold) | ✅ | Not verified here — no reported Firefox-specific issue, but this repo does not target Firefox as a runtime (Tauri = WebKit; web preview presumably Chromium-class); no positive claim should be made without testing |
| `transform: scaleX(0)` | ✅ | ⚠️ untested in this codebase/investigation; visually collapses width but CSS transforms don't change layout box size — the glyph's un-transformed box would still be reserved unless combined with other properties, which would likely reproduce a variant of the transparent-marker's width-reservation problem, not solve it | ❌ (unless separately zeroed) — this is the same failure mode `color: transparent` already hit for inline markers, plausibly worse since the untransformed layout box remains | Unclear/untested | Untested | Untested; no evidence this avoids WebKit's near-zero-font-size caret bug because it doesn't touch font-size at all — a different, unverified risk surface | Untested | Untested | **Not tested against the real WebKit vertical-motion bug this document exists to fix** — no evidence either way | Untested | Untested |
| `display: none` | ❌ removed from render tree | ❌ | ❌ | ❌ | N/A (no box) | ❌ — no coordinates to compute | ❌ | Would presumably work for line reachability generically (no geometry to confuse), but the marker becomes structurally invisible to CM6's DOM↔doc mapping in a way close to `Decoration.replace` — no longer "real text with tiny geometry", so it stops being what the brief calls Option A at all | Untested | Untested | Untested |
| `content-visibility` | Varies by value | Varies | Varies | Untested | Untested | Untested | Untested | Untested | **Not investigated** — designed for skipping rendering work on off-screen content, not a documented concealment technique for this use case; no evidence it was evaluated in `tauri-webkit-editor-issues.md` | — | — |
| `text-indent` (on the marker span) | ✅ | ✅ | Depends how used | Could visually shift the glyph off its own box without reducing its reserved width — likely reproduces `color: transparent`'s width-reservation problem, not a distinct solution | Untested | Untested | Would misalign hit-testing vs. visual position | Untested | Untested | Untested | Untested |
| Zero-width font-family | ✅ | ✅ | Only if the font itself has zero-width glyphs — a real dependency on font availability/rendering fidelity across engines | Depends entirely on font metrics, which vary by engine/OS/font-fallback in ways this repo has no control over | Untested | Untested | Untested | **Unverified and high-risk** — this reintroduces exactly the class of "does the browser's internal metrics degenerate at extreme values" question that produced the WebKit bug being worked around, except now indexed to font-loading/fallback behavior instead of a single CSS number | Untested | Untested | Untested |

### Key relation to how CM6 obtains coordinates

All of these techniques operate on **real text nodes inside a `Decoration.mark`
span** — none of them changes the fact that `TextTile.coordsIn` calls
`getClientRects()` on that node. What changes per-technique is whether the
*returned* rects are meaningful/nonzero/hit-testable, and whether the specific
CSS property interacts with a rendering engine's internal layout/geometry
computation in an unexpected way (as `font-size: 0`/`0.01px` do in WebKit,
per Issues 1–2). This is exactly why `font-size` is the axis that broke — it's
the one property in the table that CM6's `moveVertically` → `coordsAtPos` chain
is sensitive to at extreme values, not because CM6 requires a specific font-size
mechanism, but because WebKit's line-box geometry computation for a near-zero
glyph run happens to degenerate. `opacity`/`color`/`visibility` don't touch glyph
metrics at all, which is exactly why they don't reproduce this failure mode — and
also exactly why `color: transparent` (chosen for blockquote) doesn't collapse
width the way near-zero `font-size` does; it was never trying to.

---

## 4. Re-examining `0.05px` — is it a CM6 requirement or a browser workaround?

**Fully traced, and the answer is unambiguous from this repo's own existing
documentation** (`docs/tauri-webkit-editor-issues.md`, corroborated by
`MarkdownEditor.css:146-185`):

1. **16px editor font size**: established at the `.cm-content`/editor-root level
   (design-system tokens), inherited by every span including marker spans, before
   `.cm-marker--concealed` overrides it.
2. **`.cm-marker--concealed` overrides `font-size` to `0.05px`** on the marker
   span specifically — the base `.cm-marker` rule only sets `color`
   (`MarkdownEditor.css:193-200`); concealment is a second, separate class layered
   on top when the construct is not engaged.
3. **`0px` was rejected first** because it produced a hard, reproducible ArrowDown
   failure in real Safari/WKWebView (Issue 1) — `font-size: 0` on a real
   multi-character text node caused WebKit's line-geometry computation to produce
   degenerate results CM6's `moveVertically` couldn't use, even though point-based
   hit-testing (`caretRangeFromPoint`) on the same node was unaffected.
4. **`0.05px` was selected** after finding ArrowUp has its own, materially higher
   threshold (Issue 2: fails at 0.015px, works at 0.018px) than ArrowDown's fix
   (any nonzero value). `0.05px` is ~3x the measured passing threshold — a
   deliberate safety margin against measurement noise/environment drift, not the
   bare minimum.
5. **This is proven, not assumed, to be a WebKit-only issue** — "no equivalent
   failure exists in Chromium with byte-identical DOM and CSS"
   (`tauri-webkit-editor-issues.md:37`). It is CM6's own `moveVertically`
   algorithm (`cursorLineUp`/`Down`, `preventDefault: true`, no native browser
   fallback in play) running into a WebKit-specific geometry degeneracy at the
   `coordsAtPos` step — not a bug in CM6's algorithm and not a requirement CM6
   imposes on applications.
6. **The "minimum font size" framing is not quite right.** There is no single
   universal minimum — the measured boundary is direction-dependent (`+1`/`-1`
   `coordsAtPos` bias for down/up respectively) and was only characterized in one
   test environment (a specific WebKit build, display scale, zoom level); `0.05px`
   was chosen with margin specifically because the exact threshold is not assumed
   to be stable across those variables.
7. **The separate `line-height: 1` fix is unrelated to the font-size value** — it
   fixes a genuine "0.05px-run inherits 24px line-height and inflates the line
   box to 30px" bug, reproduced identically at `0`, `0.05px`, and `1px`. It's
   scoped correctly as its own fix in `docs/editor-architecture-decisions.md`
   rather than folded into the WebKit-issue doc, since it was never shown to be
   engine-specific.

**Direct answer to the brief's question**: `0.05px` is required because of a
measured **WebKit/browser geometry workaround** for CM6's own (engine-agnostic)
vertical-motion algorithm — not because CM6 itself imposes any minimum font-size
requirement. CM6 doesn't know or care what font-size a mark decoration's span
uses; the constraint is entirely downstream, in how one specific rendering engine
computes line/caret geometry for a near-zero-size text run. This was not
previously conflated in the codebase's own comments (they already state this
correctly) — Pass 3 confirms via primary CM6 source that there's no CM6-level
counter-explanation being missed.

---

## 5. Obsidian — secondary comparison only

Working from the same limited evidence Pass 2 recorded (Obsidian's DOM showed
`cm-widgetBuffer`; no source access, no live behavioral instrumentation):

1. **Native CM6 vs. Obsidian-specific**: `cm-widgetBuffer` is 100% native CM6
   (`WidgetBufferTile`, confirmed above and in Pass 2) — this tells us nothing
   Obsidian-specific about *how* it conceals ordinary formatting markers, only
   that whatever Obsidian is doing involves inline widgets somewhere nearby (CM6
   inserts buffers around any uneditable widget, regardless of the app's reason
   for placing one).
2. **What's actually Obsidian's choice**: the fact that concealed marker
   characters don't appear in Obsidian's DOM as tiny real text (per the prior
   evidence) suggests Obsidian likely uses `Decoration.replace`/widgets for its
   concealed-marker rendering, not a real-text-plus-CSS approach like Clutter's.
   This is an architecture choice HyperMD/Obsidian made, not something CM6
   dictates.
3. **Evidence of widgets specifically for formatting markers**: plausible from
   the DOM shape, but **not proven** — we don't have Obsidian source or
   instrumented behavior confirming this, only an absence of visible marker text
   in a DOM snapshot. This should be reported as an inference, not a fact.
4. **What would be required to make that safe (if true)**: per §1's findings,
   Obsidian would need either (a) `atomicRanges` registration to get sane
   backspace/select semantics for the collapsed marker span, sacrificing
   per-character mid-marker editing entirely (consistent with how many
   "click-to-reveal, else atomic" editors behave), or (b) a custom
   `WidgetType.coordsAt` implementation to preserve any interior addressability
   — either way, **application-owned behavior beyond what CM6 provides by
   default**.
5. **Evidence of CM6 caret/selection overrides**: none available to us either way
   — out of scope without source access.
6. **Would copying Obsidian violate the CM6-first principle?** If Obsidian's
   approach is (as the DOM suggests) full replace/widget concealment for ordinary
   markers, adopting it here would very likely require adding `atomicRanges` (a
   real behavior change, already flagged elsewhere in this repo's docs as
   "already forbidden for ordinary formatting markers") and/or custom
   `coordsAt`/hit-testing logic — i.e., yes, it would mean taking on custom
   editor-behavior overrides CM6 doesn't provide for free, which is exactly the
   category of change Clutter has been avoiding. This reinforces Pass 2's
   conclusion rather than reopening it.

---

## 6. Architecture options — evaluated against the CM6-first principle

| Option | CM6-native? | Preserves per-position addressability? | Custom behavior required? | Verdict |
|---|---|---|---|---|
| **A — real text + tiny font (current)** | Yes (`Decoration.mark` + CSS only) | ✅ full | None — CSS-only, all caret/selection/IME/bidi/undo behavior is native CM6 | **Recommended.** The `0.05px` constant is a browser-compat number to keep re-verifying, not an architecture smell. |
| **B — real text + `color: transparent`** | Yes | ✅ full | None | Technically CM6-safe and already shipped for blockquote, but **already measured and rejected for inline markers in this codebase** — reserves full glyph width (measured 19.5px), visibly widening the gap around every collapsed construct. Not a free alternative to A; it solves a different geometry problem (blockquote's gutter wants reserved width; inline markers don't). |
| **C — real text + another CSS mechanism** | Depends | Depends | Untested options (`opacity: 0`, `visibility: hidden`, transforms) either don't solve the width-collapse requirement the way near-zero `font-size` does, or are simply untested against the specific WebKit vertical-motion bug that's the actual constraint. No evidence any of them is superior to A; several (`transform: scaleX(0)`, zero-width fonts) look likely to reproduce A's width problem or worse without A's proven fix. Not recommended without new WebKit testing that would have to reproduce all of `docs/tauri-webkit-editor-issues.md`'s work from scratch. |
| **D — `Decoration.replace({})`** | Yes | ❌ collapses interior positions to one DOM rect (§1.1) | Only needed if atomicity/hit-testing must also change | Correct and already used for Heading/Link, where the marker is a unit the user doesn't need mid-marker addressability into. **Wrong fit for `**`/`~~`/etc.**, where the brief's own worked example (`**bold**`, cursor between the two `*`s) requires exactly the addressability this option gives up. |
| **E — widget replacement, no atomic ranges** | Partially (uses native primitives, but the *combination* leaves a gap) | ❌ same collapse as D, but even less coherent — CM6 lets the user's cursor motion treat the widget's covered range as ordinary text for deletion purposes while presenting a single visual glyph, an inconsistent UX CM6 does nothing to reconcile automatically | Some (must define `WidgetType.toDOM`/`eq` at minimum) | Not recommended — best case reproduces D's addressability loss with more code, worst case produces confusing delete/select behavior CM6 explicitly leaves unresolved. |
| **F — widget + atomic ranges** | Yes (`atomicRanges` is a real facet) | ❌ full atomicity — an explicit, real semantic change (mid-marker cursor placement, backspace, and selection all become unit operations) | Yes — registering `atomicRanges` for these decorations is exactly the "custom editor behavior" this repo has already ruled out for ordinary formatting markers | Not recommended, per this repo's existing stance and per the worked example in §7. |
| **G — widget + custom `coordsAt`** | Uses native hooks (`WidgetType.coordsAt` is a real, documented extension point), but the *goal* — independent visual coordinates per interior document position of one widget — is not what `coordsAt` was built for; per Pass 2, `WidgetTile.coordsIn` calls it once per query without subdividing the widget into per-character rects; implementing that would mean re-deriving position→pixel mapping for every marker length/wrap case by hand | ⚠️ only as good as a from-scratch reimplementation | Substantial custom code, per-construct, essentially re-implementing what `TextTile` already gives for free | Not recommended — this is the clearest violation of "avoid custom editor-behavior overrides unless CM6 genuinely cannot provide the behavior," since CM6 *can* provide it, via Option A. |
| **H — hybrid (real text engaged, replace/widget disengaged)** | Mixed | ✅ while engaged, ❌ while disengaged | Yes — engagement-state-dependent decoration swapping is already how this codebase's Live Preview generally works (mark ↔ real text vs. replace ↔ widget per engagement), so the *mechanism* isn't new, but applying it to ordinary markers means the addressability gap in D/E/F/G only reappears specifically while the cursor is away from the construct | Only worth it if there's a concrete product reason to want atomic disengaged markers (there isn't one stated in the brief) — otherwise it adds real complexity (two code paths, two sets of caret-behavior guarantees) to solve a problem Option A already solves without it. Not recommended absent a specific driving requirement. |
| **I — other CM6-native technique** | — | — | — | None found. `bidiIsolatedRanges` is orthogonal (visual ordering, not concealment). `outerDecorations` changes decoration precedence/nesting, not concealment. No further primitive turned up in source. |

---

## 7. Visual concealment vs. editor semantics — the worked example

> "Markdown markers are part of the source document. Concealing them visually
> must NOT silently turn them into atomic editor objects unless that is an
> explicit product decision. For ordinary formatting markers, individual source
> positions should remain addressable."

Testing `**bold**`, cursor placed between the two leading `*` characters,
against each option:

- **Option A (current, real text + `0.05px`)**: the two `*` characters are two
  distinct DOM text-node offsets. The browser's native caret placement, backed by
  `TextTile.coordsIn`'s real `getClientRects()`, can address the position between
  them exactly as it would for any other two adjacent characters — it's simply
  rendered at near-zero size. ✅ satisfies the requirement, natively, with zero
  custom code.
- **Option D (`Decoration.replace({})`, no widget)**: `**` becomes a single
  `WidgetTile` of length 2. Per `coordsInWidget`'s fallback (no custom
  `coordsAt`), both positions (`from` and the position between the two `*`s,
  i.e. `from+1`) report the *same* `getBoundingClientRect()` — the browser
  cannot place a caret "between" them because there is only one DOM node to hit.
  ❌ fails the requirement as shipped; would need custom `coordsAt` (Option G) to
  fix, which the brief itself asks us not to reach for by default.
- **Option F (widget + `atomicRanges`)**: the position between the two `*`s
  stops being independently reachable *by design* — `skipAtomicRanges` snaps any
  attempted placement inside `(from, to)` to `from` or `to`. This is not a bug to
  fix, it's the intended effect of the facet — which is exactly why it's the
  wrong tool here: it converts "conceal visually" into "atomic editor object,"
  the precise thing the brief says must not happen silently.

This worked example is the clearest evidence for the recommendation: **Option A
is not just the incumbent, it's the only option in this survey that passes the
brief's own acceptance test without additional custom code.**

---

## Recommendation

1. **Keep Option A** (real text inside `Decoration.mark`, concealed via CSS) for
   ordinary formatting markers. It is the only surveyed option that satisfies
   every one of the twenty behavioral properties in §1 natively, with zero custom
   CM6 overrides, and it is the only option that passes the interior-addressability
   worked example in §7.
2. **Keep `0.05px`, understood correctly**: it is not "the CM6 minimum font
   size" — there is no such thing — it is a measured, WebKit-specific
   safety-margined constant fixing two real, documented Safari bugs
   (`docs/tauri-webkit-editor-issues.md`, Issues 1–2). Treat it the same way the
   codebase already treats it: a value to re-verify against real Safari/WKWebView
   whenever CM6, WebKit, or the design system's base font-size/line-height
   changes — not an architecture decision up for relitigating on CSS-theory
   grounds alone.
3. **Do not adopt `Decoration.replace`/widgets for ordinary formatting markers.**
   This was already Pass 2's conclusion; Pass 3's CM6-source-level investigation
   independently confirms it via a different route (interior-position collapse in
   `WidgetTile.coordsIn`, and the `atomicRanges` facet's explicit opt-in design).
   Nothing in the CM6 source suggests a way to get replace/widget concealment
   without either accepting the addressability loss or building custom
   `coordsAt`/atomicity behavior CM6 does not provide by default.
4. **`color: transparent` remains correctly scoped to blockquote only** — it
   solves a different problem (reserved gutter width) than ordinary inline
   markers need, and the current CSS's own measurement (19.5px reserved width)
   already rules it out for this construct family. No new evidence here changes
   that.
5. **No CSS alternative in §3 is proven superior to `font-size: 0.05px`+
   `line-height: 1`** for this specific, WebKit-caret-motion constraint — several
   (`opacity: 0`, `visibility: hidden`) plausibly avoid the font-size-specific
   degeneracy in theory, but none has been tested against real WKWebView's
   `moveVertically` path the way the current value has, and at least one
   (`visibility: hidden`) trades away native mouse hit-testing, a regression the
   current approach doesn't have. If this is ever revisited, it must go through
   the same real-Safari/OS-level-keyboard-event methodology
   `docs/tauri-webkit-editor-issues.md` used — not theoretical CSS reasoning —
   before replacing a value that has already been through that process.

## Method note

CM6 source claims in this document were verified directly against the installed
`@codemirror/view@6.43.9` (`node_modules/@codemirror/view/dist/index.js` and
`.d.ts`), with supporting greps across `@codemirror/state`, `@codemirror/language`,
`@codemirror/lang-markdown`, `@codemirror/commands`, and `@lezer/markdown` in the
same `node_modules` tree. Line numbers cited refer to that installed build and may
shift on version bumps; re-grep rather than trusting exact line numbers if this
document is consulted after a CM6 upgrade. WebKit-specific claims (§4, and the
WebKit column of §3) are carried over verbatim from
`docs/tauri-webkit-editor-issues.md`'s own real-Safari, OS-level-keyboard-event
methodology — not re-derived or re-tested for this pass.
