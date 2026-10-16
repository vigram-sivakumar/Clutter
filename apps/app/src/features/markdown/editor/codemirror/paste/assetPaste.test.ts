// @vitest-environment jsdom
import { history, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pasteAssets, type PasteAssets } from './assetPaste';

function file(name: string, type: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  const value = new File([bytes], name, { type });
  // jsdom's File predates Blob.arrayBuffer in some versions.
  Object.defineProperty(value, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return value;
}

function mount(doc: string, assets: PasteAssets | undefined, cursor = doc.length) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [pasteAssets(() => assets), history()],
    }),
    parent,
  });
}

/** What the platform hands the editor: `clipboardData.files` and the text flavors. */
function paste(view: EditorView, files: File[], text = ''): { defaultPrevented: boolean } {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeAssets(failFor: string[] = []) {
  const stored: string[] = [];
  const onFailed = vi.fn();
  const importFile = vi.fn(async (f: { name: string }, bytes: Uint8Array) => {
    if (failFor.includes(f.name)) {
      throw new Error('disk full');
    }
    stored.push(`${f.name}:${bytes.byteLength}`);
    return `Assets/${f.name}`;
  });
  return { assets: { importFile, onFailed } satisfies PasteAssets, stored, onFailed, importFile };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pasting files', () => {
  it('one image: stored, and an embed inserted at the caret', async () => {
    const { assets, stored } = fakeAssets();
    const view = mount('Hello  world', assets, 6);

    const event = paste(view, [file('shot.png', 'image/png', 'PNG')]);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(stored).toEqual(['shot.png:3']);
    expect(view.state.doc.toString()).toBe('Hello ![[Assets/shot.png]] world');
    expect(view.state.selection.main.head).toBe('Hello ![[Assets/shot.png]]'.length);
  });

  it('several images keep the clipboard order, one per line', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    paste(view, [file('a.png', 'image/png', 'A'), file('b.jpg', 'image/jpeg', 'B'), file('c.gif', 'image/gif', 'C')]);
    await settle();

    expect(view.state.doc.toString()).toBe('![[Assets/a.png]]\n![[Assets/b.jpg]]\n![[Assets/c.gif]]');
  });

  it('a PDF is embedded the same way', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    paste(view, [file('paper.pdf', 'application/pdf', '%PDF')]);
    await settle();

    expect(view.state.doc.toString()).toBe('![[Assets/paper.pdf]]');
  });

  it('text that came with the files is kept, before the embeds', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    paste(view, [file('a.png', 'image/png', 'A')], 'Look at this');
    await settle();

    expect(view.state.doc.toString()).toBe('Look at this\n![[Assets/a.png]]');
  });

  it('a copied file\'s own name is not inserted as text', async () => {
    const { assets } = fakeAssets();
    const view = mount('', assets);

    paste(view, [file('a.png', 'image/png', 'A')], 'a.png');
    await settle();

    expect(view.state.doc.toString()).toBe('![[Assets/a.png]]');
  });

  it('identical bytes in one paste are stored once and referenced twice', async () => {
    const { assets, importFile } = fakeAssets();
    const view = mount('', assets);

    paste(view, [file('one.png', 'image/png', 'SAME'), file('two.png', 'image/png', 'SAME')]);
    await settle();

    expect(importFile).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('![[Assets/one.png]]\n![[Assets/one.png]]');
  });

  it('a file that cannot be stored is reported and skipped; the others still go in', async () => {
    const { assets, onFailed } = fakeAssets(['bad.png']);
    const view = mount('', assets);

    paste(view, [file('a.png', 'image/png', 'A'), file('bad.png', 'image/png', 'B'), file('c.png', 'image/png', 'C')]);
    await settle();

    expect(view.state.doc.toString()).toBe('![[Assets/a.png]]\n![[Assets/c.png]]');
    expect(onFailed).toHaveBeenCalledWith(['bad.png']);
  });

  it('when nothing can be stored the text still goes in and nothing else changes', async () => {
    const { assets, onFailed } = fakeAssets(['bad.png']);
    const view = mount('x', assets);

    paste(view, [file('bad.png', 'image/png', 'B')], 'note');
    await settle();

    expect(view.state.doc.toString()).toBe('xnote');
    expect(onFailed).toHaveBeenCalledWith(['bad.png']);
  });

  it('one undo removes the whole paste, redo restores it', async () => {
    const { assets } = fakeAssets();
    const view = mount('Hi', assets);

    paste(view, [file('a.png', 'image/png', 'A'), file('b.png', 'image/png', 'B')]);
    await settle();
    undo(view);
    expect(view.state.doc.toString()).toBe('Hi');
    redo(view);
    expect(view.state.doc.toString()).toBe('Hi![[Assets/a.png]]\n![[Assets/b.png]]');
  });

  it('goes at the caret when the document changed while the files were being stored', async () => {
    const { assets } = fakeAssets();
    const view = mount('ab', assets, 1);

    paste(view, [file('a.png', 'image/png', 'A')]);
    view.dispatch({ changes: { from: 0, insert: 'XX' }, selection: { anchor: 3 } });
    await settle();

    expect(view.state.doc.toString()).toBe('XXa![[Assets/a.png]]b');
  });
});

describe('everything else is left to the default paste', () => {
  it.each([
    ['plain text', [] as File[]],
    ['an unsupported file', [file('doc.zip', 'application/zip', 'Z')]],
  ])('%s', async (_label, files) => {
    const { assets, importFile } = fakeAssets();
    const view = mount('', assets);

    paste(view, files, 'just text');
    await settle();

    expect(importFile).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).not.toContain('![[');
  });

  it('a read-only editor, or none configured, ignores files', async () => {
    const { assets, importFile } = fakeAssets();
    const parent = document.body.appendChild(document.createElement('div'));
    const readOnly = new EditorView({
      state: EditorState.create({ doc: '', extensions: [pasteAssets(() => assets), EditorState.readOnly.of(true)] }),
      parent,
    });

    paste(readOnly, [file('a.png', 'image/png', 'A')]);
    paste(mount('', undefined), [file('a.png', 'image/png', 'A')]);
    await settle();

    expect(importFile).not.toHaveBeenCalled();
    expect(readOnly.state.doc.toString()).toBe('');
  });
});

describe('leaving the note mid-import', () => {
  it('inserts nothing once the editor is gone, and says the files were kept but not added', async () => {
    const { assets } = fakeAssets();
    const onNotInserted = vi.fn();
    const view = mount('ab', { ...assets, onNotInserted }, 1);
    paste(view, [file('a.png', 'image/png', 'A'), file('b.png', 'image/png', 'B')]);
    view.destroy();
    await settle();
    expect(view.state.doc.toString()).toBe('ab');
    expect(onNotInserted).toHaveBeenCalledOnce();
    expect(onNotInserted).toHaveBeenCalledWith(2);
  });
});

describe('inside a table row', () => {
  it('keeps the row on one line when several files are pasted', async () => {
    const { assets } = fakeAssets();
    const doc = '| a | b |\n| - | - |\n| x | y |';
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length - 2 },
        extensions: [markdown({ extensions: GFM }), pasteAssets(() => assets)],
      }),
      parent,
    });

    paste(view, [file('a.png', 'image/png', 'A'), file('b.png', 'image/png', 'B')], 'cap\ntion');
    await settle();

    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('| x | ycap tion ![[Assets/a.png]] ![[Assets/b.png]] |');
  });
});
