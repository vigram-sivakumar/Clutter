// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { blockquoteMarkerDecoration } from '../highlight/blockquoteMarkerDecoration';
import { listMarkerDecoration } from '../highlight/listMarkerDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCheckboxDecorations } from '../task/taskCheckboxDecorations';
import { listIndentWhitespaceDecoration } from './listIndentWhitespaceDecoration';

function mountView(
  doc: string,
  initialAnchor: number | null = null,
  extraExtensions: Extension[] = []
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [
      markdownLanguageExtension(),
      blockquoteMarkerDecoration(),
      listIndentWhitespaceDecoration(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

/** Mounts with the real marker/checkbox decorations too, for scenarios that need an actual widget present to verify against. */
function mountFullView(doc: string, initialAnchor: number | null = null): EditorView {
  return mountView(doc, initialAnchor, [listMarkerDecoration(), taskCheckboxDecorations()]);
}

describe('listIndentWhitespaceDecoration', () => {
  describe('leading indentation before a nested marker (existing behavior, unchanged)', () => {
    it('at rest, collapses the raw leading whitespace before a nested bullet marker', () => {
      const text = '- parent\n  - nested\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).not.toContain('  -');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('at rest, collapses leading whitespace before a nested ordered marker', () => {
      const text = '1. Item\n   2. sdv\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).not.toContain('   2.');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('at rest, collapses leading whitespace before a nested emoji marker', () => {
      const text = '🔥 top\n   🔥 nested\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).not.toContain('   🔥 nested');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('reveals the raw leading whitespace once the physical line is engaged', () => {
      const text = '1. Item\n   2. sdv';
      const view = mountView(text);
      expect(view.dom.textContent).not.toContain('   2.');

      view.dispatch({ selection: { anchor: text.indexOf('sdv') } });

      expect(view.dom.textContent).toContain('   2. sdv');
    });

    it('does nothing for a top-level marker with no leading whitespace', () => {
      const text = '- top level item';
      const view = mountView(text, text.length);

      expect(view.dom.textContent).toBe(text);
    });

    it('does NOT collapse a blockquote-owned line\'s ">" into the leading-whitespace range', () => {
      const text = '> - quoted bullet';
      const view = mountView(text, 0);

      expect(view.dom.textContent).toBe(text);
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('separator space after a marker (new)', () => {
    it('collapses the separator after a bullet marker at rest', () => {
      const text = '- item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).toContain('-item');
      expect(view.dom.textContent).not.toContain('- item');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('collapses the separator after single- and double-digit ordered markers', () => {
      for (const text of ['1. item\n\nOther', '10. item\n\nOther']) {
        const view = mountView(text, text.indexOf('Other'));
        const marker = text.startsWith('10.') ? '10.' : '1.';

        expect(view.dom.textContent).toContain(`${marker}item`);
        expect(view.state.doc.toString()).toBe(text);
      }
    });

    it('collapses the separator after an emoji marker', () => {
      const text = '🔥 item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).toContain('🔥item');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('collapses the separator after a task checkbox (anchored to the TaskMarker, not the already-hidden ListMark)', () => {
      const text = '- [ ] item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      // The ListMark's own "- " already collapses unconditionally
      // (listMarkerDecoration.ts, unchanged); this module additionally
      // collapses the space between "]" and "item".
      expect(view.dom.textContent).toContain('[ ]item');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('collapses a multi-space separator down to nothing, not just one character', () => {
      const text = '-   item\n\nOther'; // 3 spaces after the dash
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.textContent).toContain('-item');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('still collapses the list marker\'s own separator when the marker sits on a blockquote-prefixed line', () => {
      const text = '> - item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      // Whatever blockquoteMarkerDecoration.ts does with ">" (its own,
      // unrelated, already-tested behavior) is irrelevant here — this
      // module's own separator collapse for the list marker's "-" must
      // still apply: no raw "- item" left in the rendered text.
      expect(view.dom.textContent).not.toContain('- item');
      expect(view.dom.textContent).toContain('item');
      expect(view.state.doc.toString()).toBe(text);
    });

    it('leaves the separator alone when there is nothing after the marker yet', () => {
      const text = '- \n\nOther'; // marker with no content typed after it
      const view = mountView(text, text.indexOf('Other'));

      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('task engagement — separator and leading whitespace track the checkbox\'s own rendering state, not generic physical-line engagement', () => {
    it('cursor inside the task text: checkbox stays rendered, leading indentation and separator stay collapsed', () => {
      const text = '1. item\n   - [ ] nested task text';
      const view = mountFullView(text, text.indexOf('nested task text') + 5); // inside "task text"

      const nestedLine = Array.from(view.dom.querySelectorAll('.cm-line')).find((l) =>
        l.textContent?.includes('task text')
      );
      expect(nestedLine).toBeDefined();
      expect(nestedLine!.querySelector('.cm-task-checkbox')).not.toBeNull();
      expect(nestedLine!.textContent).not.toContain('   -'); // leading indentation collapsed
      expect(nestedLine!.textContent).not.toContain('[ ] nested'); // separator collapsed
      expect(view.state.doc.toString()).toBe(text);
    });

    it('cursor on the marker itself: checkbox reverts to raw text, and leading indentation/separator reveal alongside it', () => {
      const text = '1. item\n   - [ ] nested task text';
      const view = mountFullView(text, text.indexOf('[ ]') + 1); // inside "[ ]"

      const nestedLine = Array.from(view.dom.querySelectorAll('.cm-line')).find((l) =>
        l.textContent?.includes('nested task text')
      );
      expect(nestedLine).toBeDefined();
      expect(nestedLine!.querySelector('.cm-task-checkbox')).toBeNull(); // raw, not a widget
      expect(nestedLine!.textContent).toBe('   - [ ] nested task text');
    });
  });

  describe('document preservation', () => {
    it('never modifies the document — only the rendered presentation', () => {
      const text = '1. Item\n   2. sdv\n      3. deeper';
      const view = mountView(text, text.length);

      expect(view.state.doc.toString()).toBe(text);
    });

    it('never modifies the document across a full engage/disengage cycle with a task item', () => {
      const text = '- [ ] task with some text';
      const view = mountFullView(text, text.length);

      view.dispatch({ selection: { anchor: 2 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: text.length } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });
  });
});
