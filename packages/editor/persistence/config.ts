/**
 * Block-Level Persistence Configuration
 * 
 * Apple Notes Architecture: Write-ahead intent journal
 * 
 * When ENABLE_BLOCK_JOURNAL = true:
 * - Intent extraction is active
 * - Legacy autosave is gated (but not deleted)
 * - Every keystroke produces semantic intents
 * - Zero-data-loss persistence (crash-safe)
 * 
 * When false (rollback mode):
 * - Legacy autosave path is active
 * - Intent extraction still logs (for debugging)
 * - Original behavior preserved
 */

export const ENABLE_BLOCK_JOURNAL = true;

/**
 * Why this flag exists:
 * 
 * Not for "feature toggling" in production.
 * For clean signal isolation during development.
 * 
 * Once block journal is validated:
 * - Delete legacy autosave code entirely
 * - Delete this flag
 * - Block journal becomes the only path
 * 
 * Apple doesn't ship two persistence systems.
 * Neither do we (eventually).
 */
