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
 * Temporary "you've landed here" cue for Tasks sidebar's "Open in note"
 * navigation (`MarkdownEditor.tsx`'s `revealRange`) — a `Decoration.line`
 * background on the task's own line, auto-cleared after
 * `TASK_REVEAL_HIGHLIGHT_MS` or immediately on the next editor interaction,
 * in both cases via a smooth fade rather than disappearing abruptly (see
 * `TaskRevealState`'s own doc comment for the three-state lifecycle that
 * makes the fade-out animate).
 *
 * Deliberately **not** an `EditorSelection`. Selecting the task's text to
 * "show where it is" was the prior implementation's actual bug: a
 * selection is live editing state, so typing immediately after navigation
 * replaced the task instead of inserting at the user's real cursor. A
 * `Decoration.line` is pure rendering — it cannot be typed over, and
 * `revealRange` leaves the document's real selection completely untouched
 * (see that method's own doc comment).
 */
export interface TaskRevealRange {
  readonly from: number;
  readonly to: number;
}

export const setTaskRevealHighlight = StateEffect.define<TaskRevealRange>();
/** Internal to this module — starts the fade-out (background → transparent) without yet discarding the decoration. Dispatched by `TaskRevealLifecycle`'s own timer and by the mousedown handler below; never dispatched directly by callers outside this file. */
const startTaskRevealFadeOut = StateEffect.define<null>();
export const clearTaskRevealHighlight = StateEffect.define<null>();

const TASK_REVEAL_HIGHLIGHT_MS = 2500;
/**
 * Must match `MarkdownEditor.css`'s own `.cm-task-reveal-line` rule's
 * `transition: background-color <duration> ease` — not derived from it
 * (CSS and TS share no constant here, the same manually-kept-in-sync
 * relationship `taskRevealLineMark`'s classes already have with that same
 * CSS file). This is how long `clearTaskRevealHighlight` waits after
 * `startTaskRevealFadeOut` before actually discarding the decoration, so
 * the fade is never cut off mid-animation.
 */
const TASK_REVEAL_FADE_MS = 400;

/**
 * `null` — no highlight. `{ line, visible: true }` — the highlight's
 * normal "just revealed" state: `cm-task-reveal-line` (the class carrying
 * `background-color`'s `transition`) plus the `--visible` modifier (the
 * actual highlighted color), so the color transitions in from the base
 * class's own `transparent` the instant both are applied together — the
 * same "toggle a modifier class on an element whose transition is already
 * declared" mechanism that makes the fade-*out* below animate too.
 * `{ line, visible: false }` — fading out: `--visible` has been removed
 * while the base class (and therefore its transition) stays, so the
 * background animates back to transparent instead of vanishing instantly.
 * The decoration itself is only ever discarded (→ `null`) once that
 * animation has actually had time to finish (`TASK_REVEAL_FADE_MS`,
 * `TaskRevealLifecycle` below) — never at the same instant the fade starts.
 */
interface TaskRevealState {
  readonly line: number;
  readonly visible: boolean;
}

function taskRevealLineMark(visible: boolean): Decoration {
  return Decoration.line({
    attributes: { class: visible ? 'cm-task-reveal-line cm-task-reveal-line--visible' : 'cm-task-reveal-line' },
  });
}

function decorationsFor(state: TaskRevealState | null): DecorationSet {
  if (!state) {
    return Decoration.none;
  }
  return Decoration.set([taskRevealLineMark(state.visible).range(state.line)]);
}

const taskRevealStateField = StateField.define<TaskRevealState | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    if (next && tr.docChanged) {
      const mappedPos = tr.changes.mapPos(next.line, -1);
      const line = tr.state.doc.lineAt(Math.min(Math.max(mappedPos, 0), tr.state.doc.length));
      next = { ...next, line: line.from };
    }
    for (const effect of tr.effects) {
      if (effect.is(setTaskRevealHighlight)) {
        const line = tr.state.doc.lineAt(
          Math.min(Math.max(effect.value.from, 0), tr.state.doc.length)
        );
        next = { line: line.from, visible: true };
      } else if (effect.is(startTaskRevealFadeOut)) {
        next = next ? { ...next, visible: false } : null;
      } else if (effect.is(clearTaskRevealHighlight)) {
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
 * `TASK_REVEAL_HIGHLIGHT_MS` after `setTaskRevealHighlight`, dispatches
 * `startTaskRevealFadeOut` (begins the CSS transition back to
 * transparent); `TASK_REVEAL_FADE_MS` after *that*, dispatches
 * `clearTaskRevealHighlight` (discards the decoration, now that the
 * transition has had time to actually finish). The companion `mousedown`
 * handler below dispatches `startTaskRevealFadeOut` directly (skipping
 * straight to stage two) so a click fades the highlight out immediately
 * instead of waiting out the rest of `TASK_REVEAL_HIGHLIGHT_MS` — both
 * paths converge on the same fade-then-clear timer here, so there is one
 * fade-out mechanism, not two.
 */
class TaskRevealLifecycle implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setTaskRevealHighlight)) {
          this.scheduleFadeOutStart();
        } else if (effect.is(startTaskRevealFadeOut)) {
          this.scheduleClear();
        } else if (effect.is(clearTaskRevealHighlight)) {
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
      this.view.dispatch({ effects: startTaskRevealFadeOut.of(null) });
    }, TASK_REVEAL_HIGHLIGHT_MS);
  }

  private scheduleClear() {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.view.dispatch({ effects: clearTaskRevealHighlight.of(null) });
    }, TASK_REVEAL_FADE_MS);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Starts the same smooth fade-out the `TASK_REVEAL_HIGHLIGHT_MS` timer
 * would eventually start on its own, the instant the user interacts with
 * the editor again (mousedown anywhere in the content) — per the product
 * spec's "clicking should trigger the same smooth fade-out rather than an
 * instant disappearance." Only while still in the `visible` stage: a click
 * that lands *during* an already-running fade is a no-op (the fade is
 * already underway; restarting it would just needlessly reschedule the
 * same transition). Returns `false`/`undefined` unconditionally: this only
 * ever adds a side-effect dispatch alongside CM6's own click handling,
 * never intercepts or suppresses it, so normal caret placement,
 * drag-selection, and every other mousedown-driven behavior elsewhere in
 * the editor continue exactly as before.
 */
const taskRevealClearOnInteraction = EditorView.domEventHandlers({
  mousedown(_event, view) {
    const state = view.state.field(taskRevealStateField);
    if (state?.visible) {
      view.dispatch({ effects: startTaskRevealFadeOut.of(null) });
    }
    return false;
  },
});

export function taskRevealHighlight(): Extension {
  return [taskRevealStateField, ViewPlugin.fromClass(TaskRevealLifecycle), taskRevealClearOnInteraction];
}
