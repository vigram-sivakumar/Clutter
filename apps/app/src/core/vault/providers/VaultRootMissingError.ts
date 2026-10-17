/**
 * A vault's root folder is confirmed missing (the OS said "no such file or directory"). Distinct
 * from every other failure — permission denied, outside the allowed scope, a scan error — so callers
 * can tell a vanished vault from an unrelated problem. Thrown by `Application.bootstrap()` (opening
 * never creates the root) and by `LocalVaultProvider` (writing never recreates it).
 */
export class VaultRootMissingError extends Error {
  constructor(
    readonly rootPath: string,
    options?: { cause?: unknown }
  ) {
    super(`The vault folder no longer exists: ${rootPath}`, options);
    this.name = 'VaultRootMissingError';
  }
}
