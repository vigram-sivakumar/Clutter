// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emojiListMarkDecoration } from '../emoji-list/emojiListMarkDecoration';
import { listMarkerDecoration } from '../highlight/listMarkerDecoration';
import { taskCheckboxDecorations } from '../task/taskCheckboxDecorations';

/**
 * `cm-list-marker` is the one common CSS hook shared by every list-item
 * marker kind — bullet, ordered, task, emoji — regardless of the
 * type-specific class each also carries (`cm-bullet-list-marker`,
 * `cm-list-number`, `cm-task-checkbox`, `cm-emoji-list-marker`). This file
 * is the one place that mounts all four kinds together and asserts the
 * shared class is present on every one of them, and absent from anything
 * that isn't a marker at all.
 */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [
      markdownLanguageExtension(),
      listMarkerDecoration(),
      taskCheckboxDecorations(),
      emojiListMarkDecoration(),
    ],
  });
  return new EditorView({ state, parent });
}

function sharedMarkers(view: EditorView): Element[] {
  return Array.from(view.dom.querySelectorAll('.cm-list-marker'));
}

describe('shared cm-list-marker class', () => {
  it('a bullet marker carries cm-list-marker', () => {
    const text = '- item\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const markers = sharedMarkers(view);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.classList.contains('cm-bullet-list-marker')).toBe(true);
  });

  it('an ordered marker carries cm-list-marker', () => {
    const text = '1. item\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const markers = sharedMarkers(view);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.classList.contains('cm-list-number')).toBe(true);
  });

  it('a task checkbox carries cm-list-marker', () => {
    const text = '- [ ] item\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const markers = sharedMarkers(view);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.classList.contains('cm-task-checkbox')).toBe(true);
  });

  it('an emoji marker carries cm-list-marker', () => {
    const text = '🍒 item\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const markers = sharedMarkers(view);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.classList.contains('cm-emoji-list-marker')).toBe(true);
  });

  it('a document mixing all four kinds gets exactly one shared-class element per marker, each with its own type-specific class', () => {
    const text = '- bullet\n1. ordered\n- [ ] task\n🍒 emoji\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const markers = sharedMarkers(view);
    expect(markers).toHaveLength(4);

    const typeSpecificClasses = markers.map((m) =>
      ['cm-bullet-list-marker', 'cm-list-number', 'cm-task-checkbox', 'cm-emoji-list-marker'].find(
        (cls) => m.classList.contains(cls)
      )
    );
    expect(typeSpecificClasses).toEqual([
      'cm-bullet-list-marker',
      'cm-list-number',
      'cm-task-checkbox',
      'cm-emoji-list-marker',
    ]);
  });

  it('plain, non-list text has no cm-list-marker anywhere', () => {
    const view = mountView('Just a plain paragraph, no lists at all.');

    expect(sharedMarkers(view)).toHaveLength(0);
  });
});
