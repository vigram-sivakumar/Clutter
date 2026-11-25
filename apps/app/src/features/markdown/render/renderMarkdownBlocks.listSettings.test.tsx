// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';

import { renderMarkdownBlocks } from './renderMarkdownBlocks';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderBlocks(markdown: string): HTMLElement {
  return render(<div>{renderMarkdownBlocks(markdown, {})}</div>).container.firstElementChild as HTMLElement;
}

describe('read-only rendering — Enable emoji lists', () => {
  const source = '🚀 Launch plan\n🎨 Design review\n🧪 Testing';

  it('on (default): emoji lines render as one emoji list, the emoji kept as content', () => {
    const root = renderBlocks(source);

    expect(root.querySelectorAll('ul.markdown-blocks__list--emoji')).toHaveLength(1);
    expect(root.querySelectorAll('.markdown-blocks__list-item')).toHaveLength(3);
    expect([...root.querySelectorAll('.markdown-blocks__emoji-marker')].map((el) => el.textContent)).toEqual(['🚀', '🎨', '🧪']);
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '🚀Launch plan',
      '🎨Design review',
      '🧪Testing',
    ]);
  });

  it('off: the same lines are an ordinary paragraph, with the emoji and text unchanged', () => {
    writeEnableEmojiLists(false);
    const root = renderBlocks(source);

    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('.markdown-blocks__emoji-marker')).toBeNull();
    expect(root.textContent).toContain('🚀 Launch plan');
    expect(root.textContent).toContain('🧪 Testing');
  });

  it('turning it off and on again restores the list for the same text', () => {
    writeEnableEmojiLists(false);
    expect(renderBlocks(source).querySelector('ul')).toBeNull();

    writeEnableEmojiLists(true);
    expect(renderBlocks(source).querySelectorAll('ul.markdown-blocks__list--emoji')).toHaveLength(1);
  });

  it('does not touch bullet, numbered or task lists', () => {
    writeEnableEmojiLists(false);
    const root = renderBlocks('- a\n\n1. b\n\n- [ ] c');

    expect(root.querySelectorAll('ul')).toHaveLength(2);
    expect(root.querySelectorAll('ol')).toHaveLength(1);
  });
});

describe('read-only rendering — Preserve bullet style', () => {
  it('records each unordered item\'s source marker, so CSS can show it (or a dot)', () => {
    const root = renderBlocks('- dash\n\n+ plus\n\n* star');

    expect([...root.querySelectorAll('li')].map((li) => li.getAttribute('data-bullet-marker'))).toEqual(['-', '+', '*']);
  });

  it('numbered, task and emoji items carry no bullet marker', () => {
    const root = renderBlocks('1. one\n\n- [ ] task\n\n🍒 cherry');

    expect(root.querySelector('ol li')?.hasAttribute('data-bullet-marker')).toBe(false);
    // A task item is a bullet item in the tree; NotePageCanvas.css excludes `--task` from the glyph rule.
    expect(root.querySelector('li.markdown-blocks__list-item--task')).not.toBeNull();
    expect(root.querySelector('ul.markdown-blocks__list--emoji li')?.hasAttribute('data-bullet-marker')).toBe(false);
  });

  it('never changes the text: the marker is an attribute, not content', () => {
    const root = renderBlocks('- dash');

    expect(root.querySelector('li')?.textContent).toBe('dash');
  });

  describe('CSS contract (NotePageCanvas.css)', () => {
    const css = readFileSync(
      resolve(__dirname, '../../collection/components/note/preview/NotePageCanvas.css'),
      'utf8'
    );

    it('shows the source marker only while the root is not in dot mode, for - and + only, never tasks or emoji lists', () => {
      expect(css).toContain(":root:not([data-markdown-bullet-style='dot'])");
      expect(css).toContain("[data-bullet-marker='-']::before");
      expect(css).toContain("[data-bullet-marker='+']::before");
      expect(css).not.toContain("[data-bullet-marker='*']");
      expect(css).toContain('content: attr(data-bullet-marker)');
      const block = css.slice(css.indexOf(":root:not([data-markdown-bullet-style='dot'])"));
      expect(block.slice(0, block.indexOf('}'))).toMatch(/:not\(\s*\.markdown-blocks__list-item--task\s*\)/);
      expect(block.slice(0, block.indexOf('}'))).toContain(':not(.markdown-blocks__list--emoji)');
    });
  });
});
