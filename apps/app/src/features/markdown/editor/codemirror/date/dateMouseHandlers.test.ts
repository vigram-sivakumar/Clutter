// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { getDateActivation } from './dateActivation';
import { findAtRestDateAt } from './dateEngagement';
import { handleDateClick } from './dateMouseHandlers';
import type { ResolveDate } from './dateResolution';

function mountView(doc: string, resolver?: ResolveDate): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({
          resolveWikiLink: () => undefined,
          resolveTag: () => undefined,
          resolveDate: () => resolver,
        })
      ),
    ],
  });
  return new EditorView({ state, parent });
}

/** No `dateDecorations` — isolates `getDateActivation` from the widget-rendering resolver call `dateDecorations` triggers on mount. */
function mountViewWithoutDecorations(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  return new EditorView({ state, parent });
}

describe('handleDateClick', () => {
  it('a plain click on an at-rest Date activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest Date activates it the same as a plain click — no special engage behavior', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleDateClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('a click that is not on any Date is not handled', () => {
    const resolver: ResolveDate = () => ({ activate: vi.fn() });
    const view = mountView('Text before @2026-08-20', resolver);

    const handled = handleDateClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged Date is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const view = mountView('Text before @2026-08-20', resolver);
    const nodeFrom = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeFrom + 3 } });
    const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to a no-op activate when no resolver is provided, does not throw', () => {
    const view = mountView('Text before @2026-08-20');
    const nodeFrom = 'Text before '.length;

    expect(() => handleDateClick(view, nodeFrom + 2, false, () => undefined)).not.toThrow();
  });

  describe('invalid (shape-valid, calendar-invalid) Date — non-interactive, not a clickable token', () => {
    it('a plain click is not handled and never activates — treated as no token at that position', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('Text before @2026-13-45', resolver);
      const nodeFrom = 'Text before '.length;

      const handled = handleDateClick(view, nodeFrom + 3, false, () => resolver);

      // `handled === false` is exactly the signal `tokenMouseHandlers.ts`'s
      // real `mousedown` DOM handler uses to decide whether to call
      // `event.preventDefault()` — false here means the click is left
      // alone for the browser's own default behavior (ordinary caret
      // placement), not swallowed for a no-op navigation.
      expect(handled).toBe(false);
      expect(activate).not.toHaveBeenCalled();
    });

    it('Alt-click is also not handled — no special engage-at-end behavior, but the position is still inside the node so native caret placement leaves it editable', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('Text before @2026-13-45', resolver);
      const nodeFrom = 'Text before '.length;

      const handled = handleDateClick(view, nodeFrom + 3, true, () => resolver);

      expect(handled).toBe(false);
      expect(activate).not.toHaveBeenCalled();
    });

    it('getDateActivation itself returns null and never invokes the resolver', () => {
      const resolverFactory = vi.fn(() => ({ activate: vi.fn() }));
      const view = mountViewWithoutDecorations('Text before @2026-13-45');
      const nodeFrom = 'Text before '.length;
      const node = findAtRestDateAt(view.state, nodeFrom + 3);
      expect(node).not.toBeNull();

      const activation = getDateActivation(view, node!, () => resolverFactory);

      expect(activation).toBeNull();
      expect(resolverFactory).not.toHaveBeenCalled();
    });

    it('a valid Date immediately after an invalid one is unaffected — still activates normally', () => {
      const activate = vi.fn();
      const resolver: ResolveDate = () => ({ activate });
      const view = mountView('@2026-13-45 @2026-08-20', resolver);
      const validNodeFrom = '@2026-13-45 '.length;

      const handled = handleDateClick(view, validNodeFrom + 3, false, () => resolver);

      expect(handled).toBe(true);
      expect(activate).toHaveBeenCalledTimes(1);
    });
  });
});

