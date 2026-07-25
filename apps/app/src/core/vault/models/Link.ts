// Vault-wide projection of a unique link target.
// A Link represents a unique link aggregated from all LinkOccurrences in the vault.
// TODO: Ensure builder aggregates by targetPageId.
export interface Link {
  readonly targetPageId: string;
}
