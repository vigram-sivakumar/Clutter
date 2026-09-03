// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { autocompletion, completionStatus, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { completionReactivation, type CompletionZone, type FindCompletionZone } from './completionLifecycle';

/**
 * Direct unit coverage for the shared reactivation factory in isolation —
 * a trivial fake `CompletionSource` and a trivial fake zone finder, no
 * real Markdown grammar or construct-specific logic involved. The
 * per-construct integration coverage (WikiLink/Embed/Date/Tag actually
 * reopening at the right moments, with real trigger/suggestion logic)
 * lives in each construct's own `*Autocomplete.test.ts`; this file only
 * proves the shared lifecycle itself behaves correctly against its stated
 * contract, so a bug here can't hide behind every construct's own tests
 * independently "happening" to exercise the same code path the same way.
 */

const ZONE_LABEL = 'zone-suggestion';

function fakeSource(): CompletionSource {
  return (context) => {
    // A trivial "always one completion, at the fixed FAKE_ZONE range" source.
    const result: CompletionResult = {
      from: FAKE_ZONE.from,
      options: [{ label: ZONE_LABEL }],
    };
    return context.pos >= FAKE_ZONE.from && context.pos <= FAKE_ZONE.to + 1 ? result : null;
  };
}

const FAKE_ZONE = { from: 2, to: 2 }; // mutated per-test via a fresh object below where needed

function mount(doc: string, findZoneAt: FindCompletionZone): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [autocompletion({ override: [fakeSource()] }), completionReactivation(findZoneAt)],
  });
  return new EditorView({ state, parent });
}

async function waitForQuery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('completionReactivation', () => {
  it('reopens on a pure cursor move into an EMPTY zone (from === to)', async () => {
    const findZoneAt: FindCompletionZone = (_state, pos) => (pos === 2 ? { from: 2, to: 2 } : null);
    const view = mount('x  y', findZoneAt);

    view.dispatch({ selection: { anchor: 2 } });
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });

  it('does NOT reopen on a pure cursor move into a NON-empty zone', async () => {
    const findZoneAt: FindCompletionZone = (_state, pos) => (pos === 2 ? { from: 1, to: 3 } : null);
    const view = mount('x  y', findZoneAt);

    view.dispatch({ selection: { anchor: 2 } });
    await waitForQuery();

    expect(completionStatus(view.state)).toBeNull();
  });

  it('does NOT reopen on a pure cursor move outside any zone', async () => {
    const findZoneAt: FindCompletionZone = () => null;
    const view = mount('x  y', findZoneAt);

    view.dispatch({ selection: { anchor: 2 } });
    await waitForQuery();

    expect(completionStatus(view.state)).toBeNull();
  });

  it('reopens after a deletion-classified transaction that leaves the cursor inside a zone (empty or not)', async () => {
    const zone: CompletionZone = { from: 1, to: 2 };
    const findZoneAt: FindCompletionZone = (_state, pos) => (pos >= zone.from && pos <= zone.to ? zone : null);
    const view = mount('xz y', findZoneAt);

    view.dispatch({
      changes: { from: 2, to: 3, insert: '' },
      selection: { anchor: 2 },
      userEvent: 'delete.backward',
    });
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });

  it('neither listener consults the zone finder for a plain insertion-classified transaction — that path is CM6\'s own activateOnTyping, not this module\'s job', () => {
    const findZoneAt = vi.fn<FindCompletionZone>(() => null);
    const view = mount('x y', findZoneAt);

    view.dispatch({
      changes: { from: 1, insert: 'z' },
      selection: { anchor: 2 },
      userEvent: 'input.type',
    });

    // The deletion listener bails on `!isUserEvent('delete')`; the
    // entering-listener bails on `update.docChanged` being true — neither
    // guard is meant to let an insertion reach `findZoneAt` at all.
    expect(findZoneAt).not.toHaveBeenCalled();
  });

  it('re-dispatching a selection-only transaction while already open re-settles back to active, not stuck or lost', async () => {
    // Any selection-only transaction is classified by CM6's own
    // `getUpdateType` as a Reset for the completion StateField, regardless
    // of prior status — an "already open" popup is never actually
    // exempt from this at the point either listener runs; every
    // subsequent in-zone selection change legitimately re-derives and
    // re-opens fresh from the current position, rather than being a no-op
    // this module needs to special-case. The property worth guarding is
    // simply that this settles back to 'active' cleanly, never getting
    // stuck mid-transition or silently dropped.
    const findZoneAt: FindCompletionZone = (_state, pos) => (pos === 2 ? { from: 2, to: 2 } : null);
    const view = mount('x  y', findZoneAt);

    view.dispatch({ selection: { anchor: 2 } });
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    view.dispatch({ selection: { anchor: 2 } });
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });
});
