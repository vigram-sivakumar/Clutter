// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { ListBulletWidget } from './ListBulletWidget';

describe('ListBulletWidget', () => {
  it('renders a <span> containing the bullet glyph, with both the shared and bullet-specific marker classes', () => {
    const widget = new ListBulletWidget();
    const dom = widget.toDOM();

    expect(dom.tagName).toBe('SPAN');
    expect(dom.classList.contains('cm-list-marker')).toBe(true);
    expect(dom.classList.contains('cm-bullet-list-marker')).toBe(true);
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
