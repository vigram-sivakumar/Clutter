import { describe, expect, it } from 'vitest';
import { getVaultDisplayName } from './getVaultDisplayName';

describe('getVaultDisplayName', () => {
  it("returns the vault root path's own basename", () => {
    expect(getVaultDisplayName('/Users/me/Documents/MyClutter')).toBe('MyClutter');
    expect(getVaultDisplayName('/Users/me/Documents/Workspace')).toBe('Workspace');
    expect(getVaultDisplayName('/Users/me/Documents/My Notes')).toBe('My Notes');
  });

  it('falls back to "Vault" only when the basename is genuinely empty', () => {
    expect(getVaultDisplayName('/')).toBe('Vault');
  });
});
