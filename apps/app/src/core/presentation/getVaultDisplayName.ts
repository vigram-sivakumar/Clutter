import { VaultPath } from '../vault/ingest/VaultPath';

/**
 * The single source of truth for "what name represents the vault root" —
 * the physical folder's own name (VaultPath.filename of its root path),
 * exactly like every other folder's displayed name derives from its own
 * path/name. Every surface that needs to show the vault root (the
 * sidebar's root section, the Move picker's root destination) reads this
 * one function rather than each deriving or hardcoding its own name for
 * the same thing.
 *
 * Falls back to "Vault" only when the root path's basename is genuinely
 * empty (e.g. the vault root resolves to `/`) — never a routine case, but
 * VaultPath.filename can return `''` for a bare root, and every caller
 * needs *some* non-empty label to render.
 */
export function getVaultDisplayName(vaultRoot: string): string {
  return VaultPath.filename(vaultRoot) || 'Vault';
}
