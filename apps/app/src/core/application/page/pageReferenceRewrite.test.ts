import { describe, expect, it } from 'vitest';
import {
  detectHeadingRename,
  isRepresentableHeadingFragment,
  isRepresentableLinkTarget,
  pageLinkTarget,
  referencesTarget,
  rewriteHeadingReferences,
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

describe('detectHeadingRename', () => {
  it('infers a rename when exactly one heading changes text', () => {
    expect(detectHeadingRename(['A', 'Decisions', 'C'], ['A', 'Key Decisions', 'C'])).toEqual({
      index: 1,
      from: 'Decisions',
      to: 'Key Decisions',
    });
  });

  it.each([
    ['nothing changed', ['A', 'B'], ['A', 'B']],
    ['an insertion', ['A', 'B'], ['A', 'X', 'B']],
    ['a deletion', ['A', 'B', 'C'], ['A', 'C']],
    ['a reorder', ['A', 'B', 'C'], ['C', 'B', 'A']],
    ['a swap of neighbours', ['A', 'B', 'C'], ['B', 'A', 'C']],
    ['several simultaneous changes', ['A', 'B', 'C'], ['X', 'B', 'Y']],
    ['a delete plus an insert that line up as a shift', ['A', 'B', 'C', 'D'], ['A', 'C', 'D', 'E']],
    ['a level-only change (the texts are identical)', ['A', 'B'], ['A', 'B']],
  ])('infers nothing from %s', (_name, before, after) => {
    expect(detectHeadingRename(before, after)).toBeNull();
  });

  it('renaming the FIRST of two duplicates is a rename (references resolve to the first)', () => {
    expect(detectHeadingRename(['A', 'A', 'B'], ['X', 'A', 'B'])).toEqual({ index: 0, from: 'A', to: 'X' });
  });

  it('renaming a LATER duplicate is not (no reference could have pointed at it)', () => {
    expect(detectHeadingRename(['A', 'A', 'B'], ['A', 'X', 'B'])).toBeNull();
  });

  it('is not a rename when the new text already belongs to an earlier heading (references would resolve there)', () => {
    expect(detectHeadingRename(['A', 'B'], ['A', 'A'])).toBeNull();
  });

  it('is a rename when the new text belongs to a LATER heading (this one becomes the first)', () => {
    expect(detectHeadingRename(['A', 'B'], ['B', 'B'])).toEqual({ index: 0, from: 'A', to: 'B' });
  });

  it('never treats a ^block-looking heading as a rename', () => {
    expect(detectHeadingRename(['^blk'], ['X'])).toBeNull();
  });
});

describe('isRepresentableHeadingFragment', () => {
  it('accepts ordinary heading text', () => {
    expect(isRepresentableHeadingFragment('Key Decisions (v2) – draft')).toBe(true);
  });

  it.each(['', '  ', '^block', 'C# Notes', 'A|B', 'A]B', 'A\\B'])('rejects %j', (heading) => {
    expect(isRepresentableHeadingFragment(heading)).toBe(false);
  });
});

describe('rewriteHeadingReferences', () => {
  const all = () => true;
  const rewrite = (md: string, targetsPage: (target: string) => boolean = all) =>
    rewriteHeadingReferences(md, 'Decisions', 'Key Decisions', targetsPage);

  it.each([
    ['[[Meeting Notes#Decisions]]', '[[Meeting Notes#Key Decisions]]'],
    ['![[Meeting Notes#Decisions]]', '![[Meeting Notes#Key Decisions]]'],
    ['[[Meeting Notes#Decisions|View decisions]]', '[[Meeting Notes#Key Decisions|View decisions]]'],
    ['![[Meeting Notes#Decisions|View decisions]]', '![[Meeting Notes#Key Decisions|View decisions]]'],
    ['[[Meeting Notes# Decisions ]]', '[[Meeting Notes# Key Decisions ]]'],
    ['[[Projects/Meeting Notes#Decisions]]', '[[Projects/Meeting Notes#Key Decisions]]'],
  ])('%s -> %s', (before, after) => {
    expect(rewrite(before)).toBe(after);
  });

  it('leaves block references, other headings, the note itself and look-alikes alone', () => {
    const before = [
      '[[Meeting Notes#^decision-1]]',
      '![[Meeting Notes#^decision-1]]',
      '[[Meeting Notes#Decisions of 2026]]',
      '[[Meeting Notes#Other]]',
      '[[Meeting Notes]]',
      '[[Meeting Notes|Decisions]]',
      '[[Meeting Notes|see #Decisions]]',
      'Decisions in prose, and #Decisions',
    ].join('\n');
    expect(rewrite(before)).toBe(before);
  });

  it('leaves code (fenced, indented, inline) alone', () => {
    const before = ['```', '[[A#Decisions]]', '```', '', '    ![[A#Decisions]]', '', 'x `[[A#Decisions]]` y'].join('\n');
    expect(rewrite(before)).toBe(before);
  });

  it('rewrites only references whose note part targetsPage accepts', () => {
    const before = '[[Mine#Decisions]] [[Other#Decisions]] ![[Mine#Decisions]]';
    expect(rewrite(before, (target) => target === 'Mine')).toBe(
      '[[Mine#Key Decisions]] [[Other#Decisions]] ![[Mine#Key Decisions]]'
    );
  });

  it('returns the same string when nothing matched', () => {
    expect(rewrite('no refs')).toBe('no refs');
  });
});
