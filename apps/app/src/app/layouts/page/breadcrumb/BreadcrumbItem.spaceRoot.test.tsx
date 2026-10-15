// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BreadcrumbItem } from './BreadcrumbItem';
import { buildSystemLocationBreadcrumbs } from '@core/presentation/buildBreadcrumbs';
import { ActiveSpaceAvatarContext } from '@components/space-avatar/ActiveSpaceAvatarContext';
import type { SpaceAvatarProps } from '@components/space-avatar/SpaceAvatar';

afterEach(() => {
  cleanup();
});

function renderCrumb(space: SpaceAvatarProps | null, isSpaceRoot: boolean) {
  return render(
    <ActiveSpaceAvatarContext.Provider value={space}>
      <BreadcrumbItem title="Notes" icon="folder" isSpaceRoot={isSpaceRoot} isCurrentPage />
    </ActiveSpaceAvatarContext.Provider>
  );
}

describe('BreadcrumbItem: the Space root crumb', () => {
  it.each([
    ['initial', { type: 'initial' }, '.space__initial'],
    ['emoji', { type: 'emoji', emoji: '🚀' }, '.emoji-icon'],
    ['image', { type: 'image', src: 'https://example.com/a.png' }, 'img.space__avatar'],
  ] as const)('shows the Space %s avatar instead of the folder icon', (_name, avatar, selector) => {
    const { container } = renderCrumb({ avatar, folderName: 'Notes' }, true);
    expect(container.querySelector(selector)).not.toBeNull();
    expect(container.querySelector('.breadcrumb-item--title')).toHaveTextContent('Notes');
  });

  it('keeps the icon on an ordinary crumb', () => {
    const { container } = renderCrumb({ avatar: { type: 'initial' }, folderName: 'Notes' }, false);
    expect(container.querySelector('.space__initial')).toBeNull();
    expect(container.querySelector('.app-icon')).not.toBeNull();
  });

  it('falls back to the icon where no Space is provided', () => {
    const { container } = renderCrumb(null, true);
    expect(container.querySelector('.space__initial')).toBeNull();
    expect(container.querySelector('.app-icon')).not.toBeNull();
  });
});

describe('buildSystemLocationBreadcrumbs', () => {
  it('marks only the Workspace view as the Space root', () => {
    expect(buildSystemLocationBreadcrumbs('workspace', 'Notes')[0]).toMatchObject({
      title: 'Notes',
      isSpaceRoot: true,
    });
    for (const id of ['favorites', 'assets', 'tags'] as const) {
      expect(buildSystemLocationBreadcrumbs(id)[0]!.isSpaceRoot).toBeUndefined();
    }
  });
});
