import { describe, expect, it } from 'vitest';

import type { Page } from '../../vault/models';
import { findRemoteImageDisplayName } from './remoteImageDisplayName';

const URL_ = 'https://example.com/a.jpg';
const page = (path: string, markdown: string): Page => ({ id: path, path, source: { markdown } }) as unknown as Page;
const find = (pages: Page[], archived: string[] = []) =>
  findRemoteImageDisplayName(URL_, pages, (p) => p.source.markdown, (p) => archived.includes(p.path));

describe('findRemoteImageDisplayName', () => {
  it('uses the display text typed for this exact URL', () => {
    expect(find([page('/v/A.md', `![Mountain at dawn](${URL_})`)])).toBe('Mountain at dawn');
  });

  it('ignores other images, links, code and generic or empty display text', () => {
    const markdown = [
      '![Other](https://example.com/b.jpg)',
      `[A link name](${URL_})`,
      '`![In code](' + URL_ + ')`',
      `![](${URL_})`,
      `![image](${URL_})`,
      `![Real name](${URL_})`,
    ].join('\n');

    expect(find([page('/v/A.md', markdown)])).toBe('Real name');
  });

  it('is undefined when no note gives a usable one (e.g. a cover-only image)', () => {
    expect(find([page('/v/A.md', `![](${URL_})`), page('/v/B.md', 'no images')])).toBeUndefined();
  });

  it('is deterministic: path order, and active notes before archived ones', () => {
    const pages = [
      page('/v/Z.md', `![From Z](${URL_})`),
      page('/v/Archive/A.md', `![From archived](${URL_})`),
      page('/v/B.md', `![From B](${URL_})`),
    ];

    expect(find(pages, ['/v/Archive/A.md'])).toBe('From B');
    expect(find([...pages].reverse(), ['/v/Archive/A.md'])).toBe('From B');
  });
});
