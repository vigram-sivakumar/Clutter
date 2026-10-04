// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { completionScrollFade } from './completionScrollFade';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = '';
});

/** An editor with a popup list already in its DOM, sized by hand (jsdom has no layout). */
function mount(size: { scrollTop: number; clientHeight: number; scrollHeight: number }): HTMLElement {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({ state: EditorState.create({ extensions: [completionScrollFade()] }), parent });

  const tooltip = document.createElement('div');
  tooltip.className = 'cm-tooltip-autocomplete';
  const list = document.createElement('ul');
  tooltip.appendChild(list);
  view.dom.appendChild(tooltip);
  for (const [key, value] of Object.entries(size)) {
    Object.defineProperty(list, key, { value, configurable: true, writable: true });
  }
  list.style.paddingBottom = '8px';
  return list;
}

async function settle(): Promise<void> {
  view!.dispatch({});
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('completionScrollFade', () => {
  it('flags a list with more rows below the visible ones', async () => {
    const list = mount({ scrollTop: 0, clientHeight: 260, scrollHeight: 600 });
    await settle();

    expect(list.hasAttribute('data-can-scroll-down')).toBe(true);
  });

  it('does not flag a list that fits', async () => {
    const list = mount({ scrollTop: 0, clientHeight: 260, scrollHeight: 260 });
    await settle();

    expect(list.hasAttribute('data-can-scroll-down')).toBe(false);
  });

  it('does not count the list\'s own bottom padding as more to scroll to — the last row is never dimmed', async () => {
    // Scrolled to the very end: only the 8px bottom padding is below the visible part.
    const list = mount({ scrollTop: 340, clientHeight: 260, scrollHeight: 608 });
    await settle();

    expect(list.hasAttribute('data-can-scroll-down')).toBe(false);
  });

  it('updates when the list is scrolled to the end and back', async () => {
    const list = mount({ scrollTop: 0, clientHeight: 260, scrollHeight: 600 });
    await settle();
    expect(list.hasAttribute('data-can-scroll-down')).toBe(true);

    Object.defineProperty(list, 'scrollTop', { value: 332, configurable: true, writable: true });
    list.dispatchEvent(new Event('scroll'));
    expect(list.hasAttribute('data-can-scroll-down')).toBe(false);

    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true, writable: true });
    list.dispatchEvent(new Event('scroll'));
    expect(list.hasAttribute('data-can-scroll-down')).toBe(true);
  });
});
