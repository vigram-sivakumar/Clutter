// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';

import { ResourceContextMenu } from './ResourceContextMenu';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const ids = (menu: readonly { id: string }[]) => menu.map((item) => item.id);

describe('a file\'s right-click menu (the Assets collection)', () => {
  const fileContext = { assetKind: 'image' as const, status: 'active' as const, isEffectivelyArchived: false, isDeletable: false };

  it('offers Rename — the viewer\'s own menu does not — and never Change icon (a file has no icon)', () => {
    expect(ids(buildResourceActionMenu('asset', fileContext, 'assets-collection'))).toContain('rename');
    expect(ids(buildResourceActionMenu('asset', fileContext, 'assets-collection'))).not.toContain('change-icon');
    expect(ids(buildResourceActionMenu('asset', fileContext, 'overlay'))).not.toContain('rename');
  });

  it('Rename opens the shared dialog with the NAME field only — no Description, no emoji — and saves through the file\'s own rename', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const menu = buildResourceActionMenu('asset', fileContext, 'assets-collection').filter((item) => item.id === 'rename');
    render(
      <ResourceContextMenu
        menu={{ menu, rename: { noun: 'file', name: 'photo', withDescription: false, withIcon: false, onSubmit } }}
        point={{ x: 10, y: 10 }}
        onDone={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    expect(screen.getByText('Rename file')).toBeInTheDocument();
    const name = screen.getByLabelText('File name') as HTMLInputElement;
    expect(name.value).toBe('photo');
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(screen.queryByRole('button', { name: /emoji/i })).toBeNull();

    fireEvent.change(name, { target: { value: 'holiday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('holiday', undefined, undefined);
  });

  it('a rejected rename is shown in the dialog, which stays open', async () => {
    const menu = buildResourceActionMenu('asset', fileContext, 'assets-collection').filter((item) => item.id === 'rename');
    render(
      <ResourceContextMenu
        menu={{ menu, rename: { noun: 'file', name: 'photo', withDescription: false, withIcon: false, onSubmit: () => Promise.reject(new Error('Could not rename')) } }}
        point={{ x: 10, y: 10 }}
        onDone={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not rename');
  });
});
