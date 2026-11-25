// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { forceParsing } from '@codemirror/language';
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { imageUiStateField } from '../image/imageUiState';

import {
  embedObjectSelectionField,
  embedObjectSelectionKeymap,
  selectInsertedEmbeds,
  syncEmbedObjectSelection,
} from './embedObjectSelection';

function mount(doc: string, anchor = 0, readOnly = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdownLanguageExtension(),
      imageUiStateField,
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

function press(view: EditorView, key: string, shiftKey = false): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  );
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
    expect(view.dom.classList.contains('cm-embed-object-selection-active')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(doc.length + 1);
    expect(view.state.doc.toString()).toBe(`${doc}\n`);
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(false);
  });

  it('selects an embed in one ArrowRight press from the preceding line boundary', () => {
    const embed = '![[note]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above'.length + 1;
    const embedTo = embedFrom + embed.length;
    const view = mount(doc, 'above'.length);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: embedFrom, to: embedTo });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);

    press(view, 'ArrowRight');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(embedTo + 1);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('selects an embed in one ArrowLeft press from the following line boundary', () => {
    const embed = '![[note]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above'.length + 1;
    const embedTo = embedFrom + embed.length;
    const view = mount(doc, embedTo + 1);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowLeft');

    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: embedFrom, to: embedTo });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);

    press(view, 'ArrowLeft');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(embedFrom - 1);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('keeps the selected embed and moves the caret to a new line below on Enter', () => {
    const embed = '![[image.png]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above\n'.length;
    const view = mount(doc, embedFrom);
    addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');
    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + embed.length,
    });

    press(view, 'Enter');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(embedFrom + embed.length + 1);
    expect(view.state.doc.toString()).toBe(`above\n${embed}\n\nbelow`);
  });

  it('creates a new line below a selected embed at the end of the document', () => {
    const embed = '![[image.png]]';
    const view = mount(embed);
    addRenderedEmbedMarker(view, 0);
    press(view, 'ArrowRight');
    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe(`${embed}\n`);
    expect(view.state.selection.main.head).toBe(embed.length + 1);
    expect(view.state.field(embedObjectSelectionField)).toBeNull();
  });

  it('removes the selected embed source with Backspace', () => {
    const embed = '![[image.png]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above\n'.length;
    const view = mount(doc, embedFrom);
    addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');
    press(view, 'Backspace');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe('above\n\nbelow');
    expect(view.state.selection.main.head).toBe(embedFrom);
  });

  it('removes the selected embed source with Delete', () => {
    const embed = '![[image.png]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above\n'.length;
    const view = mount(doc, embedFrom);
    addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');
    press(view, 'Delete');

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe('above\n\nbelow');
    expect(view.state.selection.main.head).toBe(embedFrom);
  });

  it('does nothing on Shift+Enter while an embed is selected', () => {
    const embed = '![[image.png]]';
    const doc = `above\n${embed}\nbelow`;
    const embedFrom = 'above\n'.length;
    const view = mount(doc, embedFrom);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'ArrowRight');
    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + embed.length,
    });

    press(view, 'Enter', true);

    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + embed.length,
    });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
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

  it('moves through an intervening editable line from one embed to the next', () => {
    const first = '![[first]]';
    const middle = 'editable text';
    const second = '![[second]]';
    const secondFrom = first.length + 1 + middle.length + 1;
    const doc = first + '\n' + middle + '\n' + second;
    const view = mount(doc);
    const firstMarker = addRenderedEmbedMarker(view, 0);
    const secondMarker = addRenderedEmbedMarker(view, secondFrom);

    press(view, 'ArrowRight');
    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: 0, to: first.length });

    press(view, 'ArrowDown');
    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(first.length + 1);

    press(view, 'ArrowDown');
    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: secondFrom,
      to: secondFrom + second.length,
    });
    expect(firstMarker.classList.contains('cm-embed-object-selected')).toBe(false);
    expect(secondMarker.classList.contains('cm-embed-object-selected')).toBe(true);
  });

  it('clears the visual selection when the pointer moves outside this editor', () => {
    const view = mount('![[note]]');
    const marker = addRenderedEmbedMarker(view, 0);
    press(view, 'ArrowRight');
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(view.state.field(embedObjectSelectionField)).toBeNull();
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(false);
    expect(view.dom.classList.contains('cm-embed-object-selection-active')).toBe(false);
  });

  it('selects the embed instead of deleting its boundary newline with Backspace', () => {
    const embed = '![[note]]';
    const doc = `${embed}\nbelow`;
    const view = mount(doc, embed.length + 1);
    const marker = addRenderedEmbedMarker(view, 0);

    press(view, 'Backspace');

    expect(view.state.field(embedObjectSelectionField)).toEqual({ from: 0, to: embed.length });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('selects the embed instead of deleting its boundary newline with Delete', () => {
    const embed = '![[note]]';
    const doc = `above\n${embed}`;
    const embedFrom = 'above\n'.length;
    const view = mount(doc, 'above'.length);
    const marker = addRenderedEmbedMarker(view, embedFrom);

    press(view, 'Delete');

    expect(view.state.field(embedObjectSelectionField)).toEqual({
      from: embedFrom,
      to: embedFrom + embed.length,
    });
    expect(marker.classList.contains('cm-embed-object-selected')).toBe(true);
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

describe('batch object selection', () => {
  it('highlights both inserted objects and Enter creates a line below the last', () => {
    const first = '![[a.png]]';
    const second = '![[b.pdf]]';
    const doc = first + '\n' + second;
    const view = mount(doc, doc.length);
    const a = addRenderedEmbedMarker(view, 0);
    const b = addRenderedEmbedMarker(view, first.length + 1);
    view.dispatch({ effects: selectInsertedEmbeds([{ from: 0, to: first.length }, { from: first.length + 1, to: doc.length }]) });
    syncEmbedObjectSelection(view);
    expect(a.classList.contains('cm-embed-object-selected')).toBe(true);
    expect(b.classList.contains('cm-embed-object-selected')).toBe(true);
    press(view, 'Enter');
    expect(view.state.doc.toString()).toBe(doc + '\n');
    expect(view.state.field(embedObjectSelectionField)).toBeNull();
  });

  it('deletes only the selected embeds when other text is between them', () => {
    const first = '![[a.png]]';
    const gap = '\nkeep this\n';
    const second = '![[b.pdf]]';
    const doc = first + gap + second;
    const view = mount(doc);
    view.dispatch({ effects: selectInsertedEmbeds([{ from: 0, to: first.length }, { from: first.length + gap.length, to: doc.length }]) });
    press(view, 'Delete');
    expect(view.state.doc.toString()).toBe(gap);
  });
});
