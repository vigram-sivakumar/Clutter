/**
 * The one answer to "is a Space operation already under way?". Switching Space, removing the open Space and
 * renaming its folder each close the Application and change the registry, and writing a closed Space's profile must not
 * have that Space opened (or renamed or removed) underneath it, so they must never overlap. One owner at
 * a time: `begin` hands out a release function, or `null` when something else holds the guard.
 *
 * The holder must call its release on EVERY path — success, failure and cancellation. Releasing twice is harmless.
 */
export type SpaceLifecycleKind = 'removing' | 'renaming' | 'editing-profile';

export class SpaceLifecycleGuard {
  private holder: { readonly kind: SpaceLifecycleKind } | null = null;

  /** What currently holds the guard, if anything. */
  get active(): SpaceLifecycleKind | null {
    return this.holder?.kind ?? null;
  }

  begin(kind: SpaceLifecycleKind): (() => void) | null {
    if (this.holder !== null) return null;
    const holder = { kind };
    this.holder = holder;

    return () => {
      if (this.holder === holder) this.holder = null;
    };
  }
}
