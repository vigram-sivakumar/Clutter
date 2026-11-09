/**
 * What the native `initialize_space` command found: `initialized` when it just created the folder's `.clutter`
 * directory (an ordinary folder becoming a Space for the first time), `existing` when `.clutter` was already there and
 * was left exactly as it was.
 */
export type SpaceInitialization = 'initialized' | 'existing';

/**
 * A folder could not be made a Space. The open stops: nothing is scanned, repaired or written, and the folder is never
 * treated as a valid Space. `detail` is the native refusal, for the log; the message is for the user.
 */
export class SpaceInitializationError extends Error {
  readonly name = 'SpaceInitializationError';

  constructor(readonly detail: string) {
    super('Clutter couldn’t set up this folder as a Space. Nothing in the folder was changed.');
  }
}

type NativeCall = (command: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Asks the native side to make `path` a Space: it creates only the `.clutter` directory, only for a folder the user
 * has authorized (inside the runtime filesystem scope), and is idempotent. Run once per open, after the folder is
 * authorized and before anything is scanned or written; the atomic writer still refuses a root with no `.clutter`.
 *
 * Anything other than an explicit `initialized` or `existing` answer, including an unknown shape or a missing
 * command, is a failure: an unsuccessful initialization is never taken for a Space.
 */
export async function initializeSpace(call: NativeCall, path: string): Promise<SpaceInitialization> {
  let answer: unknown;
  try {
    answer = await call('initialize_space', { path });
  } catch (error) {
    throw new SpaceInitializationError(describe(error));
  }

  const status = typeof answer === 'object' && answer !== null ? (answer as { status?: unknown }).status : undefined;
  if (status === 'initialized' || status === 'existing') return status;

  throw new SpaceInitializationError(`unexpected answer: ${JSON.stringify(answer) ?? 'none'}`);
}

function describe(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const { code, detail } = error as { code?: unknown; detail?: unknown };
    if (typeof code === 'string') return `${code}${typeof detail === 'string' ? `: ${detail}` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}
