// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * Active vs. finalized tag, through the real CM6 decoration path: a caret
 * still right after a trailing `-`/`_` is mid-tag, so the whole token stays
 * raw and editable (no widget, no leftover `-`). Normalization only applies
 * once the caret has left (Space, etc.). The grammar itself is unchanged.
 */
function mount(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({
          resolveWikiLink: () => undefined,
          resolveTag: () => undefined,
          resolveDate: () => undefined,
        })
      ),
    ],
  });
  return new EditorView({ state, parent });
}

const widgets = (v: EditorView) => v.dom.querySelectorAll('.tok-tag');

describe('active tag keeps trailing - and _ while typing', () => {
  it.each(['#Come-', '#Come-man-', '#Come_', '#Come_man_', '#Come-man_test'])(
    '%s with caret at end is one raw, un-widgeted token',
    (doc) => {
      const view = mount(doc, doc.length);
      expect(widgets(view).length).toBe(0);
      expect(view.dom.textContent).toBe(doc);
    }
  );

  it.each(['#Come-man- ', '#Come_man_ '])('%j after Space finalizes: widget for the normalized tag', (doc) => {
    const view = mount(doc, doc.length);
    const w = widgets(view);
    expect(w.length).toBe(1);
    // The widget shows separators as spaces; the trailing one is dropped (normalization).
    expect(w[0]!.textContent!.replace(/\s+/g, ' ').trim()).toBe('#Come man');
  });

  it('existing valid tag #Come-man renders as a widget at rest and raw when engaged', () => {
    expect(widgets(mount('#Come-man x', 11)).length).toBe(1);
    expect(widgets(mount('#Come-man x', 9)).length).toBe(0);
  });
});
