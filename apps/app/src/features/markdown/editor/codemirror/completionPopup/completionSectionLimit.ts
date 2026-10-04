import {
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { COMPLETION_ICONS } from './completionIcons';
import type { RowCompletion } from './completionRow';

/** Rows a section shows before "Show N more" — the same as the note picker's `sectionLimit`. */
export const COMPLETION_SECTION_LIMIT = 5;

const toggleSection = StateEffect.define<string>();

/**
 * The sections the user has expanded in the open popup, by name. Editor state, so each editor has
 * its own and a source reads it from `context.state`. Cleared by any document or selection change
 * (typing, accepting, moving the cursor): a new query starts capped again, and nothing outlives
 * the popup it was opened in.
 */
const expandedSections = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(expanded, tr) {
    if (tr.docChanged || tr.selection) {
      return expanded.size > 0 ? new Set() : expanded;
    }
    for (const effect of tr.effects) {
      if (effect.is(toggleSection)) {
        const next = new Set(expanded);
        if (!next.delete(effect.value)) {
          next.add(effect.value);
        }
        expanded = next;
      }
    }
    return expanded;
  },
});

/**
 * A toggle that has asked CM6 for a fresh result and is waiting for it — per editor, with the rows
 * the popup showed when it asked, so the new result can be told apart from the old one.
 */
const refreshing = new WeakMap<EditorView, { section: string; before: readonly Completion[] }>();

/**
 * Where the selection goes once the refreshed result arrives. CM6 builds a refreshed list from
 * scratch: it selects the first row and scrolls to the top, which would throw the user back
 * to the top of a list they had scrolled to the bottom of to press the toggle. So: after
 * expanding, the first row that was hidden; after collapsing, the section's toggle.
 */
function selectionAfterRefresh(options: readonly Completion[], section: string): number {
  const rows = options.flatMap((option, index) => (sectionName(option) === section ? [index] : []));
  const expanded = options[rows[rows.length - 1]!]!.label === 'Show less';
  return expanded ? rows[COMPLETION_SECTION_LIMIT]! : rows[rows.length - 1]!;
}

const keepPlaceAfterRefresh = EditorView.updateListener.of((update) => {
  const waiting = refreshing.get(update.view);
  if (!waiting) {
    return;
  }
  // The popup closed (Escape, a click elsewhere) before the result came: nothing to wait for.
  if (completionStatus(update.state) === null) {
    refreshing.delete(update.view);
    return;
  }
  const options = currentCompletions(update.state);
  // Still the old rows (or disabled, which reads as empty): the refreshed result hasn't arrived.
  if (options.length === 0 || options === waiting.before) {
    return;
  }
  refreshing.delete(update.view);
  const index = selectionAfterRefresh(options, waiting.section);
  // A view can't dispatch inside its own update.
  queueMicrotask(() => update.view.dispatch({ effects: setSelectedCompletion(index) }));
});

/**
 * Until the refreshed result arrives the popup is disabled, so CM6's Enter binding declines and a
 * quick second Enter would reach the editor as a newline. Swallow it for that moment only.
 */
const holdEnterWhileRefreshing = Prec.highest(
  keymap.of([{ key: 'Enter', run: (view) => refreshing.has(view) }])
);

/** The state, selection and key handling "Show N more" needs. Add once per editor. */
export function completionSectionLimit() {
  return [expandedSections, keepPlaceAfterRefresh, holdEnterWhileRefreshing];
}

const sectionName = (option: Completion) => (option as RowCompletion).section?.name;

/**
 * Caps each section of `result` at `COMPLETION_SECTION_LIMIT` rows and ends it with a "Show N
 * more" row — or, once expanded, lists every row and ends with "Show less". The sources stay
 * unaware: they return their whole result, this decides how much of it to show.
 *
 * The toggle is an ordinary completion that changes no text: it flips the section's expanded
 * state and asks CM6 to query the source again (`startCompletion`), which re-runs this with the
 * new state. It is deliberately not annotated `pickedCompletion` — that is what makes CM6 treat
 * an apply as an acceptance and move on; this one must leave the popup open.
 */
function limitSections(result: CompletionResult, expanded: ReadonlySet<string>): CompletionResult {
  const totals = new Map<string, number>();
  for (const option of result.options) {
    const name = sectionName(option);
    if (name) {
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
  }

  const seen = new Map<string, number>();
  const options: Completion[] = [];
  for (const option of result.options) {
    const name = sectionName(option);
    const total = name ? totals.get(name)! : 0;
    if (!name || total <= COMPLETION_SECTION_LIMIT) {
      options.push(option);
      continue;
    }

    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    const open = expanded.has(name);
    if (open || index < COMPLETION_SECTION_LIMIT) {
      options.push(option);
    }
    // The toggle follows the section's last listed row.
    if (index === (open ? total : COMPLETION_SECTION_LIMIT) - 1) {
      options.push(toggleOption(option as RowCompletion, name, open, total - COMPLETION_SECTION_LIMIT));
    }
  }

  return { ...result, options };
}

function toggleOption(sibling: RowCompletion, name: string, open: boolean, hidden: number): RowCompletion {
  const label = open ? 'Show less' : `Show ${hidden} more`;
  return {
    label,
    section: sibling.section,
    row: { iconSvg: COMPLETION_ICONS.moreHorizontal, title: label },
    apply(view: EditorView) {
      refreshing.set(view, { section: name, before: currentCompletions(view.state) });
      view.dispatch({ effects: toggleSection.of(name) });
      startCompletion(view);
    },
  };
}

const NONE: ReadonlySet<string> = new Set();

/** Wraps a completion source so its long sections are capped (see `limitSections`). Needs `completionSectionLimit()` in the editor. */
export function limitCompletionSections(source: CompletionSource): CompletionSource {
  return (context) => {
    const expanded = context.state.field(expandedSections, false) ?? NONE;
    const limit = (result: CompletionResult | null) => (result ? limitSections(result, expanded) : null);
    const result = source(context);
    return result instanceof Promise ? result.then(limit) : limit(result);
  };
}
