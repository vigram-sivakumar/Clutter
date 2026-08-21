import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * Pure parser-level tests — no EditorView, no DOM. Mirrors
 * `markdownLanguage.regression.test.ts`'s style: tree shapes confirmed
 * empirically against the actual parse output, not assumed.
 */

function parse(text: string) {
  return markdownLanguageExtension().language.parser.parse(text);
}

function nodeNames(text: string): string[] {
  const names: string[] = [];
  parse(text).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

describe('emojiListSyntax', () => {
  it('parses a single emoji-marked line as ListItem > [EmojiListMark, Paragraph]', () => {
    const tree = parse('🍎 Apple');
    const emojiList = tree.topNode.getChild('EmojiList');
    const item = emojiList?.getChild('ListItem');
    expect(item?.firstChild?.name).toBe('EmojiListMark');
    expect(item?.getChild('Paragraph')).not.toBeNull();
  });

  it('nests a one-item EmojiList inside a bullet item, the same way "- - Apple" nests a BulletList', () => {
    const tree = parse('- 🍎 Apple');
    const bulletList = tree.topNode.getChild('BulletList');
    const item = bulletList?.getChild('ListItem');
    expect(item?.firstChild?.name).toBe('ListMark');
    const nestedEmojiList = item?.getChild('EmojiList');
    expect(nestedEmojiList?.getChildren('ListItem')).toHaveLength(1);
  });

  it('groups consecutive lines with different emoji into one EmojiList, not one list per emoji', () => {
    const tree = parse('🍎 Apple\n🍊 Orange\n🍌 Banana');
    const emojiLists = tree.topNode.getChildren('EmojiList');
    expect(emojiLists).toHaveLength(1);
    expect(emojiLists[0]?.getChildren('ListItem')).toHaveLength(3);
  });

  it('nests a plain bullet parent around an emoji-list child', () => {
    const tree = parse('- Fruits\n  🍎 Apple\n  🍊 Orange');
    const bulletList = tree.topNode.getChild('BulletList');
    const fruitsItem = bulletList?.getChild('ListItem');
    const nestedEmojiList = fruitsItem?.getChild('EmojiList');
    expect(nestedEmojiList?.getChildren('ListItem')).toHaveLength(2);
  });

  it('nests a plain bullet child inside an emoji-list parent', () => {
    // Three leading spaces, not two: @lezer/markdown counts indentation in
    // UTF-16 code units, and a simple emoji is a surrogate pair (2 units)
    // plus its required separator space (1 unit) = 3 — the same raw-text
    // width a user's editor actually inserts when indenting under it, even
    // though the glyph renders roughly double-width on screen.
    const tree = parse('🍎 Fruits\n   - Apple\n   - Orange');
    const emojiList = tree.topNode.getChild('EmojiList');
    const fruitsItem = emojiList?.getChild('ListItem');
    const nestedBulletList = fruitsItem?.getChild('BulletList');
    expect(nestedBulletList?.getChildren('ListItem')).toHaveLength(2);
  });

  it('treats a single emoji-led prose line as a one-item list, same as CommonMark does for "-"', () => {
    const tree = parse('🍎 I like apples.');
    const emojiList = tree.topNode.getChild('EmojiList');
    expect(emojiList?.getChildren('ListItem')).toHaveLength(1);
  });

  it('does not match an emoji with no following whitespace as a marker', () => {
    expect(nodeNames('🍎Apple')).not.toContain('EmojiListMark');
  });

  it('matches a bare emoji marker line with no trailing content', () => {
    const tree = parse('🍎');
    const emojiList = tree.topNode.getChild('EmojiList');
    expect(emojiList?.getChild('ListItem')?.firstChild?.name).toBe('EmojiListMark');
  });
});
