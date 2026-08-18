import { highlightTree } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownHighlightStyle } from './markdownHighlightStyle';

/**
 * Regression tests for the emphasis slice of markdownHighlightStyle.ts —
 * mirrors the parser-level style of markdownLanguage.regression.test.ts,
 * but exercises `highlightTree` directly (no EditorView/DOM) to confirm
 * the actual class strings the HighlightStyle produces, including the
 * class-accumulation-on-nesting behavior `***bold italic***` depends on.
 */

function classesFor(text: string): Array<{ from: number; to: number; classes: string }> {
  const language = markdownLanguageExtension().language;
  const tree = language.parser.parse(text);
  const spans: Array<{ from: number; to: number; classes: string }> = [];
  highlightTree(tree, markdownHighlightStyle, (from, to, classes) => {
    spans.push({ from, to, classes });
  });
  return spans;
}

describe('markdownHighlightStyle — emphasis', () => {
  it('*italic* gets tok-emphasis on the text; markers additionally get tok-mark', () => {
    const spans = classesFor('*it*');
    expect(spans.find((s) => s.classes === 'tok-emphasis')).toBeTruthy();
    expect(spans.filter((s) => s.classes === 'tok-emphasis tok-mark')).toHaveLength(2);
  });

  it('_italic_ gets tok-emphasis on the text; markers additionally get tok-mark', () => {
    const spans = classesFor('_it_');
    expect(spans.find((s) => s.classes === 'tok-emphasis')).toBeTruthy();
    expect(spans.filter((s) => s.classes === 'tok-emphasis tok-mark')).toHaveLength(2);
  });

  it('**bold** gets tok-strong on the text; markers additionally get tok-mark', () => {
    const spans = classesFor('**b**');
    expect(spans.find((s) => s.classes === 'tok-strong')).toBeTruthy();
    expect(spans.filter((s) => s.classes === 'tok-strong tok-mark')).toHaveLength(2);
  });

  it('__bold__ gets tok-strong on the text; markers additionally get tok-mark', () => {
    const spans = classesFor('__b__');
    expect(spans.find((s) => s.classes === 'tok-strong')).toBeTruthy();
    expect(spans.filter((s) => s.classes === 'tok-strong tok-mark')).toHaveLength(2);
  });

  it('***bold italic*** composes both classes on the innermost text span', () => {
    const spans = classesFor('***bi***');
    const combined = spans.find(
      (s) => s.classes.includes('tok-emphasis') && s.classes.includes('tok-strong'),
    );
    expect(combined).toBeTruthy();
  });

  it('___bold italic___ composes both classes on the innermost text span', () => {
    const spans = classesFor('___bi___');
    const combined = spans.find(
      (s) => s.classes.includes('tok-emphasis') && s.classes.includes('tok-strong'),
    );
    expect(combined).toBeTruthy();
  });

  it('plain text has no emphasis/strong classes', () => {
    const spans = classesFor('plain text');
    expect(spans.find((s) => s.classes.includes('tok-emphasis'))).toBeFalsy();
    expect(spans.find((s) => s.classes.includes('tok-strong'))).toBeFalsy();
  });
});
