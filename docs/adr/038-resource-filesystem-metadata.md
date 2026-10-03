# ADR-038: Resource filesystem metadata — `VaultResource.metadata`, read once by Ingest/Sync through `VaultFileSystem.stat`

**Status:** Accepted (product direction, Vigram, 2026-10-03)

## Context

The Assets collection needs each asset's file size, creation time and last-modified time (an Asset Card shows `size · Created · Last edited`). A `VaultResource` carried only `id/kind/name/path/parentId` (spec §3b), and nothing in the pipeline read file metadata: `VaultFileSystem.readDirectory` returns names and a directory flag only, and Notes get their dates from frontmatter, which an asset does not have. These values are facts about the file, not Clutter Page Properties.

## Decision

1. **Domain.** `VaultResource` gains an optional `metadata: { size: number; createdAt: string | null; modifiedAt: string | null }` (ISO-8601 timestamps, the same representation Pages use; `null` when the platform cannot report one). It is optional because a provider may lack `stat` or a stat may fail; a resource without it is otherwise unchanged.
2. **Platform.** `VaultFileSystem` gains one optional, read-only primitive, `stat(path): Promise<VaultFileStat>` (`size`, `createdAt: Date | null` from `birthtime`, `modifiedAt: Date | null` from `mtime`). Optional for the same reason `duplicate` is: test doubles that never need it are unaffected. `LocalVaultProvider` implements it with Tauri's fs `stat` (capability `fs:allow-stat` added); `SelfWriteAwareFileSystem` forwards it; `InMemoryVaultFileSystem` implements it for tests.
3. **Ingest.** One helper, `readResourceMetadata(fileSystem, path)`, is the only place a stat becomes `VaultResourceMetadata` (failure-tolerant: returns `undefined`). `VaultScanner` calls it once per discovered resource file and carries the result on `ScannedResourceFile.metadata`; `ResourceBuilder` copies it onto the `VaultResource`. No UI component ever stats a file; a card reads `resource.metadata`.
4. **Sync.** A resource's file *content* can change in place, which changes size and mtime. `VaultSyncService` therefore re-reads metadata when it reconciles an already-tracked resource (a `changed` event, or a subtree rescan) and, only if it differs, calls the new `Vault.updateResourceMetadata(id, metadata)`, which emits a new `resource-changed` event. New resources discovered by Sync are built with their metadata the same way as at startup.
5. **Unchanged.** Rename, archive, move and restore only change `name/path/parentId` (`updateResourcePath` already spreads the existing resource), so metadata is preserved — a rename does not touch a file's size or timestamps. No new Gate operation kind and no disk write are involved: this is read-only ingest data.

## Alternatives considered

- *Stat per card from the UI* — a filesystem call per card render, and a UI→platform dependency the layering forbids.
- *Stat lazily on first display and cache outside Vault* — a second, unowned store of resource facts that Sync would also have to invalidate.
- *Treat them as Page Properties* — assets have no frontmatter; these are file facts, not user-owned properties.

## Consequences

- Startup does one extra `stat` per supported resource file during the scan the scanner already performs (one per image/PDF, none per card).
- Spec §3b's `VaultResource` shape and the `VaultFileSystem` primitive list gain the fields above; the Vault event set gains `resource-changed`.
- External edits to an asset update its "Last edited" and size once the watcher reports the change.
