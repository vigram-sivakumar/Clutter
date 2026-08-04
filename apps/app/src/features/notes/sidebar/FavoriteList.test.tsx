// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FavoriteList } from './FavoriteList';
import { Workspace } from '@core/workspace/Workspace';
import type { FavoriteItem } from '../models/FavoriteItem';

afterEach(() => {
  cleanup();
});

describe('FavoriteList — no unknown DOM props leak through Entry (React console warning regression)', () => {
  it('renders a favorited note without React warning about an unrecognized DOM attribute', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items: FavoriteItem[] = [
      { id: 'note-1', title: 'My Note', titleStyle: 'default', type: 'note' },
    ];

    render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders a favorited folder without React warning about an unrecognized DOM attribute', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items: FavoriteItem[] = [
      { id: 'folder-1', title: 'My Folder', titleStyle: 'default', type: 'folder' },
    ];

    render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
