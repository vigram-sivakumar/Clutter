import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * Pure parser-level tests — no EditorView, no DOM. Confirms `![[...]]`
 * produces a distinct `Embed` node (never a `WikiLink` node with a stray
 * literal `!` in front of it), that the `!` belongs to the `Embed` node's
 * own range, and that ordinary `[[...]]` WikiLinks are completely
 * unaffected by Embed's registration — the same "load-bearing safety net"
 * style markdownLanguage.regression.test.ts already established for
 * WikiLink's own coexistence with native CommonMark Link/Image.
 */

function nodeNames(text: string): string[] {
  const language = markdownLanguageExtension().language;
  const names: string[] = [];
  language.parser.parse(text).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

describe('Embed — ![[...]] produces a dedicated Embed node', () => {
  it('![[image.png]] produces an Embed node', () => {
    expect(nodeNames('![[image.png]]')).toContain('Embed');
  });

  it('![[image.png]] produces no WikiLink node — the bracketed portion is never independently claimed by the WikiLink rule', () => {
    expect(nodeNames('![[image.png]]')).not.toContain('WikiLink');
  });

  it('![[folder/image.png]] produces an Embed node', () => {
    const names = nodeNames('![[folder/image.png]]');
    expect(names).toContain('Embed');
    expect(names).not.toContain('WikiLink');
  });

  it('the Embed node\'s own range includes the leading ! — not left as a stray literal character before it', () => {
    const text = '![[image.png]]';
    const language = markdownLanguageExtension().language;
    let embedFrom: number | null = null;
    let embedTo: number | null = null;
    language.parser.parse(text).iterate({
      enter(node) {
        if (node.name === 'Embed') {
          embedFrom = node.from;
          embedTo = node.to;
        }
      },
    });
    expect(embedFrom).toBe(0);
    expect(embedTo).toBe(text.length);
    expect(text.slice(embedFrom!, embedTo!)).toBe('![[image.png]]');
  });
});

describe('WikiLink — [[...]] is unaffected by Embed\'s registration', () => {
  it('[[image.png]] still produces a WikiLink node, not an Embed node', () => {
    const names = nodeNames('[[image.png]]');
    expect(names).toContain('WikiLink');
    expect(names).not.toContain('Embed');
  });

  it('[[Projects/Project A]] still produces a WikiLink node (pre-existing coexistence case, unchanged)', () => {
    expect(nodeNames('[[Projects/Project A]]')).toContain('WikiLink');
  });
});

describe('Embed — incomplete/edge-case input produces no Embed node', () => {
  it('![[ (unterminated) produces no Embed node', () => {
    expect(nodeNames('![[ ')).not.toContain('Embed');
  });

  it('![[hero (unterminated, in-progress) produces no Embed node', () => {
    expect(nodeNames('![[hero')).not.toContain('Embed');
  });

  it('![ (single bracket) produces no Embed node', () => {
    expect(nodeNames('![')).not.toContain('Embed');
  });

  it('! (bare bang) produces no Embed node', () => {
    expect(nodeNames('!')).not.toContain('Embed');
  });

  it('![[image.png]] followed by more text still parses correctly and produces exactly one Embed node', () => {
    const names = nodeNames('some text ![[image.png]] more text');
    expect(names.filter((name) => name === 'Embed')).toHaveLength(1);
  });

  it('a real Image, ![Alt](url), is completely unaffected by Embed\'s registration', () => {
    const names = nodeNames('![Alt](url)');
    expect(names).toContain('Image');
    expect(names).not.toContain('Embed');
  });

  it('![[Alt]](url) — a genuine Image whose alt text happens to be a doubled bracket — is not stolen by Embed', () => {
    const names = nodeNames('![[Alt]](url)');
    expect(names).not.toContain('Embed');
    expect(names).toContain('Image');
  });
});
