import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyWithFeedback, type CopyNotifier } from './copyWithFeedback';

function notifier() {
  const shown: string[] = [];
  const failed: Array<{ text: string; error?: unknown }> = [];
  const value: CopyNotifier = {
    show: ({ text }) => void shown.push(text),
    fail: (text, error) => void failed.push({ text, error }),
  };
  return { value, shown, failed };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

describe('copyWithFeedback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('copies, then confirms', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    const { value, shown, failed } = notifier();

    await copyWithFeedback('[[Meeting notes]]', 'Link copied', value);

    expect(writeText).toHaveBeenCalledWith('[[Meeting notes]]');
    expect(shown).toEqual(['Link copied']);
    expect(failed).toHaveLength(0);
  });

  it('reports a refused write as an error and never confirms', async () => {
    const denied = new Error('denied');
    stubClipboard(async () => {
      throw denied;
    });
    const { value, shown, failed } = notifier();

    await copyWithFeedback('text', 'Path copied', value);

    expect(shown).toHaveLength(0);
    expect(failed).toEqual([{ text: 'Couldn’t copy to the clipboard', error: denied }]);
  });

  it('still logs a refused write when there is nobody to tell', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubClipboard(async () => {
      throw new Error('denied');
    });

    await expect(copyWithFeedback('text', 'Path copied')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
