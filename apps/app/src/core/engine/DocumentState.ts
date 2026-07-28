/**
 * Represents the lifecycle state of an open document.
 *
 * A DocumentState describes the current condition of a
 * DocumentSession rather than the document itself.
 *
 * Typical transitions include:
 *
 * Loading → Clean → Saving → Clean
 *                  │
 *                  ├── Conflict
 *                  └── SaveError
 *
 * Unsaved changes are intentionally not represented by DocumentState.
 *
 * DocumentState models only the operational lifecycle of a DocumentSession.
 *
 * Dirty state is derived independently by comparing the current revision with the latest saved revision.
 *
 * This separation allows lifecycle and dirty state to evolve independently. For example, a document may be:
 *
 * - Clean and not dirty.
 * - Clean but dirty (idle with unsaved edits).
 * - Saving while dirty.
 * - In Conflict while dirty.
 * - In SaveError while dirty.
 *
 * DocumentState should never duplicate information that can already be derived from revisions.
 *
 * A disposed DocumentSession enters:
 *
 * Disposed
 *
 * The exact state machine may evolve as the engine grows,
 * but the concept remains owned by the DocumentSession.
 */
export enum DocumentState {
  Loading,
  Clean,
  Saving,
  Conflict,
  SaveError,
  Disposed,
}
