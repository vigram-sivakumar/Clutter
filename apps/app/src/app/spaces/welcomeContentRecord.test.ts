import { describe, expect, it, vi } from 'vitest';
import {
  WELCOME_CONTENT_STORAGE_KEY,
  decideWelcomeContent,
  readWelcomeContentRecord,
  writeWelcomeContentRecord,
} from './welcomeContentRecord';
import {
  WELCOME_GATE_ABANDONED_MESSAGE,
  WELCOME_GATE_RETRY_MESSAGE,
  WELCOME_GATE_UNVERIFIED_MESSAGE,
  prepareWelcomeSpace,
  resumeInterruptedWelcomeContent,
} from './runWelcomeContent';
import type { WelcomeVerification } from '../../core/application/welcome-content/WelcomeContentService';
import type { WelcomeInstallResult } from '../../core/application/welcome-content/WelcomeContentService';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function fakeApplication(
  result: WelcomeInstallResult = { status: 'installed' },
  resume: WelcomeInstallResult | null = null,
  verification: WelcomeVerification | null = null
) {
  const install = vi.fn().mockResolvedValue(result);
  const resumeIfNeeded = vi.fn().mockResolvedValue(resume);
  const verifyInstall = vi.fn().mockResolvedValue(verification);
  const markShown = vi.fn().mockResolvedValue(undefined);

  return { application: { welcomeContentService: { install, resumeIfNeeded, verifyInstall, markShown } } as never, install, resumeIfNeeded, verifyInstall, markShown };
}

const ok: WelcomeVerification = { ok: true, checked: 25 };

