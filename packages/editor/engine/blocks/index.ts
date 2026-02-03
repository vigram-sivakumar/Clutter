/**
 * Block System
 *
 * Organized block-specific logic:
 * - schemas: Property shapes and defaults
 * - behaviors: State mutation logic
 * - (chrome components exported separately from chrome/blocks/)
 *
 * Phase 1 (Current):
 * - Explicit separation of concerns
 * - Chrome/behavior/schema boundaries
 * - No formal BlockDefinition contract yet
 *
 * Phase 2 (After Field + Checklist + Toggle):
 * - Evaluate if BlockDefinition interface is needed
 * - Centralize keyboard navigation if pattern emerges
 */

export * from './schemas';
export * from './behaviors';
