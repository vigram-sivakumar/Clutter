// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PickerList } from './PickerList';
import { ROOT_DESTINATION_ID, type PickerListItem } from './PickerList.types';
import { ActiveSpaceAvatarContext } from '@components/space-avatar/ActiveSpaceAvatarContext';
import type { SpaceAvatarProps } from '@components/space-avatar/SpaceAvatar';

afterEach(() => {
  cleanup();
});

const items: PickerListItem[] = [
  {
    id: ROOT_DESTINATION_ID,
    title: 'Notes',
    secondaryLabel: 'Home',
    isRoot: true,
    level: 0,
    parentId: null,
  },
  { id: 'templates', title: 'Templates', isRoot: true, icon: 'template', level: 0, parentId: null },
  { id: 'folder-a', title: 'Alpha', level: 0, parentId: null },
];

function renderPicker(space: SpaceAvatarProps | null) {
  return render(
    <ActiveSpaceAvatarContext.Provider value={space}>
      <PickerList items={items} leadingIcon="folder" onSelect={vi.fn()} />
    </ActiveSpaceAvatarContext.Provider>
  );
}

function rowOf(container: HTMLElement, title: string): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (el) => el.textContent?.includes(title)
  );
  if (!row) throw new Error(`no row for ${title}`);
  return row;
}

describe('PickerList: the Space root row', () => {
  it('shows the Space initial from the folder name, with its label and Home kept', () => {
    const { container } = renderPicker({ avatar: { type: 'initial' }, folderName: 'Notes' });
    const root = rowOf(container, 'Notes');

    expect(root.querySelector('.space__initial')).toHaveTextContent('N');
    expect(root.querySelector('.picker-list__icon')).toBeNull();
    expect(root).toHaveTextContent('Home');
  });

  it('shows the Space image, resolved for loading', () => {
    const { container } = renderPicker({
      avatar: { type: 'image', src: 'Assets/Avatar.jpg' },
      folderName: 'Notes',
      resolveImageUrl: (src) => `asset://localhost/${src}`,
    });
    expect(rowOf(container, 'Notes').querySelector('img.space__avatar')).toHaveAttribute(
      'src',
      'asset://localhost/Assets/Avatar.jpg'
    );
  });

  it('shows the Space emoji', () => {
    const { container } = renderPicker({
      avatar: { type: 'emoji', emoji: '🚀' },
      folderName: 'Notes',
    });
    expect(rowOf(container, 'Notes').querySelector('.emoji-icon')).toHaveTextContent('🚀');
  });

  it('keeps ordinary folders and the Templates root on their own icons', () => {
    const { container } = renderPicker({ avatar: { type: 'initial' }, folderName: 'Notes' });

    for (const title of ['Alpha', 'Templates']) {
      const row = rowOf(container, title);
      expect(row.querySelector('.space__initial')).toBeNull();
      expect(row.querySelector('.app-icon')).not.toBeNull();
    }
  });

  it('keeps the folder icon for the root row where no Space is provided', () => {
    const { container } = renderPicker(null);
    const root = rowOf(container, 'Notes');

    expect(root.querySelector('.space__initial')).toBeNull();
    expect(root.querySelector('.app-icon')).not.toBeNull();
  });
});