describe('welcome content first-run record (ADR-067)', () => {
  it('reads no record, a record, an unreadable record and unavailable storage', () => {
    expect(readWelcomeContentRecord(memoryStorage())).toBeNull();
    expect(readWelcomeContentRecord(memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"version":1,"state":"started"}' }))).toBe('started');
    expect(readWelcomeContentRecord(memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: 'garbage' }))).toBe('done');
    expect(readWelcomeContentRecord(memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"state":"nonsense"}' }))).toBe('done');
    expect(readWelcomeContentRecord(null)).toBe('unavailable');
  });

  it('reports whether a write was actually made', () => {
    const storage = memoryStorage();

    expect(writeWelcomeContentRecord(storage, 'started')).toBe(true);
    expect(readWelcomeContentRecord(storage)).toBe('started');
    expect(writeWelcomeContentRecord(null, 'started')).toBe(false);
    expect(
      writeWelcomeContentRecord({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'started')
    ).toBe(false);
  });

  describe('decideWelcomeContent', () => {
    it('installs only a Space Clutter created through Welcome, with no record', () => {
      expect(decideWelcomeContent({ record: null, fromWelcome: true, createdByWelcome: true })).toBe('install');
    });

    it('a retry of an unfinished first run for the folder Clutter created asks for the install again', () => {
      expect(decideWelcomeContent({ record: 'started', fromWelcome: true, createdByWelcome: true })).toBe('install');
      // A different folder, or outside Welcome, never does.
      expect(decideWelcomeContent({ record: 'started', fromWelcome: true, createdByWelcome: false })).toBe('decided');
      expect(decideWelcomeContent({ record: 'started', fromWelcome: false, createdByWelcome: true })).toBe('decided');
    });

    it('skips a folder the user chose in Welcome, permanently', () => {
      expect(decideWelcomeContent({ record: null, fromWelcome: true, createdByWelcome: false })).toBe('skip-existing-folder');
    });

    it('skips a Space opened any other way (startup restore, recovery, switching)', () => {
      expect(decideWelcomeContent({ record: null, fromWelcome: false, createdByWelcome: false })).toBe('skip-existing-user');
      // Even a created-flag left over from Welcome cannot install outside the Welcome flow.
      expect(decideWelcomeContent({ record: null, fromWelcome: false, createdByWelcome: true })).toBe('skip-existing-user');
    });

    it('never decides again once a finished record exists, or when storage is unavailable', () => {
      for (const record of ['done', 'skipped-existing-folder', 'skipped-existing-user', 'unavailable'] as const) {
        expect(decideWelcomeContent({ record, fromWelcome: true, createdByWelcome: true }), record).toBe('decided');
      }
    });
  });
});

describe('prepareWelcomeSpace: what must be true before a Welcome Space is shown', () => {
  it('Create writes `started` first, installs once, verifies, records `done`, marks the Space shown, then opens', async () => {
    const storage = memoryStorage();
    const { application, install, verifyInstall, markShown } = fakeApplication({ status: 'installed' }, null, ok);
    install.mockImplementation(async () => {
      expect(readWelcomeContentRecord(storage)).toBe('started');

      return { status: 'installed' };
    });

    const outcome = await prepareWelcomeSpace(application, { storage, createdByWelcome: true });

    expect(outcome).toEqual({ open: true });
    expect(install).toHaveBeenCalledTimes(1);
    expect(verifyInstall).toHaveBeenCalledTimes(1);
    expect(readWelcomeContentRef(storage)).toBe('done');
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('a failed install keeps the Space closed, keeps the record `started` (never `done`), and offers the retry', async () => {
    const storage = memoryStorage();
    const { application, markShown } = fakeApplication({ status: 'failed', retry: 'scheduled' });

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: true })).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
    expect(readWelcomeContentRef(storage)).toBe('started');
    expect(markShown).not.toHaveBeenCalled();
  });

  it('an install that records no retry closes the gate once, with its own message', async () => {
    const { application } = fakeApplication({ status: 'failed', retry: 'none' });

    expect(await prepareWelcomeSpace(application, { storage: memoryStorage(), createdByWelcome: true })).toEqual({
      open: false,
      message: WELCOME_GATE_ABANDONED_MESSAGE,
    });
  });

  it('an install that finished but is not all there as shipped keeps the Space closed', async () => {
    const storage = memoryStorage();
    const { application } = fakeApplication({ status: 'installed' }, null, { ok: false, checked: 25, missing: ['Templates/Idea.md'] });

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: true })).toEqual({ open: false, message: WELCOME_GATE_UNVERIFIED_MESSAGE });
    expect(readWelcomeContentRef(storage)).toBe('started');
  });

  it('the retry: a `started` record for the folder Clutter created installs again, then resumes what the ledger holds', async () => {
    const storage = memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"version":1,"state":"started"}' });
    const { application, install, resumeIfNeeded } = fakeApplication({ status: 'skipped', reason: 'not-empty' }, { status: 'installed' }, ok);

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: true })).toEqual({ open: true });
    expect(install).toHaveBeenCalledTimes(1);
    expect(resumeIfNeeded).toHaveBeenCalledTimes(1);
    expect(readWelcomeContentRef(storage)).toBe('done');
  });

  it('selecting an existing folder opens it with nothing installed, and records the skip for good', async () => {
    const storage = memoryStorage();
    const { application, install, markShown } = fakeApplication();

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: false })).toEqual({ open: true });
    expect(readWelcomeContentRef(storage)).toBe('skipped-existing-folder');
    expect(install).not.toHaveBeenCalled();
    expect(markShown).toHaveBeenCalledTimes(1);

    // A later Welcome Create (after removing every Space) still does not install.
    await prepareWelcomeSpace(application, { storage, createdByWelcome: true });
    expect(install).not.toHaveBeenCalled();
  });

  it('a Space with an interrupted install resumes it first, even when chosen as an existing folder', async () => {
    const storage = memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"version":1,"state":"started"}' });
    const { application, install, resumeIfNeeded } = fakeApplication({ status: 'installed' }, { status: 'installed' }, ok);

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: false })).toEqual({ open: true });
    expect(resumeIfNeeded).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
  });

  it('a failed resume keeps the Space closed', async () => {
    const storage = memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"version":1,"state":"started"}' });
    const { application } = fakeApplication({ status: 'installed' }, { status: 'failed', retry: 'unknown' });

    expect(await prepareWelcomeSpace(application, { storage, createdByWelcome: false })).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
  });

  it('with no usable storage, or a record that cannot be written, nothing installs and the Space stays closed', async () => {
    const none = fakeApplication();
    const refusing = fakeApplication();

    const first = await prepareWelcomeSpace(none.application, { storage: null, createdByWelcome: true });
    const second = await prepareWelcomeSpace(refusing.application, {
      storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
      createdByWelcome: true,
    });

    expect(none.install).not.toHaveBeenCalled();
    expect(refusing.install).not.toHaveBeenCalled();
    expect(second.open).toBe(false);
    // No storage at all means "decided" (never install), and an existing folder opens as it always did.
    expect(first).toEqual({ open: true });
  });

  it('never throws: a failure here closes the gate rather than showing a Space', async () => {
    const { application, install } = fakeApplication();
    install.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await prepareWelcomeSpace(application, { storage: memoryStorage(), createdByWelcome: true })).toEqual({ open: false, message: WELCOME_GATE_RETRY_MESSAGE });
  });
});

describe('resumeInterruptedWelcomeContent: a Space opened outside the Welcome dialog', () => {
  it('records an existing user once, never installs, and resumes only what the Space ledger holds', async () => {
    const storage = memoryStorage();
    const failed: WelcomeInstallResult = { status: 'failed', retry: 'scheduled' };
    const { application, install, resumeIfNeeded } = fakeApplication({ status: 'installed' }, failed);

    expect(await resumeInterruptedWelcomeContent(application, { storage })).toEqual(failed);
    expect(readWelcomeContentRef(storage)).toBe('skipped-existing-user');
    expect(install).not.toHaveBeenCalled();
    expect(resumeIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite an existing record and never throws', async () => {
    const storage = memoryStorage({ [WELCOME_CONTENT_STORAGE_KEY]: '{"version":1,"state":"done"}' });
    const { application, resumeIfNeeded } = fakeApplication();
    resumeIfNeeded.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await resumeInterruptedWelcomeContent(application, { storage })).toBeNull();
    expect(readWelcomeContentRef(storage)).toBe('done');
  });
});

const readWelcomeContentRef = readWelcomeContentRecord;
