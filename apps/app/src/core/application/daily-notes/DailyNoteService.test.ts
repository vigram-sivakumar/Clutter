import { describe, expect, it } from 'vitest';
import { DailyNoteService } from './DailyNoteService';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

describe('DailyNoteService.ensureDirectory', () => {
  it('creates the year/month directory and returns the absolute note path', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const service = new DailyNoteService(fileSystem);
    const date = new Date(2026, 7, 1); // August 1, 2026

    const path = await service.ensureDirectory(date, ROOT);

    expect(path).toBe(`${ROOT}/Daily Notes/2026/August/2026-08-01.md`);
    expect(await fileSystem.exists(`${ROOT}/Daily Notes/2026/August`)).toBe(
      true
    );
  });
});

// DailyNoteService.ensurePage() was retired by ADR-017: creating today's
// note through the Gate is no longer this service's job (it owns
// path/directory conventions only). The equivalent behavior — resolving a
// deterministic path to either the real Vault page or an unpersisted
// draft, and persisting that draft correctly on first save — is now
// PageOperations.openAtPath()'s responsibility, covered in
// PageOperations.test.ts's "drafts (ADR-017)" describe block.
