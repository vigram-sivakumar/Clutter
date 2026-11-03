// @vitest-environment jsdom
import { insertNewlineAndIndent } from '@codemirror/commands';
import { ensureSyntaxTree, indentUnit } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { INDENT_UNIT_STRING } from '../indent/markdownIndentContext';
import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from './markdownEnterKeymap';

/**
 * Enter on a line indented further than its list item's marker width must
 * give the new line that line's own indentation (the four-space unit), not
 * CM6's marker-width guess (2 for `- `, 3 for `1. `, none under a task).
 * Runs the real chain — `markdownEnterCommand`, then the generic
 * `insertNewlineAndIndent` the default keymap supplies — and asserts on the
 * resulting document. `|` is the cursor (or `«`/`»` the selection), `_` a
 * trailing space.
 */
function press(source: string): string {
  const doc = source.replace(/_/g, ' ');
  const open = doc.indexOf('«');
  const close = doc.indexOf('»');
  let text: string;
  let selection: EditorSelection;
  if (open >= 0 && close > open) {
    text = doc.slice(0, open) + doc.slice(open + 1, close) + doc.slice(close + 1);
    selection = EditorSelection.create([EditorSelection.range(open, close - 1)]);
  } else {
    const pos = doc.indexOf('|');
    text = doc.slice(0, pos) + doc.slice(pos + 1);
    selection = EditorSelection.single(pos);
  }
  let state = EditorState.create({
    doc: text,
    selection,
    extensions: [markdownLanguageExtension(), indentUnit.of(INDENT_UNIT_STRING)],
  });
  ensureSyntaxTree(state, text.length, 5000);
  const target = {
    state,
    dispatch: (tr: Transaction) => {
      state = tr.state;
    },
  };
  if (!markdownEnterCommand(target)) {
    insertNewlineAndIndent(target);
  }
  const { from, to, empty } = state.selection.main;
  const out = state.doc.toString();
  const shown = empty ? out.slice(0, from) + '|' + out.slice(from) : out.slice(0, from) + '«' + out.slice(from, to) + '»' + out.slice(to);
  return shown.replace(/ (?=\n|$)/g, '_').replace(/^ +/gm, (run) => '_'.repeat(run.length));
}

describe('Enter keeps the current line\'s indentation', () => {
  it('plain paragraphs: four, eight and zero spaces', () => {
    expect(press('____This is indented|')).toBe('____This is indented\n____|');
    expect(press('________Eight|')).toBe('________Eight\n________|');
    expect(press('Plain|')).toBe('Plain\n|');
  });

  it('splits an indented paragraph in the middle, both halves indented', () => {
    expect(press('____abc|def')).toBe('____abc\n____|def');
  });

  it('keeps every line of a multiline paragraph at its indentation', () => {
    expect(press('____one\n____two|')).toBe('____one\n____two\n____|');
  });

  it('a four-space continuation paragraph under a bullet keeps all four spaces', () => {
    expect(press('- item\n\n____para|')).toBe('- item\n\n____para\n____|');
    expect(press('- item\n____para|')).toBe('- item\n____para\n____|');
    expect(press('- item\n________deep|')).toBe('- item\n________deep\n________|');
  });

  it('numbered and task items\' continuation paragraphs keep their indentation', () => {
    expect(press('1. item\n\n____para|')).toBe('1. item\n\n____para\n____|');
    expect(press('- [ ] task\n\n____para|')).toBe('- [ ] task\n\n____para\n____|');
  });

  it('a nested item\'s continuation paragraph keeps eight spaces', () => {
    expect(press('- a\n____- b\n\n________para|')).toBe('- a\n____- b\n\n________para\n________|');
  });

  it('splits a continuation paragraph in the middle without losing indentation', () => {
    expect(press('- item\n\n____pa|ra')).toBe('- item\n\n____pa\n____|ra');
  });

  it('keeps a blockquote prefix and the indentation after it', () => {
    expect(press('> - q\n>\n>    para|')).toBe('> - q\n>\n>    para\n>    |');
  });

  it('an indented paragraph under an emoji item keeps its indentation', () => {
    expect(press('🍒 item\n\n____para|')).toBe('🍒 item\n\n____para\n____|');
  });

  it('inside a code block the generic indent is untouched', () => {
    expect(press('```\n____code|\n```')).toBe('```\n____code\n____|\n```');
  });

  it('replaces a selection and puts the cursor on the indented new line', () => {
    expect(press('- item\n\n____pa«ra»')).toBe('- item\n\n____pa\n____|');
  });
});

describe('Enter leaves list behavior intact', () => {
  it('continues bullet, numbered and task items on the marker line', () => {
    expect(press('- item|')).toBe('- item\n- |');
    expect(press('1. item|')).toBe('1. item\n2. |');
    expect(press('- [ ] task|')).toBe('- [ ] task\n- [ ] |');
  });

  it('keeps nested marker lines at their own indentation', () => {
    expect(press('- a\n____- b|')).toBe('- a\n____- b\n____- |');
  });

  it('exits an empty item', () => {
    expect(press('- item\n- |')).toBe('- item\n|');
    expect(press('1. item\n2. |')).toBe('1. item\n|');
    expect(press('- [ ] task\n- [ ] |')).toBe('- [ ] task\n|');
  });

  it('an empty nested item still exits one level, not into extra indentation', () => {
    const out = press('- a\n____- |');
    expect(out.startsWith('- a\n')).toBe(true);
    expect(out).not.toMatch(/\n____\|/);
  });
});
