// @vitest-environment jsdom
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCheckboxDecoration } from './taskCheckboxDecoration';
import { taskCompletionMetadataDecoration } from './taskCompletionMetadataDecoration';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), taskCheckboxDecoration(), taskCompletionMetadataDecoration()],
  });
  return new EditorView({ state, parent });
}

function visibleText(view: EditorView): string {
  return view.dom.textContent ?? '';
}

function findNode(state: EditorState, name: string): SyntaxNode | null {
  ensureSyntaxTree(state, state.doc.length, 5000);
  let found: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name && !found) {
        found = node.node;
      }
    },
  });
  return found;
}

describe('taskCompletionMetadataDecoration: parser structure', () => {
  it('"@completed:2026-08-31" parses as a real TaskCompletionMetadata node', () => {
    const state = EditorState.create({
      doc: '- [x] Completed task @completed:2026-08-31',
      extensions: [markdownLanguageExtension()],
    });
    const node = findNode(state, 'TaskCompletionMetadata');
    expect(node).not.toBeNull();
    expect(state.sliceDoc(node!.from, node!.to)).toBe('@completed:2026-08-31');
  });

  it('a different valid completion date parses identically, never hard-coded to one date', () => {
    for (const date of ['2026-01-01', '2099-12-31', '2000-02-29']) {
      const state = EditorState.create({
        doc: `- [x] Task @completed:${date}`,
        extensions: [markdownLanguageExtension()],
      });
      const node = findNode(state, 'TaskCompletionMetadata');
      expect(node).not.toBeNull();
      expect(state.sliceDoc(node!.from, node!.to)).toBe(`@completed:${date}`);
    }
  });

  it('the TaskMarker node is unaffected by the metadata construct existing on the same line', () => {
    const state = EditorState.create({
      doc: '- [x] Completed task @completed:2026-08-31',
      extensions: [markdownLanguageExtension()],
    });
    const taskMarker = findNode(state, 'TaskMarker');
    expect(taskMarker).not.toBeNull();
    expect(state.sliceDoc(taskMarker!.from, taskMarker!.to)).toBe('[x]');
  });
});

describe('taskCompletionMetadataDecoration: rendering', () => {
  it('checked task with metadata: source stays intact, visual hides the metadata', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    expect(view.state.doc.toString()).toBe('- [x] Completed task @completed:2026-08-31');
    expect(visibleText(view)).toBe('☑ Completed task ');
    expect(visibleText(view)).not.toContain('@completed');
    expect(visibleText(view)).not.toContain('2026-08-31');
  });

  it('unchecked task with metadata (parser permits it — grammar is context-free): also hidden visually, source unchanged', () => {
    const view = mountView('- [ ] Task @completed:2026-08-31');
    expect(view.state.doc.toString()).toBe('- [ ] Task @completed:2026-08-31');
    expect(visibleText(view)).toBe('☐ Task ');
    expect(visibleText(view)).not.toContain('@completed');
  });

  it('metadata does not become ordinary visible task content — no residual "@completed:" text fragment anywhere in the DOM', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    expect(view.dom.innerHTML).not.toContain('completed:');
    expect(view.dom.innerHTML).not.toContain('2026-08-31');
  });

  it('a task with no metadata is completely unaffected', () => {
    const view = mountView('- [x] Plain task');
    expect(visibleText(view)).toBe('☑ Plain task');
  });

  it('metadata is hidden regardless of a different valid date value (not hard-coded to one specific date)', () => {
    const view = mountView('- [x] Task @completed:2099-12-31');
    expect(visibleText(view)).toBe('☑ Task ');
    expect(view.state.doc.toString()).toContain('2099-12-31');
  });
});

describe('taskCompletionMetadataDecoration: caret behavior around hidden metadata', () => {
  it('placing the caret adjacent to the hidden metadata does not reveal it', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    const metadataNode = findNode(view.state, 'TaskCompletionMetadata')!;
    for (const pos of [metadataNode.from, metadataNode.from + 1, metadataNode.to]) {
      view.dispatch({ selection: EditorSelection.cursor(pos) });
      expect(visibleText(view)).not.toContain('@completed');
    }
  });

  it('selecting a range spanning the metadata does not reveal it', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    expect(visibleText(view)).not.toContain('@completed');
  });

  it('decorations do not rebuild on selection changes alone (no reveal state for this construct)', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    const before = visibleText(view);
    const metadataNode = findNode(view.state, 'TaskCompletionMetadata')!;
    view.dispatch({ selection: EditorSelection.cursor(metadataNode.from + 5) });
    expect(visibleText(view)).toBe(before);
  });

  it('the metadata range is NOT registered in EditorView.atomicRanges (matches wikiLinkLivePreview.ts\'s own precedent for a permanently-hidden run — plain-text-editable, one keystroke per hidden character)', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    const metadataNode = findNode(view.state, 'TaskCompletionMetadata')!;
    const providers = view.state.facet(EditorView.atomicRanges);
    const isAtomic = providers.some((provider) => {
      let found = false;
      provider(view).between(metadataNode.from, metadataNode.to, () => {
        found = true;
      });
      return found;
    });
    expect(isAtomic).toBe(false);
  });
});

describe('taskCompletionMetadataDecoration: editing safety around metadata', () => {
  it('editing task text before the metadata does not corrupt or remove it', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    const insertAt = view.state.doc.toString().indexOf('task');
    view.dispatch({ changes: { from: insertAt, to: insertAt, insert: 'longer ' } });
    expect(view.state.doc.toString()).toBe('- [x] Completed longer task @completed:2026-08-31');
  });

  it('toggling the checkbox does not touch the metadata text', () => {
    const view = mountView('- [x] Completed task @completed:2026-08-31');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    view.dispatch({ changes: { from: taskMarker.from + 1, to: taskMarker.from + 2, insert: ' ' } });
    expect(view.state.doc.toString()).toBe('- [ ] Completed task @completed:2026-08-31');
  });
});
