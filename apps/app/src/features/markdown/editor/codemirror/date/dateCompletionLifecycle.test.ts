// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { acceptCompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';

import { markdownLanguageExtension } from '../markdownLanguage';
import { semanticCompletion } from '../completion';

/**
 * Integration-level regression coverage for the Date-autocomplete
 * accept/reopen lifecycle bug (accepting `@to` → `@2026-08-20`, then
 * pressing Space, incorrectly reopened the popup).
 *
 * Deliberately does NOT hand-build a `CompletionContext` anywhere — that
 * was exactly the gap in the test that previously gave false confidence
 * (see `dateCompletionSource.test.ts`'s own note): it proved
 * `dateCompletionSource` returns the right value for a given position,
 * never that CM6's real `completionState` machinery would call it with
 * that position, or at all, after a real Accept + Space. Every test here
 * instead drives the *actual* `semanticCompletion()` extension (the exact
 * wiring `MarkdownEditor.tsx` mounts) with real `input.type`-tagged
 * keystrokes and CM6's own `acceptCompletion`/`completionStatus`/
 * `currentCompletions` APIs — the same lifecycle a real keyboard user
 * drives.
 *
 * Timing note: CM6's `autocompletion()` debounces a fresh query by
 * `activateOnTypingDelay` (100ms) and refuses to accept a completion
 * within `interactionDelay` (75ms) of it becoming active — both undocumented
 * implementation constants confirmed by reading `@codemirror/autocomplete`'s
 * own source during this investigation, not assumed. `type()` waits past
 * the first after every keystroke; `settle()` clears the second before any
 * `acceptCompletion()` call.
 */

function mount(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [markdownLanguageExtension(), semanticCompletion(() => undefined)],
    }),
    parent,
  });
}

async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Types `text` one character at a time as real `input.type` transactions, letting each keystroke's debounced query resolve before the next. */
async function type(view: EditorView, text: string): Promise<void> {
  for (const char of text) {
    view.dispatch({
      changes: { from: view.state.selection.main.head, insert: char },
      selection: { anchor: view.state.selection.main.head + 1 },
      userEvent: 'input.type',
    });
    await settle();
  }
}

/** Accepts the currently active completion via CM6's real `acceptCompletion` command — the same function the Enter keymap binding calls. */
function accept(view: EditorView): void {
  const accepted = acceptCompletion(view);
  expect(accepted).toBe(true);
}

function labels(view: EditorView): string[] {
  return currentCompletions(view.state).map((completion) => completion.label);
}

describe('Date autocomplete — real CM6 accept/reopen lifecycle', () => {
  it('1. @to → accept with Enter → Space → no popup', async () => {
    const view = mount();
    await type(view, '@to');
    expect(labels(view)).toEqual(['Today']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toMatch(/^@\d{4}-\d{2}-\d{2}$/);
    expect(completionStatus(view.state)).toBeNull();

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();
    expect(currentCompletions(view.state)).toEqual([]);

    view.destroy();
  });

  it('2. @12 → accept → Space → no popup', async () => {
    const view = mount();
    await type(view, '@12');
    expect(labels(view)).toEqual(['Today 12:00 PM']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toMatch(/^@\d{4}-\d{2}-\d{2}$/);
    expect(completionStatus(view.state)).toBeNull();

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('3. @12 mar → accept → Space → no popup', async () => {
    const view = mount();
    await type(view, '@12');
    await type(view, ' ');
    await type(view, 'mar');
    expect(labels(view)).toEqual(['March 12, 2027']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toBe('@2027-03-12');
    expect(completionStatus(view.state)).toBeNull();

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('4. @2027 jan → accept → Space → no popup', async () => {
    const view = mount();
    await type(view, '@2027');
    await type(view, ' ');
    await type(view, 'jan');
    expect(labels(view)).toEqual(['January 1, 2027']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toBe('@2027-01-01');
    expect(completionStatus(view.state)).toBeNull();

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('5. @2027 jan 12 → accept → Space → no popup', async () => {
    const view = mount();
    await type(view, '@2027');
    await type(view, ' ');
    await type(view, 'jan');
    await type(view, ' ');
    await type(view, '12');
    expect(labels(view)).toEqual(['January 12, 2027']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toBe('@2027-01-12');
    expect(completionStatus(view.state)).toBeNull();

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });

  it('6. manually typing a complete absolute date (never accepted) → Space → no popup', async () => {
    const view = mount();
    await type(view, '@2026-08-22');
    // A fully-typed valid ISO date is still its own echoed-back suggestion
    // at this exact position (pre-existing, intentional — see
    // dateSuggestion.ts's own doc comment) — the point under test is what
    // happens next, not this line.
    expect(labels(view)).toEqual(['2026-08-22']);

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();
    expect(view.state.doc.toString()).toBe('@2026-08-22 ');

    view.destroy();
  });

  it('7. composing "@12 " without accepting — completion remains available', async () => {
    const view = mount();
    await type(view, '@12');
    await type(view, ' ');

    expect(completionStatus(view.state)).toBe('active');
    expect(labels(view)).toEqual(['Today 12:00 PM']);

    view.destroy();
  });

  it('8. continuing "@12 " → "mar" — completion remains available and resolves correctly', async () => {
    const view = mount();
    await type(view, '@12');
    await type(view, ' ');
    expect(completionStatus(view.state)).toBe('active');

    await type(view, 'mar');

    expect(completionStatus(view.state)).toBe('active');
    expect(labels(view)).toEqual(['March 12, 2027']);

    await settle();
    accept(view);
    expect(view.state.doc.toString()).toBe('@2027-03-12');

    view.destroy();
  });

  /**
   * Exact reproduction of the coordinate-space bug found via live browser
   * instrumentation: `dateTrigger.ts`'s closed-expression check compared
   * `textBeforeCursor.length > atIndex + closedDate.end`, but
   * `closedDate.end` (from `scanDate`) is already an index into
   * `textBeforeCursor` itself — adding `atIndex` again double-counted it.
   * This was invisible for every prior test in this file because each one
   * has its (only) Date start at column 0, where `atIndex === 0` makes the
   * bug a no-op. Only a Date preceded by other text — here, earlier Date
   * tokens on the same line — exposes it, which is exactly what the real
   * browser session that found this typed.
   */
  it(
    '9. exact browser repro: a Date preceded by earlier Date tokens on the same line → Space → no popup',
    async () => {
      const view = mount();
      await type(view, '@2026-08-24');
      await type(view, ' ');
      await type(view, '@2026-08-21');
      await type(view, ' ');
      await type(view, '@2026-08-22');
      expect(view.state.doc.toString()).toBe('@2026-08-24 @2026-08-21 @2026-08-22');
      expect(labels(view)).toEqual(['2026-08-22']);

      await type(view, ' ');
      expect(view.state.doc.toString()).toBe('@2026-08-24 @2026-08-21 @2026-08-22 ');
      expect(completionStatus(view.state)).toBeNull();
      expect(currentCompletions(view.state)).toEqual([]);

      view.destroy();
    },
    10000
  );

  it('10. a Date preceded by just one earlier accepted Date on the same line still closes correctly after Space', async () => {
    const view = mount();
    await type(view, '@to');
    await settle();
    accept(view);
    await type(view, ' ');
    await type(view, '@2026-08-22');
    expect(labels(view)).toEqual(['2026-08-22']);

    await type(view, ' ');
    expect(completionStatus(view.state)).toBeNull();

    view.destroy();
  });
});
