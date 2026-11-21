// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { forceParsing } from '@codemirror/language';
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  embedObjectSelectionField,
  embedObjectSelectionKeymap,
} from './embedObjectSelection';

function mount(doc: string, anchor = 0, readOnly = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdownLanguageExtension(),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      embedObjectSelectionField,
      embedObjectSelectionKeymap(),
      keymap.of(defaultKeymap),
    ],
  });
  const view = new EditorView({ state, parent });
  forceParsing(view);
  return view;
}

function press(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function addRenderedEmbedMarker(view: EditorView, from: number): HTMLElement {
  const marker = document.createElement('div');
  marker.dataset.embedFrom = String(from);
  view.dom.append(marker);
  return marker;
}

describe('embedObjectSelectionKeymap', () => {
  it('selects the whole rendered embed on ArrowRight, then moves past it on the next ArrowRight', () => {
    const doc = '![[image.png]]';
    const view = mount(doc);
    const marker = addRenderedEmbedMarker(view, 0);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: 0, to: doc.length });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(doc.length);
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(false);
  });

  it('selects the whole rendered embed on ArrowLeft and Enter creates a line below it', () => {
    const doc = '![[image.png]]';
    const view = mount(doc, doc.length);
    addRenderedEmbedMarker(view, 0);

    press(view, 'ArrowLeft');
    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: 0, to: doc.length });

    press(view, 'Enter');
    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(doc.length + 1);
    expect(view.state.doc.toString()).toBe(`${doc}\n`);
  });

  it('selects an embed when ArrowDown moves vertically into its rendered block', () => {
    const doc = 'above\n![[image.png]]\nbelow';
    const embedFrom = 'above\n'.length;
    const view = mount(doc, 'above'.length);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowDown');

    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + '![[image.png]]'.length,
    });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('selects an embed when ArrowUp moves vertically into its rendered block', () => {
    const doc = 'above\n![[image.png]]\nbelow';
    const embedFrom = 'above\n'.length;
    const view = mount(doc, doc.length);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowUp');

    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + '![[image.png]]'.length,
    });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('moves directly from one selected embed to the next with ArrowDown', () => {
    const first = '![[first]]';
    const second = '![[second]]';
    const doc = `${first}\n${second}`;
    const secondFrom = first.length + 1;
    const view = mount(doc, 0);
    const firstMarker = addRenderedEmbedMarker(view, 0);
    const secondMarker = addRenderedEmbedMarker(view, secondFrom);

    press(view, 'ArrowRight');
    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: 0, to: first.length });

    press(view, 'ArrowDown');

    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: secondFrom,
      to: secondFrom + second.length,
    });
    expect(firstMarker.classList.contains('cm-embed-object-selected')).toBe(false);
    expect(secondMarker.classList.contains('cm-embed-object-selected')).toBe(true);
  });

  it('moves from a selected embed to the visible line above in one ArrowUp press', () => {
    const doc = 'above\n![[note]]\nbelow';
    const embedFrom = 'above\n'.length;
    const view = mount(doc, embedFrom);
    addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');
    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + '![[note]]'.length,
    });

    press(view, 'ArrowUp');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe('above'.length);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('moves from a selected embed to the visible line below in one ArrowDown press', () => {
    const doc = 'above\n![[note]]\nbelow';
    const embedFrom = 'above\n'.length;
    const embedTo = embedFrom + '![[note]]'.length;
    const view = mount(doc, embedTo);
    addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowLeft');
    expect(view.state.field(embedObjectSelectionField)).not.toBeNull();

    press(view, 'ArrowDown');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(embedTo + 1);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Escape clears object selection without editing the Markdown', () => {
    const doc = '![[image.png]]';
    const view = mount(doc);
    addRenderedEmbedMarker(view, 0);

    press(view, 'ArrowRight');
    press(view, 'Escape');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept ordinary text navigation or embeds without a rendered widget', () => {
    const view = mount('plain text');
    view.dispatch({ selection: { anchor: 0 } });
    press(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(1);

    const embedView = mount('![[image.png]]');
    press(embedView, 'ArrowRight');
    expect(embedView.state.field(embedObjectSelectionField)).toBeNull();
    expect(embedView.state.selection.main.head).toBe(1);
  });

  it('does not intercept navigation in read-only embedded editors', () => {
    const doc = '![[image.png]]';
    const view = mount(doc, 0, true);
    addRenderedEmbedMarker(view, 0);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(1);
  });
});
