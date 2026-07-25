// Represents the parsed destination of a wiki link. Resolution is performed
// separately by LinkResolver.
export interface Link {
  readonly sourcePageId: string;
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}
