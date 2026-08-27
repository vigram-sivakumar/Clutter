// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownLanguageExtension } from '../markdownLanguage';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';
import { createInlineLivePreviewParticipants } from './inlineLivePreviewParticipants';

const noResolvers = { resolveTag: () => undefined, resolveDate: () => undefined };

/**
 * Diagnostic timing for the shared inline Live Preview decoration pass
 * (Pass 2's E5) on a large, densely-formatted document. Not a strict
 * regression gate — no established baseline exists yet to compare
 * against — this records a first measurement so a future change has
 * something to compare to. See docs/editor-architecture-decisions.md's
 * "ordinary-marker verification (2026-08-27)" entry for the recorded
 * numbers and interpretation.
 */
describe('inlineLivePreviewRegion — decoration build performance (diagnostic, not a gate)', () => {
  it('measures full-doc decoration build cost on a 5,000-line densely-formatted document', () => {
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) {
      lines.push(
        `Line ${i}: **bold${i}** and *italic${i}* with ~~strike${i}~~ plus ==highlight${i}== and \`code${i}\` end.`
      );
    }
    const doc = lines.join('\n');

    const parent = document.createElement('div');
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [
        markdownLanguageExtension(),
        inlineLivePreviewRegion(createInlineLivePreviewParticipants(noResolvers)),
      ],
    });

    const mountStart = performance.now();
    const view = new EditorView({ state, parent });
    const mountEnd = performance.now();

    const markerCountAtRest = view.dom.querySelectorAll('.cm-marker').length;

    // Simulate moving the caret through the document, forcing a full
    // recompute each time (selectionSet triggers buildDecorations again).
    const moveStart = performance.now();
    const sampleCount = 50;
    for (let i = 0; i < sampleCount; i++) {
      const pos = Math.floor((doc.length / sampleCount) * i);
      view.dispatch({ selection: EditorSelection.cursor(pos) });
    }
    const moveEnd = performance.now();

    const mountMs = mountEnd - mountStart;
    const avgMoveMs = (moveEnd - moveStart) / sampleCount;

    // eslint-disable-next-line no-console
    console.log(
      `[marker decoration perf] doc=${doc.length} chars, 5000 lines, 5 constructs/line -> ` +
        `initial mount: ${mountMs.toFixed(2)}ms, markers at rest (viewport-only): ${markerCountAtRest}, ` +
        `avg per-caret-move recompute (${sampleCount} samples): ${avgMoveMs.toFixed(3)}ms`
    );

    view.destroy();

    // Loose sanity bounds only — this is a diagnostic measurement, not a
    // tuned performance gate. A real regression would blow past these by
    // an order of magnitude, not marginally.
    expect(mountMs).toBeLessThan(2000);
    expect(avgMoveMs).toBeLessThan(200);
  });
});
