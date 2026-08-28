// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { IndentTokenWidget } from './IndentTokenWidget';

describe('IndentTokenWidget', () => {
  it('renders an element sized to the given px width', () => {
    const widget = new IndentTokenWidget(10);
    const dom = widget.toDOM();
    expect(dom.style.width).toBe('10px');
  });

  it('a tab-sized widget (20px) is a different width than a space-sized widget (10px)', () => {
    const space = new IndentTokenWidget(10).toDOM();
    const tab = new IndentTokenWidget(20).toDOM();
    expect(space.style.width).toBe('10px');
    expect(tab.style.width).toBe('20px');
  });

  it('carries the cm-indent-token class', () => {
    const dom = new IndentTokenWidget(10).toDOM();
    expect(dom.className).toBe('cm-indent-token');
  });

  it('is not empty -- it needs real (invisible) content for its box to have non-zero height (see MarkdownEditor.css doc comment)', () => {
    const dom = new IndentTokenWidget(10).toDOM();
    expect(dom.textContent).not.toBe('');
    expect(dom.textContent?.length).toBeGreaterThan(0);
  });

  it('is hidden from the accessibility tree', () => {
    const dom = new IndentTokenWidget(10).toDOM();
    expect(dom.getAttribute('aria-hidden')).toBe('true');
  });

  it('eq() always returns false -- required so adjacent widgets never get incorrectly reused across a shrinking edit (see doc comment)', () => {
    const a = new IndentTokenWidget(10);
    expect(a.eq()).toBe(false);
  });

  it('ignoreEvent() returns false so mousedown reaches CM6\'s own click-to-position handling', () => {
    const widget = new IndentTokenWidget(10);
    expect(widget.ignoreEvent()).toBe(false);
  });
});
