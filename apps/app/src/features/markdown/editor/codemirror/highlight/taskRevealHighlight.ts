import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
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
 * `TASK_REVEAL_HIGHLIGHT_MS` or immediately on the next editor interaction.
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
export const clearTaskRevealHighlight = StateEffect.define<null>();

const TASK_REVEAL_HIGHLIGHT_MS = 3000;

const taskRevealLineMark = Decoration.line({ attributes: { class: 'cm-task-reveal-line' } });

/** `effect.value.to` is unused here — a task occurrence is always rendered as a single-line cue, its own `from`'s line, matching the product spec's "highlight the task's line" (never a multi-line span). */
function buildTaskRevealDecoration(doc: { length: number; lineAt(pos: number): { from: number } }, range: TaskRevealRange): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const line = doc.lineAt(Math.min(Math.max(range.from, 0), doc.length));
  builder.add(line.from, line.from, taskRevealLineMark);
  return builder.finish();
}

const taskRevealHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let deco = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setTaskRevealHighlight)) {
        deco = buildTaskRevealDecoration(tr.state.doc, effect.value);
      } else if (effect.is(clearTaskRevealHighlight)) {
        deco = Decoration.none;
      }
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Owns the highlight's lifetime: starts (and restarts) a
 * `TASK_REVEAL_HIGHLIGHT_MS` timer whenever `setTaskRevealHighlight` is
 * dispatched, dispatching `clearTaskRevealHighlight` itself when it elapses.
 * The companion `mousedown` handler below (immediate-clear-on-interaction)
 * dispatches that same effect, which this plugin also observes — so a
 * manual clear always cancels the pending timer too, with the state field
 * as the single source of truth for whether the highlight is currently on.
 */
class TaskRevealLifecycle implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setTaskRevealHighlight)) {
          this.restartTimer();
        } else if (effect.is(clearTaskRevealHighlight)) {
          this.cancelTimer();
        }
      }
    }
  }

  destroy() {
    this.cancelTimer();
  }

  private restartTimer() {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.view.dispatch({ effects: clearTaskRevealHighlight.of(null) });
    }, TASK_REVEAL_HIGHLIGHT_MS);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Clears the highlight the instant the user interacts with the editor
 * again (mousedown anywhere in the content), per the product spec's
 * "disappears immediately on interaction" requirement — not just letting
 * the 3-second timer run out. Returns `false`/`undefined` unconditionally:
 * this only ever adds a side-effect dispatch alongside CM6's own click
 * handling, never intercepts or suppresses it, so normal caret placement,
 * drag-selection, and every other mousedown-driven behavior elsewhere in
 * the editor continue exactly as before.
 */
const taskRevealClearOnInteraction = EditorView.domEventHandlers({
  mousedown(_event, view) {
    if (view.state.field(taskRevealHighlightField) !== Decoration.none) {
      view.dispatch({ effects: clearTaskRevealHighlight.of(null) });
    }
    return false;
  },
});

export function taskRevealHighlight(): Extension {
  return [taskRevealHighlightField, ViewPlugin.fromClass(TaskRevealLifecycle), taskRevealClearOnInteraction];
}
