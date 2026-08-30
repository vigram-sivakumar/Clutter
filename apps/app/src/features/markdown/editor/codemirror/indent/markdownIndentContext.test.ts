// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

import { markdownLanguageExtension } from '../markdownLanguage';
import { computeIndentChange, resolveLineIndentContext } from './markdownIndentContext';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

function topLevelNodeNameAt(doc: string): string {
  const state = stateFor(doc);
  const first = syntaxTree(state).topNode.firstChild;
  if (!first) {
    throw new Error('expected a top-level node');
  }
  return first.name;
}

describe('IndentedCode removal — parser stays Paragraph/Heading/Blockquote/List at 4, 6, 8, 10 leading spaces', () => {
  it.each([4, 6, 8, 10])('paragraph stays Paragraph at %i spaces', (spaces) => {
    expect(topLevelNodeNameAt(`${' '.repeat(spaces)}paragraph text`)).toBe('Paragraph');
  });

  it.each([4, 6, 8, 10])('ATX heading stays ATXHeading1 at %i spaces', (spaces) => {
    expect(topLevelNodeNameAt(`${' '.repeat(spaces)}# Heading`)).toBe('ATXHeading1');
  });

  it.each([4, 6, 8, 10])('blockquote stays Blockquote at %i spaces', (spaces) => {
    expect(topLevelNodeNameAt(`${' '.repeat(spaces)}> quoted`)).toBe('Blockquote');
  });

  it.each([4, 6, 8, 10])('lone bullet list stays BulletList at %i spaces', (spaces) => {
    expect(topLevelNodeNameAt(`${' '.repeat(spaces)}- item`)).toBe('BulletList');
  });

  it('fenced code remains unaffected', () => {
    expect(topLevelNodeNameAt('```\ncode\n```')).toBe('FencedCode');
  });
});

describe('resolveLineIndentContext', () => {
  function contextAt(doc: string, pos: number) {
    const state = stateFor(doc);
    return resolveLineIndentContext(state, state.doc.lineAt(pos));
  }

  it('plain paragraph resolves to paragraph', () => {
    expect(contextAt('paragraph text', 0)).toEqual({ kind: 'paragraph' });
  });

  it('ATX heading resolves to heading', () => {
    expect(contextAt('# Heading', 0)).toEqual({ kind: 'heading' });
  });

  it('setext heading resolves to heading', () => {
    const doc = 'Heading\n===';
    expect(contextAt(doc, 0)).toEqual({ kind: 'heading' });
  });

  it('blockquote resolves to unhandled (deliberately not implemented this pass)', () => {
    expect(contextAt('> Quote', 0)).toEqual({ kind: 'unhandled' });
  });

  it.each([
    ['bullet -', '- item'],
    ['bullet *', '* item'],
    ['bullet +', '+ item'],
    ['ordered 1-digit', '1. item'],
    ['ordered 2-digit', '10. item'],
    ['ordered 3-digit', '100. item'],
    ['task', '- [ ] item'],
  ])('%s resolves to list with the correct markerFrom', (_label, doc) => {
    const ctx = contextAt(doc, 0);
    expect(ctx.kind).toBe('list');
    if (ctx.kind === 'list') {
      expect(ctx.markerFrom).toBe(0); // no leading whitespace in these fixtures
    }
  });

  it('a continuation line of a multi-line item (no marker of its own) does not resolve to list', () => {
    const doc = '- item with continuation\n  that continues here';
    const ctx = contextAt(doc, doc.indexOf('that'));
    expect(ctx.kind).not.toBe('list');
  });

  it('fenced code content resolves to code, even nested inside a list item', () => {
    const doc = '- item\n  ```\n  code\n  ```';
    const ctx = contextAt(doc, doc.indexOf('code'));
    expect(ctx.kind).toBe('code');
  });

  it('blank line resolves to unhandled', () => {
    expect(contextAt('paragraph\n\nmore', 10)).toEqual({ kind: 'unhandled' });
  });
});

describe('computeIndentChange', () => {
  it('Tab from 0 targets 4', () => {
    const state = stateFor('paragraph');
    const line = state.doc.lineAt(0);
    expect(computeIndentChange(line, { kind: 'paragraph' }, 1)).toEqual({
      from: 0,
      to: 0,
      insert: '    ',
    });
  });

  it('Tab has no ceiling: keeps growing by INDENT_STEP_SPACES past what used to be the limit', () => {
    const doc = `${' '.repeat(20)}paragraph`;
    const state = stateFor(doc);
    const line = state.doc.lineAt(0);
    expect(computeIndentChange(line, { kind: 'paragraph' }, 1)).toEqual({
      from: 0,
      to: 20,
      insert: ' '.repeat(24),
    });
  });

  it('Tab from far beyond the old ceiling (40) still grows by exactly 4, to 44', () => {
    const doc = `${' '.repeat(40)}paragraph`;
    const state = stateFor(doc);
    const line = state.doc.lineAt(0);
    expect(computeIndentChange(line, { kind: 'paragraph' }, 1)).toEqual({
      from: 0,
      to: 40,
      insert: ' '.repeat(44),
    });
  });

  it('Shift-Tab from far beyond the old ceiling (28) removes exactly 4, landing at 24', () => {
    const doc = `${' '.repeat(28)}paragraph`;
    const state = stateFor(doc);
    const line = state.doc.lineAt(0);
    expect(computeIndentChange(line, { kind: 'paragraph' }, -1)).toEqual({
      from: 0,
      to: 28,
      insert: ' '.repeat(24),
    });
  });

  it('Shift-Tab from 0 is a no-op', () => {
    const state = stateFor('paragraph');
    const line = state.doc.lineAt(0);
    expect(computeIndentChange(line, { kind: 'paragraph' }, -1)).toBeNull();
  });
});
