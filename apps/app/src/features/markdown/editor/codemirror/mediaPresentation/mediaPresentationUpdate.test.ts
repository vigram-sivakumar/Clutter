// @vitest-environment jsdom
import { syntaxTree } from '@codemirror/language';
import { redo, undo, history } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  computeImagePresentationUpdate,
  computePdfPresentationUpdate,
  getImagePresentation,
  getPdfPresentation,
  resolveEmbedAliasFields,
} from './mediaPresentationUpdate';
import { DEFAULT_IMAGE_PRESENTATION, DEFAULT_PDF_PRESENTATION } from './mediaPresentationModel';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [history(), markdownLanguageExtension()] });
}

/** Finds the `to` of the first node with the given name — every fixture here has exactly one Image/Embed. */
function nodeTo(state: EditorState, name: string): number {
  let to: number | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === name && to === null) {
        to = node.to;
      }
    },
  });
  if (to === null) {
    throw new Error(`no ${name} node found`);
  }
  return to;
}

describe('resolveEmbedAliasFields — WikiLink pipe disambiguation', () => {
  it('a real display alias (contains a space) is never treated as metadata', () => {
    expect(resolveEmbedAliasFields('My Document')).toEqual({ displayAlias: 'My Document', tokens: [] });
  });

  it('a metadata-shaped alias (pure alnum + commas) is treated as metadata, not a display alias', () => {
    expect(resolveEmbedAliasFields('6,center,fit')).toEqual({ displayAlias: null, tokens: ['6', 'center', 'fit'] });
    expect(resolveEmbedAliasFields('290')).toEqual({ displayAlias: null, tokens: ['290'] });
  });

  it('no alias at all', () => {
    expect(resolveEmbedAliasFields(null)).toEqual({ displayAlias: null, tokens: [] });
  });

  it('a single-word alias with no comma is still metadata-shaped if purely alphanumeric (e.g. a bare width)', () => {
    expect(resolveEmbedAliasFields('center')).toEqual({ displayAlias: null, tokens: ['center'] });
  });

  it('an alias containing punctuation other than commas is a real alias', () => {
    expect(resolveEmbedAliasFields('Q3 Report (final)')).toEqual({ displayAlias: 'Q3 Report (final)', tokens: [] });
  });
});

