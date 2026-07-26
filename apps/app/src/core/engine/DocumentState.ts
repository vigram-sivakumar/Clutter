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
 * Unsaved changes are not represented by DocumentState.
 *
 * A document is considered dirty whenever the current revision differs from the latest saved revision.
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
