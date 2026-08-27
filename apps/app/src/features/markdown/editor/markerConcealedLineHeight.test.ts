import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression tripwire for `.cm-marker--concealed`'s current concealment
 * technique (docs/editor-architecture-decisions.md's selection-geometry
 * entry, 2026-08-27): an atomic (`inline-block`) box laid out at the
 * run's normal `font-size`/`line-height`, scaled to near-zero width with
 * `transform` after layout. jsdom cannot compute real layout or apply
 * `getClientRects()`/`drawSelection()` geometry — a mounted `EditorView`
 * always measures `0` there — so this class of bug (line-box inflation,
 * zero-height selection rectangles) is only ever provable in a real
 * browser (verified in this session's investigation; see the doc above
 * for exact before/after measurements). What a source-level test *can*
 * still do cheaply and reliably is guard against silently reverting to
 * the technique's two known-bad predecessors:
 *   - shrinking `font-size` directly (the pre-2026-08-27 technique) —
 *     proven to leave the marker's own rect at `height: 0`, which
 *     `drawSelection()` was shown to consume directly, zeroing out the
 *     selection-background rectangle for any line a selection boundary
 *     lands on inside a concealed marker;
 *   - `width: 0` on the atomic box instead of a `transform` — proven to
 *     make the browser wrap the marker's text one glyph per line
 *     *inside* the box, doubling (measured: 48px vs the correct 24px)
 *     rather than suppressing its rendered width.
 */
describe('MarkdownEditor.css — .cm-marker--concealed', () => {
  it('uses an atomic box scaled to near-zero width, not a shrunk font-size or a zero width', () => {
    const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-marker--concealed\s*\{([^}]*)\}/);

    expect(match, '.cm-marker--concealed rule not found').not.toBeNull();
    const body = match![1];

    // Atomic box: `transform` only affects inline-block-or-higher boxes —
    // a plain `inline` span silently ignores it, which is exactly how the
    // predecessor technique's zero-height marker rect went unnoticed.
    expect(body).toMatch(/display\s*:\s*inline-block\s*;/);

    // font-size/line-height must stay at the run's normal size so the
    // marker's own content-box height matches the surrounding line
    // (whatever that line's context — body text, a heading, etc.) —
    // not a near-zero value, which is the exact regression that
    // reintroduces the `height: 0` selection-rectangle bug.
    expect(body).not.toMatch(/font-size\s*:\s*0(\.\d+)?px/);
    expect(body).toMatch(/font-size\s*:\s*inherit\s*;/);
    expect(body).toMatch(/line-height\s*:\s*inherit\s*;/);

    // Visual suppression must be a transform (post-layout), not a
    // constrained `width`, which forces internal text-wrapping and
    // inflates the box's own height instead of shrinking it.
    expect(body).toMatch(/transform\s*:\s*scaleX\(/);
    expect(body).not.toMatch(/width\s*:\s*0/);
  });
});