describe('getImagePresentation / getPdfPresentation — native Image', () => {
  it('resolves defaults for an image with no pipe segment', () => {
    const state = stateFor('![Photo](photo.jpg)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual(DEFAULT_IMAGE_PRESENTATION);
  });

  it('resolves a fully-specified pipe segment', () => {
    const state = stateFor('![Photo|620,center,fit](photo.jpg)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual({ width: 620, alignment: 'center', mode: 'fit' });
  });

  it('arbitrary token order resolves identically', () => {
    const a = stateFor('![Photo|6,center,fit](photo.jpg)');
    const b = stateFor('![Photo|fit,center,6](photo.jpg)');
    expect(getImagePresentation(a, nodeTo(a, 'Image'))).toEqual(getImagePresentation(b, nodeTo(b, 'Image')));
  });

  it('unknown tokens are ignored', () => {
    const state = stateFor('![Photo|620,center,banana,fit](photo.jpg)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual({ width: 620, alignment: 'center', mode: 'fit' });
  });

  it('duplicate recognized values: last one wins', () => {
    const state = stateFor('![Photo|620,400,center,right,fit,fill](photo.jpg)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual({ width: 400, alignment: 'right', mode: 'fill' });
  });

  it('an unrecognized "large" token is ignored — Large was removed as a mode', () => {
    const state = stateFor('![Photo|6,large](photo.jpg)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual({ width: 6, alignment: 'left', mode: 'fill' });
  });
});

describe('getPdfPresentation — PDF Embed', () => {
  it('resolves defaults for a PDF embed with no pipe segment', () => {
    const state = stateFor('![[document.pdf]]');
    expect(getPdfPresentation(state, nodeTo(state, 'Embed'))).toEqual(DEFAULT_PDF_PRESENTATION);
  });

  it('resolves a PDF embed pipe segment, ignoring an (invalid, for PDF) mode token', () => {
    const state = stateFor('![[document.pdf|620,center,fit]]');
    expect(getPdfPresentation(state, nodeTo(state, 'Embed'))).toEqual({ width: 620, alignment: 'center' });
  });

  it('a real (non-metadata-shaped) alias resolves to default presentation — it is never mistaken for metadata', () => {
    const state = stateFor('![[document.pdf|My Document]]');
    expect(getPdfPresentation(state, nodeTo(state, 'Embed'))).toEqual(DEFAULT_PDF_PRESENTATION);
  });
});

describe('computeImagePresentationUpdate — preserves alt/url/title/surrounding content', () => {
  it('inserts a pipe segment, preserving alt text and URL', () => {
    const state = stateFor('![Photo](photo.jpg)');
    const to = nodeTo(state, 'Image');
    const change = computeImagePresentationUpdate(state, to, { width: 6, alignment: 'left', mode: 'fill' });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![Photo|6](photo.jpg)');
  });

  it('updates width alone, preserving alignment/mode already present', () => {
    const state = stateFor('![Photo|6,center,fit](photo.jpg)');
    const to = nodeTo(state, 'Image');
    const current = getImagePresentation(state, to);
    const change = computeImagePresentationUpdate(state, to, { ...current, width: 3 });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![Photo|3,center,fit](photo.jpg)');
  });

  it('removes the pipe segment entirely once every field returns to default', () => {
    const state = stateFor('![Photo|6,center,fit](photo.jpg)');
    const to = nodeTo(state, 'Image');
    const change = computeImagePresentationUpdate(state, to, DEFAULT_IMAGE_PRESENTATION);
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![Photo](photo.jpg)');
  });

  it('preserves a Markdown image title', () => {
    const state = stateFor('![Photo](photo.jpg "A title")');
    const to = nodeTo(state, 'Image');
    const change = computeImagePresentationUpdate(state, to, { width: 9, alignment: 'left', mode: 'fill' });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![Photo|9](photo.jpg "A title")');
  });

  it('preserves surrounding document content before and after the image', () => {
    const state = stateFor('Before text.\n\n![Photo](photo.jpg)\n\nAfter text.');
    const to = nodeTo(state, 'Image');
    const change = computeImagePresentationUpdate(state, to, { width: 6, alignment: 'center', mode: 'fill' });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('Before text.\n\n![Photo|6,center](photo.jpg)\n\nAfter text.');
  });
});

describe('computePdfPresentationUpdate — preserves the WikiLink path', () => {
  it('inserts a pipe segment, preserving the path', () => {
    const state = stateFor('![[document.pdf]]');
    const to = nodeTo(state, 'Embed');
    const change = computePdfPresentationUpdate(state, to, { width: 6, alignment: 'center' });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![[document.pdf|6,center]]');
  });

  it('overwrites an existing real alias with metadata (documented tradeoff — one pipe slot)', () => {
    const state = stateFor('![[document.pdf|My Document]]');
    const to = nodeTo(state, 'Embed');
    const change = computePdfPresentationUpdate(state, to, { width: 6, alignment: 'left' });
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![[document.pdf|6]]');
  });

  it('once overwritten, resetting to defaults removes the pipe segment entirely — the original alias is genuinely gone, not just hidden (a direct consequence of the single-pipe-slot tradeoff: the overwritten alias text is itself metadata-shaped, so there is nothing left to restore)', () => {
    const state = stateFor('![[document.pdf|My Document]]');
    const to = nodeTo(state, 'Embed');
    const nonDefault = state.update({ changes: computePdfPresentationUpdate(state, to, { width: 6, alignment: 'left' }) }).state;
    expect(nonDefault.doc.toString()).toBe('![[document.pdf|6]]');
    const nonDefaultTo = nodeTo(nonDefault, 'Embed');
    const restored = nonDefault.update({
      changes: computePdfPresentationUpdate(nonDefault, nonDefaultTo, DEFAULT_PDF_PRESENTATION),
    }).state;
    expect(restored.doc.toString()).toBe('![[document.pdf]]');
  });

  it('removes the pipe segment entirely once every field returns to default and there was no real alias', () => {
    const state = stateFor('![[document.pdf|6,center]]');
    const to = nodeTo(state, 'Embed');
    const change = computePdfPresentationUpdate(state, to, DEFAULT_PDF_PRESENTATION);
    const next = state.update({ changes: change }).state;
    expect(next.doc.toString()).toBe('![[document.pdf]]');
  });
});

describe('regression — WikiLink and native-image/embed behavior unaffected when no metadata is present', () => {
  it('a plain WikiLink alias round-trips exactly as before', () => {
    const state = stateFor('[[Project A|Alias Text]]');
    expect(state.doc.toString()).toBe('[[Project A|Alias Text]]');
    let sawWikiLink = false;
    syntaxTree(state).iterate({
      enter(node) {
        if (node.name === 'WikiLink') sawWikiLink = true;
      },
    });
    expect(sawWikiLink).toBe(true);
  });

  it('a native Markdown image with no pipe resolves to exactly the default presentation', () => {
    const state = stateFor('![Alt](https://example.com/a.png)');
    expect(getImagePresentation(state, nodeTo(state, 'Image'))).toEqual(DEFAULT_IMAGE_PRESENTATION);
  });

  it('a local PDF embed with no pipe resolves to exactly the default presentation', () => {
    const state = stateFor('![[document.pdf]]');
    expect(getPdfPresentation(state, nodeTo(state, 'Embed'))).toEqual(DEFAULT_PDF_PRESENTATION);
  });
});

describe('undo/redo of a presentation-metadata transaction', () => {
  it('undo restores the prior pipe segment, redo reapplies the change — one CM6 transaction, integrating with native history', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = '![Photo|6,center](photo.jpg)';
    const view = new EditorView({ state: stateFor(doc), parent });

    const to = nodeTo(view.state, 'Image');
    const change = computeImagePresentationUpdate(view.state, to, { width: 620, alignment: 'right', mode: 'fit' });
    view.dispatch({ changes: change });
    expect(view.state.doc.toString()).toBe('![Photo|620,right,fit](photo.jpg)');

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);

    redo(view);
    expect(view.state.doc.toString()).toBe('![Photo|620,right,fit](photo.jpg)');
  });
});
