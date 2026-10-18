import { describe, expect, it } from 'vitest';

/**
 * `labVault.ts` hand-builds a `MembershipSelector` (cast through `unknown`, so the compiler cannot say what
 * it lacks) and runs `buildMoveDestinationItems` / `buildCoverFolderItems` over it as the module loads. The
 * dev lab is mounted by every dev build (main.tsx), so a method the builders call that the stub lacks
 * (`getInboxFolder`, `getTemplatesFolder`) throws a `TypeError` on every dev launch.
 */
describe('dev lab vault', () => {
  it('builds the move-destination and cover-folder items its selector stub is used for', async () => {
    const lab = await import('./labVault');

    expect(lab.labFolderItems.length).toBeGreaterThan(0);
    expect(lab.labCoverFolderItems.length).toBeGreaterThan(0);
  });

  it('offers no Inbox or Templates row: the lab vault has neither folder', async () => {
    const { labFolderItems } = await import('./labVault');

    expect(labFolderItems.some((item) => /^(inbox|templates)$/i.test(item.title))).toBe(false);
  });
});
