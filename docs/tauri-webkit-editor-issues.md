# Tauri / WebKit Editor Issues

## Purpose

This document records WebKit/Tauri-specific behavior discovered while testing the Markdown editor — especially behavior that differs from Chromium and affects DOM rendering, caret geometry, selection, or keyboard navigation. It is the durable record for this class of issue; do not fold this material into the architecture specification, the ADR log, or the editor architecture decisions doc — those govern the editor's design, not browser-engine quirks discovered while verifying it.

## Scope

These are frontend Markdown-editor rendering/caret-navigation issues specific to the Tauri/WebKit runtime. They do not involve backend persistence, the filesystem, the Vault, or any of the twelve subsystems `docs/architecture-specification.md` governs. Nothing in this document should be read as an architecture decision — it is a record of measured browser-engine behavior and the minimal fixes it required.

## Issue 1 — Zero-font-size concealed markers break ArrowDown

**Status: Fixed.**

- **Symptom.** In real Safari/WebKit (and the Tauri WKWebView runtime), pressing ArrowDown from a plain line immediately above a formatted line would skip the formatted line entirely, landing one or more lines further down. Chromium never showed this.
- **Affected marker lengths.** Only constructs whose first rendered marker is **2 or more characters** (`**`, `__`, `~~`, `==`, the double-backtick `InlineCode` delimiter). Constructs whose first marker is exactly one character (`*`, `_`) were unaffected.
- **Reproduction examples (all failed at rest, real Safari):**
  ```markdown
  ~~**Bold strikethrough**~~
  **~~Bold strikethrough~~**
  ~~___Italic bold strikethrough___~~
  ~~**Text**~~
  ****Text****
  ~~**a** and **b**~~
  ~~one~~ text ~~two~~
  ==triple-equals==
  ``code with a backtick``
  ```
  **Unaffected (worked throughout):**
  ```markdown
  ***~~Italic bold strikethrough~~***
  _~~Italic strikethrough~~_
  ```
- **`font-size: 0` behavior.** The at-rest concealment CSS was `.cm-marker--concealed { font-size: 0; }`. This is what produced the failure.
- **Measured Safari/WebKit behavior.** `document.caretRangeFromPoint`/`caretPositionFromPoint` at the exact failing line's coordinates resolved correctly to the right text node — point-based hit-testing was never broken. Horizontal ArrowRight motion could also reach the same positions with no issue. The failure was isolated to vertical caret motion specifically.
- **Why 1-character vs 2-character markers appeared to distinguish failures.** This was the first observable signal, but it was a *symptom* of the real variable (see below), not itself the mechanism — a 1-character concealed run happened to sit on the working side of the underlying threshold at `font-size: 0`, and a 2-character run did not, for reasons rooted in WebKit's internal geometry handling of zero-size text runs, not in character count as such.
- **Actual root cause.** `font-size: 0` on a real, DOM-present, multi-character text node causes Safari/WebKit's line-geometry computation to produce degenerate results that CM6's own vertical-motion algorithm (see Issue 2 for the full mechanism) cannot use to correctly locate the line. This is WebKit-specific: no equivalent failure exists in Chromium with byte-identical DOM and CSS.
- **Why `font-size: 0.01px` fixed ArrowDown.** Any measured nonzero font-size value removed the degenerate case for the ArrowDown direction specifically (later shown in Issue 2 to be a *direction-dependent* threshold, not a universal "any nonzero value" fix — see below).
- **Verification at the time.** Full ArrowDown sweep through a 13-line document containing every combination above landed on each physical line in order, zero skips, with `font-size: 0.01px`. Confirmed `getBoundingClientRect()` width was reduced to a fraction of a pixel (`~0.01px`) with no visible marker glyph and no reserved gutter width, and that reverting to `font-size: 0` on the same document reproduced the original failure — ruling out a false negative in the test method itself.

## Issue 2 — Near-zero marker size breaks ArrowUp

**Status: Fixed.**

