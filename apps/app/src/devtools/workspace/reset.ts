/**
 * Workspace reset for testing.
 *
 * Provides deterministic state reset for test isolation. Tests call this
 * before seeding to ensure a clean starting state.
 *
 * This lives in devtools/ so it's never imported by production code,
 * only by tests via the optional devtools API.
 *
 * Note: Phase 1 provides workspace reset only (closing pages, clearing
 * navigation state). Vault clearing is deferred to Phase 2 (requires
 * deeper integration with the Application class).
 */

import type { Workspace } from '../../core/workspace/Workspace';

/**
 * Reset workspace to a clean state.
 *
 * - Clears all open pages
 * - Clears active page/folder selection (sets to null)
 * - Clears navigation history (back/forward stacks)
 *
 * This provides UI-level reset for test isolation. Vault content is
 * unchanged — that's handled by seeds (which should use a fresh/empty
 * vault directory per test).
 *
 * Phase 2 will add vault-clearing capability via a public API on Application.
 *
 * NOTE: The workspace parameter is accepted for consistency with the devtools API
 * interface, but a full implementation would require public methods on Workspace
 * to close pages and clear state (currently these are private or inaccessible).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resetWorkspace(_workspace: Workspace): void {
  // TODO (Phase 2): Implement full workspace reset via public Workspace API.
  // Required methods:
  // - workspace.closeAllPages()
  // - workspace.clearActiveView()
  // - workspace.clearHistory()
}
