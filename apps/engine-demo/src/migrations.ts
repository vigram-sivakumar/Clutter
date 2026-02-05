/**
 * PHASE 21 — Versioned Migrations
 *
 * Shape evolution layer that runs BEFORE normalization.
 *
 * Principles:
 * - Each migration handles exactly one version jump
 * - Migrations are pure functions (no side effects)
 * - Never throws (graceful degradation)
 * - Preserves unknown fields (forward compatibility)
 * - Deterministic output
 */

import { LATEST_VERSION } from './normalize';

/**
 * Migration function signature
 *
 * Takes state at version N, returns state at version N+1.
 */
type Migration = (state: any) => any;

/**
 * PHASE 21 — Migration V1 → V2
 *
 * Problem: V1 files didn't have `views` or `templates` fields.
 * Solution: Add empty arrays if missing.
 */
function migrateV1toV2(state: any): any {
  return {
    ...state,
    version: 2,
    views: state.views ?? [],
    templates: state.templates ?? [],
  };
}

/**
 * PHASE 23 — Migration V2 → V3
 *
 * Problem: V2 files didn't have `documentId` field.
 * Solution: Generate unique document ID if missing.
 *
 * Document ID prevents false merges during sync:
 * - Same node.id in different documents = distinct nodes
 * - Once generated, never changes
 */
function migrateV2toV3(state: any): any {
  return {
    ...state,
    version: 3,
    documentId: state.documentId ?? crypto.randomUUID(),
  };
}

/**
 * Migration registry
 *
 * Maps from-version to migration function.
 * Each key represents the version to migrate FROM.
 */
const migrations: Record<number, Migration> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  // Future migrations go here:
  // 3: migrateV3toV4,
};

/**
 * PHASE 21 — Migration Runner
 *
 * Applies migrations sequentially from input version to LATEST_VERSION.
 *
 * Rules:
 * - Never skips versions
 * - Never branches
 * - Preserves unknown fields at each step
 * - Stops if migration missing (forward-compatible)
 * - Never throws
 */
export function migrateToLatest(input: any): any {
  // Clone to avoid mutation
  let state = { ...input };

  // Default to version 1 if missing (legacy files)
  let version = typeof state.version === 'number' ? state.version : 1;

  // Apply migrations sequentially
  while (version < LATEST_VERSION) {
    const migrate = migrations[version];

    // If migration doesn't exist, stop (forward-compatible)
    if (!migrate) {
      console.warn(
        `Migration from version ${version} not found. Stopping at version ${version}.`
      );
      break;
    }

    // Apply migration
    state = migrate(state);
    version++;

    // Ensure version field is updated
    state.version = version;
  }

  return state;
}