// CORRECTED 2026-09-26 (nested-inline-rendering generic fix — see
// docs/editor-architecture-decisions.md's correction of that name and
// tokenEngagement.ts's `widenThroughFlushAncestors`). Previously this block
// asserted a Date nested inside an enclosing delimited-mark construct must
// decline to activate whenever the cursor merely engaged that enclosing
// construct, anywhere — the click-side symptom of the same generic bug the
// decoration-side fix removes. A Date that is a genuine *sibling* of other
// content inside the enclosing construct (real text — "x " — sits between
// the `**` and the `@`, breaking the flush chain) now correctly activates
// regardless of where else the cursor sits in that construct.
describe('handleDateClick — cursor elsewhere in an enclosing formatting construct, outside the Date itself (a genuine sibling)', () => {
  // "x " keeps a valid date-preceding context (isValidDatePrecedingContext
  // mirrors the Tag rule) while also keeping "**" left-flanking, same
  // reasoning as tagMouseHandlers.test.ts's identical regression block.
  it('still activates a click on the Date even while the selection sits between the ** and the @ — the Date is a sibling, not flush, so it is unaffected by the enclosing construct\'s own engagement', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const doc = '**x @2026-08-20**';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 1 } }); // inside "**x ", outside the Date
    const clickPos = doc.indexOf('2026') + 2;
    const handled = handleDateClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('does not activate a click on a zero-gap sole-content Date (**@2026-08-20**) while the selection engages the enclosing StrongEmphasis — the pre-existing zero-gap invariant is unaffected', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const doc = '**@2026-08-20**';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 1 } }); // inside the outer "**", flush against the Date on both sides
    const clickPos = doc.indexOf('2026') + 2;
    const handled = handleDateClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('still activates when the selection is elsewhere entirely', () => {
    const activate = vi.fn();
    const resolver: ResolveDate = () => ({ activate });
    const doc = 'Before **x @2026-08-20** after';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 0 } });
    const clickPos = doc.indexOf('2026') + 2;
    const handled = handleDateClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });
});

describe('a timed Date (@YYYY-MM-DDTHH:mm)', () => {
  it('activates the daily note of its calendar date, ignoring the time', () => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: () => {} }));
    const view = mountViewWithoutDecorations('Meet @2026-10-23T07:00 ok');
    const node = { from: 5, to: 22 };

    getDateActivation(view, node, () => resolve)!();

    expect(resolve).toHaveBeenCalledWith('2026-10-23');
  });

  it('a date-only Date still resolves exactly as before', () => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: () => {} }));
    const view = mountViewWithoutDecorations('Meet @2026-10-23 ok');

    getDateActivation(view, { from: 5, to: 16 }, () => resolve)!();

    expect(resolve).toHaveBeenCalledWith('2026-10-23');
  });

  it('is not interactive when the time is not a real time, or the date is not a real date', () => {
    const resolve: ResolveDate = () => ({ activate: () => {} });
    expect(getDateActivation(mountViewWithoutDecorations('@2026-10-23T25:00'), { from: 0, to: 17 }, () => resolve)).toBeNull();
    expect(getDateActivation(mountViewWithoutDecorations('@2026-13-45T07:00'), { from: 0, to: 17 }, () => resolve)).toBeNull();
  });

  it('parses as one Date node in the editor, so the time is not left as stray text', () => {
    const view = mountView('Meet @2026-10-23T07:00 ok');
    expect(findAtRestDateAt(view.state, 8)).toEqual({ from: 5, to: 22 });
  });
});

describe('clicking a Date opens the daily note of its calendar date, whatever the time', () => {
  it.each([
    ['@2026-10-24', '2026-10-24'],
    ['@2026-10-24T12:00', '2026-10-24'],
    ['@2026-10-24T16:30', '2026-10-24'],
    ['@2026-10-24T00:00', '2026-10-24'],
  ])('a click on %s resolves %s', (reference, expected) => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: vi.fn() }));
    const view = mountView(`Text before ${reference}`, resolve);
    resolve.mockClear();

    const handled = handleDateClick(view, 'Text before '.length + 3, false, () => resolve);

    expect(handled).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(expected);
  });
});

describe('several Date references in one paragraph', () => {
  const doc = 'A @2026-10-23T07:00 B @2027-01-01 C @2026-10-22T03:00 D @2026-10-24T12:00 E @2026-10-22T11:00 end';

  it('each one activates its own calendar date, and only that one', () => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: vi.fn() }));
    const view = mountView(doc, resolve);
    resolve.mockClear();
    const expected = ['2026-10-23', '2027-01-01', '2026-10-22', '2026-10-24', '2026-10-22'];

    const starts = [...doc.matchAll(/@\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/g)].map((m) => m.index!);
    starts.forEach((start, i) => {
      resolve.mockClear();
      expect(handleDateClick(view, start + 4, false, () => resolve)).toBe(true);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(expected[i]);
    });
  });

  it('a click in the text between two references activates neither', () => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: vi.fn() }));
    const view = mountView(doc, resolve);
    resolve.mockClear();

    expect(handleDateClick(view, doc.indexOf(' C '), false, () => resolve)).toBe(true); // end of the date before it, a real boundary
    resolve.mockClear();
    expect(handleDateClick(view, doc.indexOf('C') , false, () => resolve)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('an invalid reference keeps its fallback: not handled, nothing activated', () => {
    const resolve = vi.fn<ResolveDate>(() => ({ activate: vi.fn() }));
    const view = mountView('x @2026-13-45T12:00 y', resolve);
    resolve.mockClear();

    expect(handleDateClick(view, 8, false, () => resolve)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
});
