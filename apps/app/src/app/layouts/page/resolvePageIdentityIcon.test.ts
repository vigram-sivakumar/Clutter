import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';

import { resolvePageIdentityIcon } from './resolvePageIdentityIcon';

function page(type: Page['type'], icon: string | null = null): Page {
  return { id: 'p', type, name: 'Weekly Meeting', metadata: { icon } } as unknown as Page;
}

describe('resolvePageIdentityIcon', () => {
  it('a plain note gets the note icon', () => {
    expect(resolvePageIdentityIcon(page('note'), undefined)).toEqual({ icon: 'note', emoji: null });
  });

  it('a note in Templates gets the template icon when it has no emoji', () => {
    expect(resolvePageIdentityIcon(page('note'), undefined, true)).toEqual({
      icon: 'template',
      emoji: null,
    });
  });

  it("a template's own emoji is still returned, to override the default icon", () => {
    expect(resolvePageIdentityIcon(page('note', '🗓'), undefined, true)).toEqual({
      icon: 'template',
      emoji: '🗓',
    });
  });

  it('a daily note keeps its calendar icon regardless', () => {
    expect(resolvePageIdentityIcon(page('daily-note'), undefined, true).icon).toBe('calendarNote');
  });
});
