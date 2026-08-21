// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { ListBulletWidget } from './ListBulletWidget';

describe('ListBulletWidget', () => {
  it('renders a <span class="cm-list-marker"> containing the bullet glyph', () => {
    const widget = new ListBulletWidget();
    const dom = widget.toDOM();

    expect(dom.tagName).toBe('SPAN');
    expect(dom.className).toBe('cm-list-marker');
    expect(dom.textContent).toBe('•');
  });

  it('never carries the tok-mark class — deliberately separate from raw-marker styling', () => {
    const widget = new ListBulletWidget();
    const dom = widget.toDOM();

    expect(dom.classList.contains('tok-mark')).toBe(false);
  });

  it('eq() always reports equal — a stateless, always-identical glyph', () => {
    const a = new ListBulletWidget();
    const b = new ListBulletWidget();

    expect(a.eq(b)).toBe(true);
  });
});
