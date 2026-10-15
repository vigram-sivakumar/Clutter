import { describe, expect, it, vi } from 'vitest';

import type { Asset } from '@core/vault/models/Asset';
import {
  buildImageAssetMenu,
  buildRemoteImageMenuHandlers,
} from '@features/markdown/editor/codemirror/image/ImageOverlayMoreActions';

import { buildAssetItemMenu } from './buildCollectionItemMenu';

const remoteAsset = (url: string, kind: 'image' | 'pdf' = 'image') =>
  ({ id: `remote:${url}`, source: 'remote', kind, name: 'x.png', url, references: [] }) as unknown as Asset;

const actions = () => ({
  onSaveToVault: vi.fn(),
  onOpenInBrowser: vi.fn(),
  onCopyLink: vi.fn(),
  onDownload: vi.fn(),
});

describe('buildAssetItemMenu — a remote image', () => {
  const application = {} as never;

  it('is exactly the image overlay\'s remote menu (same items, order, labels, icons, dividers)', () => {
    const menu = buildAssetItemMenu(application, { remoteImage: actions(), onSetRemoteAsCover: vi.fn() }, remoteAsset('https://a/x.png'))!;

    expect(menu.menu).toEqual(buildImageAssetMenu({ remote: true, canSetAsCover: true }));
    expect(menu.menu.map((item) => item.id)).toEqual(expect.arrayContaining(['save-to-vault', 'open-in-browser', 'copy-link', 'download']));
  });

  it('runs each action on the right-clicked asset\'s own URL', () => {
    const remoteImage = actions();
    const onSetRemoteAsCover = vi.fn();
    const menu = buildAssetItemMenu(application, { remoteImage, onSetRemoteAsCover }, remoteAsset('https://a/one.png'))!;

    menu.handlers!['save-to-vault']!();
    menu.handlers!['open-in-browser']!();
    menu.handlers!['copy-link']!();
    menu.handlers!['download']!();
    menu.handlers!['set-as-cover-image']!();

    expect(remoteImage.onSaveToVault).toHaveBeenCalledWith('https://a/one.png');
    expect(remoteImage.onOpenInBrowser).toHaveBeenCalledWith('https://a/one.png');
    expect(remoteImage.onCopyLink).toHaveBeenCalledWith('https://a/one.png');
    expect(remoteImage.onDownload).toHaveBeenCalledWith('https://a/one.png');
    expect(onSetRemoteAsCover).toHaveBeenCalledWith('https://a/one.png');
  });

  it('every listed action has a handler', () => {
    const menu = buildAssetItemMenu(application, { remoteImage: actions(), onSetRemoteAsCover: vi.fn() }, remoteAsset('https://a/x.png'))!;
    for (const item of menu.menu) {
      expect(menu.handlers![item.id], item.id).toBeTypeOf('function');
    }
  });

  it('shares its handlers with the overlay (one implementation)', () => {
    const remoteImage = actions();
    buildRemoteImageMenuHandlers({ url: 'https://a/x.png', actions: remoteImage })['copy-link']!();
    expect(remoteImage.onCopyLink).toHaveBeenCalledWith('https://a/x.png');
  });

  it('has no menu without the actions, or for a remote PDF', () => {
    expect(buildAssetItemMenu(application, {}, remoteAsset('https://a/x.png'))).toBeNull();
    expect(buildAssetItemMenu(application, { remoteImage: actions() }, remoteAsset('https://a/x.pdf', 'pdf'))).toBeNull();
  });
});
