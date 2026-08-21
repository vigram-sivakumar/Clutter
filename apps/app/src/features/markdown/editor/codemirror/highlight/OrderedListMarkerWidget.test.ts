// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { OrderedListMarkerWidget } from './OrderedListMarkerWidget';

describe('OrderedListMarkerWidget', () => {
  it('renders a <span> containing the actual parsed marker text, with both the shared and ordered-specific marker classes', () => {
    const widget = new OrderedListMarkerWidget('1.');
    const dom = widget.toDOM();

    expect(dom.tagName).toBe('SPAN');
    expect(dom.classList.contains('cm-list-marker')).toBe(true);
    expect(dom.classList.contains('cm-list-number')).toBe(true);
    expect(dom.textContent).toBe('1.');
  });

  it('renders whatever marker it was constructed with, not a hardcoded "1."', () => {
    const widget = new OrderedListMarkerWidget('27.');
    const dom = widget.toDOM();

    expect(dom.textContent).toBe('27.');
  });

  it('never carries the tok-mark or cm-bullet-list-marker class — deliberately separate styling', () => {
    const widget = new OrderedListMarkerWidget('1.');
    const dom = widget.toDOM();

    expect(dom.classList.contains('tok-mark')).toBe(false);
    expect(dom.classList.contains('cm-bullet-list-marker')).toBe(false);
  });

  it('eq() reports equal only when the raw marker text matches', () => {
    const a = new OrderedListMarkerWidget('1.');
    const b = new OrderedListMarkerWidget('1.');
    const c = new OrderedListMarkerWidget('2.');

    expect(a.eq(b)).toBe(true);
    expect(a.eq(c)).toBe(false);
  });
});
