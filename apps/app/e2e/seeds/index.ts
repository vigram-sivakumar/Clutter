/**
 * Workspace seeds for deterministic test setup.
 *
 * Each seed is a TypeScript builder that sets up a known-good starting state.
 * Tests import and use seeds rather than building state inside test bodies.
 *
 * Example:
 *   await seed(page, 'empty');        // Fresh app, no vault files
 *   await seed(page, 'nestedFolders'); // Vault with 3 folders and sample notes
 *   await seed(page, 'largeVault');   // Vault with 100+ notes for performance testing
 *
 * Each seed function:
 * 1. Resets workspace state (via devtools API)
 * 2. Clears vault filesystem (via devtools API)
 * 3. Creates seed data (writes files to vault)
 * 4. Waits for app to recognize the new structure
 */

import type { Page } from '@playwright/test';
import { emptySeed } from './empty';
import { nestedFoldersSeed } from './nestedFolders';
import { largeVaultSeed } from './largeVault';

type SeedName = 'empty' | 'nestedFolders' | 'largeVault';

const seeds: Record<SeedName, (page: Page) => Promise<void>> = {
  empty: emptySeed,
  nestedFolders: nestedFoldersSeed,
  largeVault: largeVaultSeed,
};

/**
 * Apply a seed to set up test workspace.
 *
 * Must be called after the app loads (after a goto and waiting for the UI to mount).
 *
 * Example:
 *   await page.goto('/');
 *   await seed(page, 'nestedFolders');
 *   // Now the app has a vault with folders and notes
 */
export async function seed(page: Page, name: SeedName): Promise<void> {
  const seedFn = seeds[name];
  if (!seedFn) {
    throw new Error(`Unknown seed: ${name}. Available: ${Object.keys(seeds).join(', ')}`);
  }

  await seedFn(page);
}

export { emptySeed, nestedFoldersSeed, largeVaultSeed };
