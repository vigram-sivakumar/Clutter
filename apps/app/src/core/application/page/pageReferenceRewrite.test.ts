import { describe, expect, it } from 'vitest';
import {
  isRepresentableLinkTarget,
  pageLinkTarget,
  referencesTarget,
  rewriteReferenceTargets,
} from './pageReferenceRewrite';

describe('pageLinkTarget', () => {
  it('is the vault-relative path without the extension', () => {
    expect(pageLinkTarget('/vault/Projects/Roadmap.md', '/vault')).toBe('Projects/Roadmap');
    expect(pageLinkTarget('/vault/Meeting Notes.md', '/vault')).toBe('Meeting Notes');
  });
});

describe('isRepresentableLinkTarget', () => {
  it('accepts ordinary names and paths', () => {
    expect(isRepresentableLinkTarget('Team Meeting')).toBe(true);
    expect(isRepresentableLinkTarget('Projects/Q3 (draft) – v2')).toBe(true);
  });

  it.each(['A|B', 'A]B', 'A\\B', 'C# Notes', 'A\nB', '  '])('rejects %j', (target) => {
    expect(isRepresentableLinkTarget(target)).toBe(false);
  });
});

describe('rewriteReferenceTargets', () => {
  const rewrite = (md: string) => rewriteReferenceTargets(md, 'Meeting Notes', 'Team Meeting');

  it.each([
    ['[[Meeting Notes]]', '[[Team Meeting]]'],
    ['![[Meeting Notes]]', '![[Team Meeting]]'],
    ['[[Meeting Notes|Discussion]]', '[[Team Meeting|Discussion]]'],
    ['![[Meeting Notes#Decisions]]', '![[Team Meeting#Decisions]]'],
    ['[[Meeting Notes#Decisions|See this]]', '[[Team Meeting#Decisions|See this]]'],
    ['[[Meeting Notes#^abc123]]', '[[Team Meeting#^abc123]]'],
    ['[[ Meeting Notes ]]', '[[ Team Meeting ]]'],
  ])('%s -> %s', (before, after) => {
    expect(rewrite(before)).toBe(after);
  });

  it('rewrites every reference and keeps the surrounding text byte for byte', () => {
    const before = 'Intro **bold** [[Meeting Notes]] and\n- item ![[Meeting Notes#H|x]] end\n';
    expect(rewrite(before)).toBe('Intro **bold** [[Team Meeting]] and\n- item ![[Team Meeting#H|x]] end\n');
  });

  it('leaves prose, other targets, partial matches and a heading that merely repeats the name alone', () => {
    const before = [
      'Meeting Notes are prose.',
      '[[Meeting Notes 2]]',
      '[[Other/Meeting Notes]]',
      '[[Other#Meeting Notes]]',
      '[Meeting Notes](Meeting Notes.md)',
    ].join('\n');
    expect(rewrite(before)).toBe(before);
  });

  it('leaves references inside fenced, indented and inline code alone', () => {
    const before = ['```', '[[Meeting Notes]]', '```', '', '    ![[Meeting Notes]]', '', 'text `[[Meeting Notes]]` text'].join('\n');
    expect(rewrite(before)).toBe(before);
  });

  it('returns the same string when nothing matched', () => {
    const before = 'nothing to do';
    expect(rewrite(before)).toBe(before);
  });
});

describe('referencesTarget', () => {
  it('sees a link or an embed but not code', () => {
    expect(referencesTarget('x [[A]]', 'A')).toBe(true);
    expect(referencesTarget('x ![[A]]', 'A')).toBe(true);
    expect(referencesTarget('`[[A]]`', 'A')).toBe(false);
    expect(referencesTarget('[[B]]', 'A')).toBe(false);
  });
});