- **Observed behavior.** With `font-size: 0.01px` in place (Issue 1's fix), ArrowDown was fully correct, but ArrowUp still failed: starting from a formatted line and pressing ArrowUp could jump past one or more physical lines above it, landing on a line further away than the immediate predecessor.
- **Formatted → formatted upward transition failure.** The failure is specific to moving *up* from one physical line into another. A transition from a formatted line up into an adjacent **plain** line always worked correctly, regardless of the formatted line's own marker. Only formatted-line-to-formatted-line upward transitions were at risk.
- **Destination marker determines the failure, not the source.** Verified with four minimal-pair documents (`*italic*` = 1-char marker, `**bold**` = 2-char marker):
  - 2-char source → 2-char destination: **fails**
  - 1-char source → 1-char destination: **works**
  - 1-char source → 2-char destination: **fails**
  - 2-char source → 1-char destination: **works**

  The source line's own marker length was irrelevant in every case; only the destination line's (the line above, the one ArrowUp is trying to land on) leading marker length determined success or failure.
- **Cascading.** A single ArrowUp press does not stop at the first bad line — it skips every consecutive formatted line above the start until it reaches a line that is either plain or has a 1-character leading marker. Demonstrated by inserting one plain line in the middle of a run of `**bold**`-style lines: ArrowUp from below stopped exactly at the inserted plain line, not at the very top of the document.
- **ArrowDown still works.** Confirmed via full sweep on the same document/CSS state that produced the ArrowUp failure — this is a direction-specific defect, not a general regression of Issue 1's fix.
- **Measured threshold** (font-size of `.cm-marker--concealed`, all other CSS unchanged):

  | `font-size` | ArrowUp result |
  |---|---|
  | `0`, `0.005px`, `0.01px`, `0.011px`–`0.015px` | fails |
  | `0.018px`, `0.019px`, `0.02px`, `0.05px` … through `2px` | works |

  The boundary sits between `0.015px` (fails) and `0.018px` (works), measured in this environment. This is a materially higher threshold than Issue 1's ArrowDown fix required (any nonzero value sufficed there).
- **`moveVertically` involvement.** CM6 owns ArrowUp/ArrowDown entirely — `defaultKeymap` binds both to `cursorLineUp`/`cursorLineDown` with `preventDefault: true` (verified directly against the installed `@codemirror/commands`/`@codemirror/view` source, not assumed), so there is no native browser fallback in play at any point. `cursorLineUp`/`Down` call `view.moveVertically`, a pure CM6 JS algorithm: it reads the caret's pixel position via `view.coordsAtPos(pos, bias)`, then scans candidate y-coordinates via `posAtCoords` in `halfText`-sized steps until the resulting position's line has crossed the starting line.
- **Direction-dependent geometry/bias.** `moveVertically`'s call to `coordsAtPos` passes `bias: +1` when moving down and `bias: -1` when moving up (verified in source). This is a genuine, code-level asymmetry between the two directions that exists regardless of which browser engine is running. It is the mechanism by which identical CM6 code can behave differently per direction when the underlying browser's geometry reporting for a given DOM shape differs by which "side" of a position is queried.
- **Distinction between proven and inferred.** Proven, by direct measurement: the failure exists, it is destination-marker-length-dependent, it cascades, ArrowDown is unaffected, the exact font-size threshold band, and that CM6 (not native WebKit) owns the algorithm with a direction-dependent bias. **Inferred, not proven:** the specific internal WebKit mechanism that causes font-size values below ~0.015–0.018px to be treated as degenerate for this particular geometry query. This document does not have access to WebKit's own source and cannot point to the exact internal code path — treat "WebKit-internal font-size quantization/rounding boundary" as the best-supported description of *what* is happening, not a citation of *why* WebKit implements it that way.
- **Final CSS value chosen and why.** `font-size: 0.05px`, replacing the `0.01px` from Issue 1. This is roughly 3x the measured `0.018px` passing threshold and over 3x the `0.015px` failing threshold — a deliberate safety margin, not the bare minimum that happened to pass one test run, in case the exact threshold shifts slightly across display scale factors, zoom levels, or WebKit versions not directly tested here. `0.02px` and `0.1px` were also measured to work reliably (each across 3 repeated full-document sweeps); `0.05px` was chosen as the smallest value with a comfortable margin rather than the smallest value that merely passed.

## Issue 3 — Status: not a separate issue (folded into Issue 2)

An earlier observation recorded `***~~Italic bold strikethrough~~***` jumping directly from line 10 to line 0 on a single ArrowUp, reproduced with both `font-size: 0` and `font-size: 0.01px`. Once Issue 2's destination-marker-length rule and cascade behavior were fully characterized, this exact case was re-tested in isolation (a 13-line document with 9 plain filler lines, `***~~...~~***` at line 10) — a single ArrowUp under `font-size: 0.05px` now lands correctly on line 9, the true adjacent line. This was Issue 2 manifesting on one specific construct, not a third, distinct defect — there is no remaining Issue 3.

## Reproduction corpus

The full set of constructs used to validate Issues 1 and 2, combined into one document (each line a distinct physical `.cm-line`):

```markdown
~~**Bold strikethrough**~~
**~~Bold strikethrough~~**
~~***Italic bold strikethrough***~~ __Bold__
~~_Italic strikethrough_~~
~~__Bold strikethrough__~~
__~~Bold strikethrough~~__
~~___Italic bold strikethrough___~~
~~***Text***~~
****Text****
~~**a** and **b**~~
~~one~~ text ~~two~~
==triple-equals==
``code with ` a backtick``
==triple-equals==
```

Known combinations that behaved differently during the original investigation (all now pass with `font-size: 0.05px`):

```markdown
Italic strikethrough~~*
***~~Italic bold strikethrough~~***
_~~Italic strikethrough~~_
```

## Testing methodology

These conclusions were obtained using:

- Real Safari (a genuine WebKit engine), driven via AppleScript/System Events sending real, trusted, OS-level keyboard events — not synthetic/CDP-dispatched key events. This distinction matters: CM6's vertical motion is triggered by a `keydown` handler in its keymap, and while that handler itself doesn't require a "trusted" event to run, an in-app sandboxed Chromium automation pane was found, during this investigation, to not reliably deliver key events that CM6 processes as a real user keypress — real Safari via OS-level input was the only reliable surface for this class of bug.
- A real `vite` dev server bound to the actual host network (not a sandboxed/proxied preview), so real Safari could connect to it directly.
- Selection position read via `window.getSelection()` and cross-referenced against `.cm-line` DOM order after every single keypress — never assumed from the number of presses sent.
- Minimal-pair testing: starting from a plain-only control document, then introducing exactly one variable at a time (single construct, single marker length, single direction) before combining into the full reproduction corpus.
- CSS overrides injected via `document.head.appendChild(styleEl)` through Safari's "Allow JavaScript from Apple Events" scripting bridge, used **only** during diagnosis — every experimental value was applied as a temporary injected `<style>` block, verified, then removed (`inject_css.sh` with an empty file), never by editing the actual `MarkdownEditor.css` file until the final chosen value was confirmed.
- After settling on a value, the actual production CSS file was edited and re-verified against the same real-Safari test document and keyboard-input method, to confirm the shipped file (not an injected override) produces the fix.

## Reproduction principles

- Real Tauri/WebKit testing is required for WebKit-specific caret behavior — it cannot be inferred from Chromium testing, jsdom (which stubs out real layout entirely), or CM6's source alone.
- Synthetic browser key events, particularly through a sandboxed/CDP-driven automation surface, may not exercise the same code path a genuine keypress does. If a synthetic test shows "stuck" behavior even for a trivial, unrelated case, suspect the test harness before suspecting the application.
- Point-based caret hit testing (`caretRangeFromPoint`/`caretPositionFromPoint`) and native or CM6-driven ArrowUp/ArrowDown movement are not the same code path and can disagree — a position being a valid hit-test target does not mean vertical motion can land on it.
- DOM validity (a real, present, correctly-styled node) does not guarantee that a caret-navigation algorithm — whether native or CM6's own — will treat that position as a reachable target.
- CSS values that appear visually and even geometrically equivalent (e.g. `0.01px` vs `0.05px` — both report `getBoundingClientRect().height: 0`, both are visually imperceptible) can still produce different caret/layout behavior in WebKit. Measuring the *outcome* (does navigation work) is not optional even when the *visible* geometry looks identical.
- A fix proven for one direction (ArrowDown) is not automatically proven for the reverse (ArrowUp) — CM6's own algorithm is not symmetric between the two (`coordsAtPos` bias differs by direction), so both directions must be independently tested against real WebKit before a fix is considered complete.

## Regression requirements

Rather than hardcoding every Markdown combination into navigation logic, the durable regression expectations are:

- Every physical `.cm-line` must be reachable by ArrowDown, starting from the line above it.
- Every physical `.cm-line` must be reachable by ArrowUp, starting from the line below it (i.e., the reverse of the above, not merely "ArrowDown then ArrowUp cancels out").
- Horizontal ArrowLeft/ArrowRight navigation must remain functional and unaffected by any concealment-related CSS change.
- Concealed markers (`cm-marker--concealed`) must remain visually negligible — no visible glyph, no meaningful reserved gutter width, regardless of which construct or how deeply nested.
- No construct-specific, combination-specific, or per-line navigation logic should ever be introduced to solve a caret-navigation defect of this class — if a fix requires naming a specific Markdown combination, that is a signal the true fix belongs at the CSS/DOM/geometry level, not the navigation layer.
