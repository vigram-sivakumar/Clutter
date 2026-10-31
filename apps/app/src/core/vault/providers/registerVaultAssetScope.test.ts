import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => tauri);

import { registerVaultAssetScope } from './registerVaultAssetScope';

beforeEach(() => {
  tauri.invoke.mockReset();
  tauri.isTauri.mockReturnValue(true);
});

describe('registerVaultAssetScope', () => {
  it('asks the native side to serve the opened Space', async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);

    await registerVaultAssetScope('/Users/me/Documents/Space');

    expect(tauri.invoke).toHaveBeenCalledWith('allow_vault_asset_scope', { vaultRoot: '/Users/me/Documents/Space' });
  });

  it('is a no-op in the web runtime', async () => {
    tauri.isTauri.mockReturnValue(false);

    await registerVaultAssetScope('/web-dev-vault');

    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('a Space the native side refuses (no runtime grant covers it) still opens: the refusal is logged, not thrown', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tauri.invoke.mockRejectedValueOnce('forbidden path: /Users/me/elsewhere');

    await expect(registerVaultAssetScope('/Users/me/elsewhere')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
