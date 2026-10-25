import { describe, expect, it } from 'vitest';

import { InFlightPaths } from './InFlightPaths';

describe('InFlightPaths', () => {
  it('covers a registered path, what is under it, and nothing else — ignoring case', () => {
    const inFlight = new InFlightPaths();
    inFlight.begin(['/v/Notes/A.md', '/v/Folder']);

    expect(inFlight.covers('/v/Notes/A.md')).toBe(true);
    expect(inFlight.covers('/V/NOTES/a.md')).toBe(true);
    expect(inFlight.covers('/v/Folder/inside/B.md')).toBe(true);
    expect(inFlight.covers('/v/Folder2/B.md')).toBe(false);
    expect(inFlight.covers('/v/Notes/B.md')).toBe(false);
  });

  it('stops covering once released, and release is idempotent', () => {
    const inFlight = new InFlightPaths();
    const first = inFlight.begin(['/v/a.md']);
    const second = inFlight.begin(['/v/a.md']);

    first();
    first();
    expect(inFlight.covers('/v/a.md')).toBe(true);

    second();
    expect(inFlight.covers('/v/a.md')).toBe(false);
  });

  it('whenSettled resolves at once for an uncovered path and waits for a covered one', async () => {
    const inFlight = new InFlightPaths();
    await inFlight.whenSettled(['/v/free.md']);

    const release = inFlight.begin(['/v/busy.md']);
    let settled = false;
    const waiting = inFlight.whenSettled(['/v/other.md', '/v/busy.md']).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await waiting;
    expect(settled).toBe(true);
  });

  it('keeps waiting while another operation still covers the path', async () => {
    const inFlight = new InFlightPaths();
    const first = inFlight.begin(['/v/a.md']);
    const second = inFlight.begin(['/v/a.md']);
    let settled = false;
    const waiting = inFlight.whenSettled(['/v/a.md']).then(() => {
      settled = true;
    });

    first();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    second();
    await waiting;
    expect(settled).toBe(true);
  });
});
