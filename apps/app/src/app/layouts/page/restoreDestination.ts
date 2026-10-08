/** What needs a destination before it can be restored: something put in `Archive/` from outside Clutter. */
export interface RestoreDestinationRequest {
  readonly kind: 'page' | 'folder' | 'asset';
  readonly id: string;
}
