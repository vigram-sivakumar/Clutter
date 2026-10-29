import { describe, expect, it, vi } from 'vitest';

import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import { changeInactiveSpaceAvatar, describeInactiveAvatarRefusal, type InactiveAvatarDeps } from './changeInactiveSpaceAvatar';
import { SpaceLifecycleGuard } from './spaceLifecycleGuard';

const ACTIVE = '/s/Alpha';
const OTHER = '/s/Beta';
const EMOJI = { type: 'emoji', emoji: '🍒' } as const;

function setup(overrides: { registered?: boolean; status?: SpaceFolderStatus; apply?: InactiveAvatarDeps['applyAvatar'] } = {}) {
  const guard = new SpaceLifecycleGuard();
  const heldDuring: (string | null)[] = [];
  const applyAvatar = vi.fn(
    overrides.apply ??
      (async () => {
        heldDuring.push(guard.active);
      })
  );
  const deps: InactiveAvatarDeps = {
    guard,
    activePath: () => ACTIVE,
    isRegistered: () => overrides.registered ?? true,
    probe: vi.fn(async () => overrides.status ?? 'available'),
    applyAvatar,
  };

  return { deps, guard, applyAvatar, heldDuring };
}

describe('changeInactiveSpaceAvatar', () => {
  it('writes the named Space’s profile under the guard, then releases it', async () => {
    const { deps, guard, applyAvatar, heldDuring } = setup();

    expect(await changeInactiveSpaceAvatar(deps, OTHER, EMOJI)).toEqual({ status: 'changed' });

    expect(applyAvatar).toHaveBeenCalledWith(OTHER, EMOJI);
    expect(heldDuring).toEqual(['editing-profile']);
    expect(guard.active).toBeNull();
  });

  it('normalizes the path it writes to', async () => {
    const { deps, applyAvatar } = setup();

    await changeInactiveSpaceAvatar(deps, `${OTHER}/`, null);

    expect(applyAvatar).toHaveBeenCalledWith(OTHER, null);
  });

  it('refuses while another Space operation holds the guard, writing nothing', async () => {
    const { deps, guard, applyAvatar } = setup();
    const release = guard.begin('renaming')!;

    expect(await changeInactiveSpaceAvatar(deps, OTHER, EMOJI)).toEqual({ status: 'refused', reason: 'busy' });
    expect(applyAvatar).not.toHaveBeenCalled();
    expect(guard.active).toBe('renaming');
    release();
  });

  it('two concurrent changes: one runs, the other is refused as busy', async () => {
    let finish!: () => void;
    const { deps, applyAvatar } = setup({ apply: () => new Promise<void>((resolve) => (finish = resolve)) });

    const first = changeInactiveSpaceAvatar(deps, OTHER, EMOJI);
    const second = await changeInactiveSpaceAvatar(deps, OTHER, EMOJI);
    finish();

    expect(second).toEqual({ status: 'refused', reason: 'busy' });
    expect(await first).toEqual({ status: 'changed' });
    expect(applyAvatar).toHaveBeenCalledTimes(1);
  });

  it('refuses a path that is not a registered Space (the scope check), writing nothing', async () => {
    const { deps, applyAvatar } = setup({ registered: false });

    expect(await changeInactiveSpaceAvatar(deps, '/etc', EMOJI)).toEqual({ status: 'refused', reason: 'no-space' });
    expect(applyAvatar).not.toHaveBeenCalled();
  });

  it('refuses the open Space: its avatar goes through its own Application', async () => {
    const { deps, applyAvatar } = setup();

    expect(await changeInactiveSpaceAvatar(deps, ACTIVE, EMOJI)).toEqual({ status: 'refused', reason: 'not-inactive' });
    expect(applyAvatar).not.toHaveBeenCalled();
  });

  it.each(['missing', 'unavailable'] as SpaceFolderStatus[])('refuses a folder that is %s, never writing into it', async (status) => {
    const { deps, applyAvatar } = setup({ status });

    expect(await changeInactiveSpaceAvatar(deps, OTHER, EMOJI)).toEqual({ status: 'refused', reason: 'unavailable' });
    expect(applyAvatar).not.toHaveBeenCalled();
  });

  it('a failed write reports a failure with safe wording and releases the guard — it is never reported as changed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps, guard } = setup({ apply: async () => Promise.reject(new Error('/secret/path: EACCES')) });

    const outcome = await changeInactiveSpaceAvatar(deps, OTHER, EMOJI);

    expect(outcome).toEqual({ status: 'failed', message: 'Couldn’t save the space settings' });
    expect(guard.active).toBeNull();
  });

  it('has a message for every refusal, in sentence case without an ending period', () => {
    for (const reason of ['busy', 'no-space', 'not-inactive', 'unavailable'] as const) {
      const text = describeInactiveAvatarRefusal(reason);
      expect(text).not.toMatch(/\.$/);
      expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
    }
  });
});
