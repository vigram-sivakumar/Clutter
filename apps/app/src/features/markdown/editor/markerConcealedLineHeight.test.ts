// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from './codemirror/markdownLanguage';
import { ConcealedMarkerWidget } from './codemirror/highlight/ConcealedMarkerWidget';
import { createInlineLivePreviewParticipants } from './codemirror/highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './codemirror/highlight/inlineLivePreviewRegion';

/**
 * Regression tripwire for `.cm-marker--concealed`'s current concealment
 * technique (docs/editor-architecture-decisions.md's
 * `Decoration.replace()`-with-widget entry, 2026-08-27): concealed markers
 * are `ConcealedMarkerWidget`s (`Decoration.replace({widget})`) — an empty,
 * independently-styled box, not the marker's own real (CSS-suppressed)
 * text run. This replaced two prior, rejected CSS-only techniques that both
 * lived on this same rule and both failed for the same underlying reason
 * (a *mark* decoration can only style the marker's real glyphs, and a real
 * text run's width and height are governed by the same font metrics, so
 * shrinking one dimension always broke the other):
 *   - shrinking `font-size` directly — left the marker's own rect at
 *     `height: 0`, which `drawSelection()` was shown to consume directly,
 *     zeroing out the selection-background rectangle for any line a
 *     selection boundary lands on inside a concealed marker;
 *   - `transform: scaleX()` on an `inline-block` at normal `font-size` —
 *     fixed the height, but a CSS `transform` never changes an element's
 *     *layout* box, only its painted one, so the marker still reserved its
 *     full original glyph width in the line's layout — causing
 *     progressively more horizontal indentation the more/longer markers a
 *     line has.
 *
 * jsdom cannot compute real layout or apply `getClientRects()`/
 * `drawSelection()` geometry — a mounted `EditorView` always measures `0`
 * there — so the actual selection-rectangle and horizontal-indentation
 * invariants this technique fixes are only ever provable in a real browser
 * (verified in this session's investigation; see the doc entry above for
 * exact before/after measurements). What source-level tests *can* still do
 * cheaply and reliably:
 *   - guard the CSS rule itself against silently reverting to either
 *     rejected predecessor;
 *   - prove the *structural* property the real-browser fix depends on —
 *     that a concealed marker's DOM representation is an empty widget,
 *     independent of the marker's own source length, so there is no
 *     glyph run for the browser's layout algorithm to reserve width for
 *     in the first place, regardless of how many `*` characters a line
 *     has concealed.
 */
describe('MarkdownEditor.css — .cm-marker--concealed', () => {
  it('is an empty inline-block box with zero width and a non-zero height, not a shrunk font-size or a scaleX transform', () => {
    const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-marker--concealed\s*\{([^}]*)\}/);

    expect(match, '.cm-marker--concealed rule not found').not.toBeNull();
    const body = match![1];

    // `height` only applies to an atomic (`inline-block`-or-higher) box —
    // a plain `inline` span's box height is derived from content/line-height,
    // not a settable property.
    expect(body).toMatch(/display\s*:\s*inline-block\s*;/);

    // Real, uncontested layout width — not a transform (which never
    // changes the layout box, only paint) and not a near-zero `font-size`
    // (which only a real text run needs, and this element has none).
    expect(body).toMatch(/width\s*:\s*0\s*;/);
    expect(body).not.toMatch(/font-size\s*:\s*0(\.\d+)?px/);
    expect(body).not.toMatch(/transform\s*:/);

    // Non-zero height: an empty `inline-block` left at `height: auto`
    // collapses to 0 (CSS2.1 §10.6.7 — no in-flow content), which would
    // silently reintroduce the exact `drawSelection()` zero-height bug
    // this technique exists to prevent.
    expect(body).toMatch(/height\s*:\s*(?!0(\D|$))\S/);
  });
});

const noResolvers = { resolveTag: () => undefined, resolveDate: () => undefined };

function mount(doc: string, pos: number): EditorView {
  const parent = document.createElement('div');
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion(createInlineLivePreviewParticipants(noResolvers))],
  });
  return new EditorView({ state, parent });
}

/**
 * The structural property the real-browser horizontal-indentation fix
 * depends on: a concealed marker's DOM footprint is always exactly one
 * empty widget element, regardless of the marker's own source length.
 * `**`/`***`/`****` all become one `ConcealedMarkerWidget` each (per open
 * marker, per close marker) with no text content — so there is never a
 * multi-character glyph run for the browser's inline layout algorithm to
 * reserve width for, which is what makes width independent of marker
 * length. This is exactly the property that failed under the
 * `transform: scaleX()` predecessor (real glyphs were still there,
 * reserving their full original width) and is provable in jsdom, unlike
 * the resulting on-screen geometry itself.
 */
describe('Concealed marker DOM footprint is independent of marker source length', () => {
  const cases = [
    // markerWidgets: one opening + one closing widget per *nesting level*
    // (never per character) — `***bold italic***` is Emphasis(StrongEmphasis)
    // nesting (2 levels -> 4 widgets), `****four-star****` is same-kind
    // StrongEmphasis(StrongEmphasis) nesting (2 levels -> 4 widgets), same
    // shape the engaged-state test above already establishes for these two
    // documents' marker *counts* — this test adds the DOM-footprint claim
    // (empty, textless) on top of that already-covered count.
    { name: '*italic*', doc: '*italic* x', markerWidgets: 2 },
    { name: '**bold**', doc: '**bold** x', markerWidgets: 2 },
    { name: '***bold italic***', doc: '***bold italic*** x', markerWidgets: 4 },
    { name: '****four-star****', doc: '****four-star**** x', markerWidgets: 4 },
  ];

  for (const { name, doc, markerWidgets } of cases) {
    it(`${name}: each concealed marker is exactly one empty widget element, however many characters it spans`, () => {
      const view = mount(doc, doc.length); // caret at trailing " x", outside every construct
      const concealed = Array.from(view.dom.querySelectorAll('.cm-marker--concealed'));
      // One widget per marker (open/close, per nesting level) — never one
      // per character, regardless of how many `*` characters that marker
      // is made of.
      expect(concealed.length).toBe(markerWidgets);
      for (const el of concealed) {
        expect(el.textContent).toBe('');
      }
      view.destroy();
    });
  }
});

describe('ConcealedMarkerWidget', () => {
  it('renders an empty element carrying the universal and construct-specific marker classes, regardless of markerClass', () => {
    const widget = new ConcealedMarkerWidget('cm-strong-marker');
    const dom = widget.toDOM();
    expect(dom.textContent).toBe('');
    expect(dom.classList.contains('cm-marker')).toBe(true);
    expect(dom.classList.contains('cm-strong-marker')).toBe(true);
    expect(dom.classList.contains('cm-marker--concealed')).toBe(true);
  });

  it('two widgets for the same markerClass are eq (no unnecessary redraw)', () => {
    const a = new ConcealedMarkerWidget('cm-emphasis-marker');
    const b = new ConcealedMarkerWidget('cm-emphasis-marker');
    expect(a.eq(b)).toBe(true);
  });

  it('widgets for different markerClasses are not eq', () => {
    const a = new ConcealedMarkerWidget('cm-emphasis-marker');
    const b = new ConcealedMarkerWidget('cm-strong-marker');
    expect(a.eq(b)).toBe(false);
  });

  it('does not ignore events — mousedown must reach CM6\'s own click-to-position handling so clicking a concealed marker places the caret and engages the construct', () => {
    const widget = new ConcealedMarkerWidget('cm-strong-marker');
    expect(widget.ignoreEvent()).toBe(false);
  });
});
