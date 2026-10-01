import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * The generic "you've landed here" cue behind every navigate-to-content-
 * in-the-editor flow — Tasks sidebar's "Show in note" and Tag collection's
 * "Open note" today, the intended mechanism for any future search/
 * backlink/mention navigation too (see this module's own doc comment
 * further down, and `MarkdownEditor.tsx`'s `applyEditorReveal`/
 * `revealRange`/`revealRanges`). One or more `Decoration.line` backgrounds
 * on the target line(s), auto-cleared after `REVEAL_HIGHLIGHT_MS` or
 * immediately on the next editor interaction, in both cases via a smooth
 * fade rather than disappearing abruptly (see `RevealState`'s own doc
 * comment for the three-stage lifecycle that makes the fade-out animate).
 *
 * Deliberately **not** an `EditorSelection`, and always a whole-*line*
 * decoration, never a text-range one — the permanent Clutter interaction
 * rule this module exists to enforce for every caller: "navigate to
 * content → scroll to it → reveal the entire line." Selecting the target
 * text to "show where it is" was the original (Task-only) implementation's
 * actual bug: a selection is live editing state, so typing immediately
 * after navigation replaced the target instead of inserting at the user's
 * real cursor. A `Decoration.line` is pure rendering — it cannot be typed
 * over — and every caller leaves the document's real selection completely
 * untouched (see `applyEditorReveal`'s own doc comment in
 * `MarkdownEditor.tsx`). This module itself only ever converts a caller's
 * given position to its *containing line* (`decorationsFor` below) — a
 * caller resolves which occurrence/range is relevant; this module decides
 * how to paint it, and that painting is always line-granularity, by
 * construction (there is no code path here that decorates a sub-line
 * range).
 */
export interface RevealRange {
  readonly from: number;
  readonly to: number;
}

/**
 * One or more target ranges to reveal simultaneously — a single-task
 * "Show in note" passes one; a tag with several occurrences in the same
 * note passes one per occurrence (deduplicated to their containing lines
 * by this module, not by the caller — see `decorationsFor`). Every target
 * line is highlighted at the same time, for the same duration, and fades
 * out together.
 */
export const setRevealHighlight = StateEffect.define<readonly RevealRange[]>();
/** Internal to this module — starts the fade-out (background → transparent) without yet discarding the decoration. Dispatched by `RevealHighlightLifecycle`'s own timer and by the mousedown handler below; never dispatched directly by callers outside this file. */
const startRevealFadeOut = StateEffect.define<null>();
export const clearRevealHighlight = StateEffect.define<null>();

const REVEAL_HIGHLIGHT_MS = 2500;
/**
 * Must match `MarkdownEditor.css`'s own `.cm-reveal-line` rule's
 * `transition: background-color <duration> ease` — not derived from it
 * (CSS and TS share no constant here, the same manually-kept-in-sync
 * relationship `revealLineMark`'s classes already have with that same CSS
 * file). This is how long `clearRevealHighlight` waits after
 * `startRevealFadeOut` before actually discarding the decoration, so the
 * fade is never cut off mid-animation.
 */
const REVEAL_FADE_MS = 400;

/**
 * `null` — no highlight. `{ lines, visible: true }` — the highlight's
 * normal "just revealed" state: every line in `lines` gets
 * `cm-reveal-line` (the class carrying `background-color`'s `transition`)
 * plus the `--visible` modifier (the actual highlighted color), so the
 * color transitions in from the base class's own `transparent` the
 * instant both are applied together — the same "toggle a modifier class
 * on an element whose transition is already declared" mechanism that
 * makes the fade-*out* below animate too. `{ lines, visible: false }` —
 * fading out: `--visible` has been removed from every line while the base
 * class (and therefore its transition) stays, so each line's background
 * animates back to transparent instead of vanishing instantly. The
 * decoration itself is only ever discarded (→ `null`) once that animation
 * has actually had time to finish (`REVEAL_FADE_MS`,
 * `RevealHighlightLifecycle` below) — never at the same instant the fade
 * starts.
 */
interface RevealState {
  readonly lines: readonly number[];
  readonly visible: boolean;
}

function revealLineMark(visible: boolean): Decoration {
  return Decoration.line({
    attributes: { class: visible ? 'cm-reveal-line cm-reveal-line--visible' : 'cm-reveal-line' },
  });
}

/**
 * Converts each target range to its *containing line*'s own start
 * position — the one place in this module (and therefore the one place
 * for every caller, Task/Tag/future consumers alike) that a caller's
 * range becomes a line-granularity decoration — deduplicated (`Set`, so a
 * line hit by more than one occurrence is only ever decorated once) and
 * sorted ascending (`Decoration.set`'s own ordering requirement).
 */
