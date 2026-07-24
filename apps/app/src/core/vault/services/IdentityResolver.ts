export interface ResolvedIdentity {
  readonly id: string;
  readonly isPersistent: boolean;
}

export class IdentityResolver {
  resolve(id: string | undefined, fallbackId: string): ResolvedIdentity {
    if (id) {
      return {
        id,
        isPersistent: true,
      };
    }

    return {
      id: fallbackId,
      isPersistent: false,
    };
  }
}