function linesFor(doc: { length: number; lineAt(pos: number): { from: number } }, ranges: readonly RevealRange[]): readonly number[] {
  const lines = new Set<number>();
  for (const range of ranges) {
    const clamped = Math.min(Math.max(range.from, 0), doc.length);
    lines.add(doc.lineAt(clamped).from);
  }
  return [...lines].sort((a, b) => a - b);
}

function decorationsFor(state: RevealState | null): DecorationSet {
  if (!state || state.lines.length === 0) {
    return Decoration.none;
  }
  const mark = revealLineMark(state.visible);
  return Decoration.set(state.lines.map((line) => mark.range(line)));
}

const revealStateField = StateField.define<RevealState | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    if (next && tr.docChanged) {
      const mappedLines = next.lines.map((line) => {
        const mapped = tr.changes.mapPos(line, -1);
        return tr.state.doc.lineAt(Math.min(Math.max(mapped, 0), tr.state.doc.length)).from;
      });
      // Re-dedupe/re-sort: a doc change can map two previously-distinct
      // lines onto the same one (or change their relative order is not
      // actually possible for a `mapPos`, but dedup still matters).
      next = { ...next, lines: [...new Set(mappedLines)].sort((a, b) => a - b) };
    }
    for (const effect of tr.effects) {
      if (effect.is(setRevealHighlight)) {
        next = { lines: linesFor(tr.state.doc, effect.value), visible: true };
      } else if (effect.is(startRevealFadeOut)) {
        next = next ? { ...next, visible: false } : null;
      } else if (effect.is(clearRevealHighlight)) {
        next = null;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, decorationsFor),
});

/**
 * Owns the highlight's lifetime, in two timed stages per the product
 * spec's "stay visible → fade out smoothly → disappear completely":
 * `REVEAL_HIGHLIGHT_MS` after `setRevealHighlight`, dispatches
 * `startRevealFadeOut` (begins the CSS transition back to transparent on
 * every revealed line at once); `REVEAL_FADE_MS` after *that*, dispatches
 * `clearRevealHighlight` (discards the decoration, now that the
 * transition has had time to actually finish). The companion `mousedown`
 * handler below dispatches `startRevealFadeOut` directly (skipping
 * straight to stage two) so a click fades the highlight out immediately
 * instead of waiting out the rest of `REVEAL_HIGHLIGHT_MS` — both paths
 * converge on the same fade-then-clear timer here, so there is one
 * fade-out mechanism, not two.
 */
class RevealHighlightLifecycle implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setRevealHighlight)) {
          this.scheduleFadeOutStart();
        } else if (effect.is(startRevealFadeOut)) {
          this.scheduleClear();
        } else if (effect.is(clearRevealHighlight)) {
          this.cancelTimer();
        }
      }
    }
  }

  destroy() {
    this.cancelTimer();
  }

  private scheduleFadeOutStart() {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.view.dispatch({ effects: startRevealFadeOut.of(null) });
    }, REVEAL_HIGHLIGHT_MS);
  }

  private scheduleClear() {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.view.dispatch({ effects: clearRevealHighlight.of(null) });
    }, REVEAL_FADE_MS);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Starts the same smooth fade-out the `REVEAL_HIGHLIGHT_MS` timer would
 * eventually start on its own, the instant the user interacts with the
 * editor again (mousedown anywhere in the content) — per the product
 * spec's "clicking should trigger the same smooth fade-out rather than an
 * instant disappearance." Only while still in the `visible` stage: a
 * click that lands *during* an already-running fade is a no-op (the fade
 * is already underway; restarting it would just needlessly reschedule the
 * same transition). Returns `false`/`undefined` unconditionally: this
 * only ever adds a side-effect dispatch alongside CM6's own click
 * handling, never intercepts or suppresses it, so normal caret placement,
 * drag-selection, and every other mousedown-driven behavior elsewhere in
 * the editor continue exactly as before.
 */
const revealClearOnInteraction = EditorView.domEventHandlers({
  mousedown(_event, view) {
    const state = view.state.field(revealStateField);
    if (state?.visible) {
      view.dispatch({ effects: startRevealFadeOut.of(null) });
    }
    return false;
  },
});

export function editorRevealHighlight(): Extension {
  return [revealStateField, ViewPlugin.fromClass(RevealHighlightLifecycle), revealClearOnInteraction];
}
