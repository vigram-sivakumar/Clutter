import {
  AtomicWriteProtocolError,
  AtomicWriteRefusedError,
  type AtomicVaultWriter,
  type AtomicWriteOutcome,
  type AtomicWriteRefusalCode,
  type DurabilityGap,
  type DurabilityResult,
  type DurabilityStatus,
  type InspectedTarget,
  type InspectionResult,
  type InspectQuery,
  type NotCommittedReason,
  type TempState,
  type WriteAttempt,
} from './AtomicWriteContract';

/** The one function this class needs from Tauri: `invoke` from `@tauri-apps/api/core`. Injected so it can be tested. */
export type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export const ATOMIC_COMMANDS = {
  write: 'atomic_write_file',
  inspect: 'atomic_inspect_write',
  confirmDurability: 'atomic_confirm_durability',
} as const;

const REASONS: ReadonlySet<string> = new Set<NotCommittedReason>([
  'readOnlyTarget',
  'unsupportedSymlink',
  'notARegularFile',
  'invalidTarget',
  'outOfScope',
  'insufficientSpace',
  'permissionDenied',
  'unsupportedOperation',
  'staleExpected',
  'targetChanged',
  'unsupportedFilesystem',
  'metadataPreservationFailed',
  'destinationExists',
  'destinationAppeared',
  'targetMissing',
  'io',
]);
const REFUSAL_CODES: ReadonlySet<string> = new Set<AtomicWriteRefusalCode>(['invalidVaultRoot', 'invalidPath', 'outOfScope']);
const TARGETS: ReadonlySet<string> = new Set<InspectedTarget>(['holdsAttempted', 'holdsPrevious', 'missing', 'holdsOther']);

type Json = Record<string, unknown>;

function record(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AtomicWriteProtocolError(`${what} is not an object`);
  }
  return value as Json;
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new AtomicWriteProtocolError(`${what} is not a string`);
  return value;
}

function textList(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new AtomicWriteProtocolError(`${what} is not a list of strings`);
  }
  return value as string[];
}

function reason(value: unknown): NotCommittedReason {
  if (typeof value !== 'string' || !REASONS.has(value)) {
    throw new AtomicWriteProtocolError(`unknown reason ${JSON.stringify(value)}`);
  }
  return value as NotCommittedReason;
}

function gap(value: unknown): DurabilityGap {
  const entry = record(value, 'a durability gap');
  switch (entry.status) {
    case 'fileFsyncOnly':
      return { kind: 'fileFsyncOnly' };
    case 'directoryFsyncOnly':
      return { kind: 'directoryFsyncOnly' };
    case 'directorySyncFailed':
      return { kind: 'directorySyncFailed', detail: text(entry.detail, 'a gap detail') };
    case 'fileSyncFailed':
      return { kind: 'fileSyncFailed', detail: text(entry.detail, 'a gap detail') };
    default:
      throw new AtomicWriteProtocolError(`unknown durability gap ${JSON.stringify(entry.status)}`);
  }
}

function gaps(value: unknown): DurabilityGap[] {
  if (!Array.isArray(value)) throw new AtomicWriteProtocolError('gaps is not a list');
  return value.map(gap);
}

function durability(value: unknown): DurabilityStatus {
  const entry = record(value, 'a durability status');
  if (entry.status === 'confirmed') return { status: 'confirmed' };
  if (entry.status === 'unconfirmed') return { status: 'unconfirmed', gaps: gaps(entry.gaps) };
  throw new AtomicWriteProtocolError(`unknown durability ${JSON.stringify(entry.status)}`);
}

export function parseWriteOutcome(value: unknown): AtomicWriteOutcome {
  const entry = record(value, 'the write result');
  switch (entry.status) {
    case 'committed': {
      if (entry.replaced !== 'existing' && entry.replaced !== 'created') {
        throw new AtomicWriteProtocolError(`unknown replaced ${JSON.stringify(entry.replaced)}`);
      }
      return {
        status: 'committed',
        replaced: entry.replaced,
        durability: durability(entry.durability),
        confirmedByInspection: entry.confirmedByInspection === true,
        metadataNotes: textList(entry.metadataNotes, 'metadataNotes'),
        leftovers: textList(entry.leftovers, 'leftovers'),
      };
    }
    case 'notCommitted':
      return {
        status: 'notCommitted',
        reason: reason(entry.reason),
        detail: text(entry.detail, 'detail'),
        leftovers: textList(entry.leftovers, 'leftovers'),
      };
    case 'uncertain':
      return {
        status: 'uncertain',
        detail: text(entry.detail, 'detail'),
        recoveryPaths: textList(entry.recoveryPaths, 'recoveryPaths'),
      };
    default:
      throw new AtomicWriteProtocolError(`unknown write status ${JSON.stringify(entry.status)}`);
  }
}

export function parseDurabilityResult(value: unknown): DurabilityResult {
  const entry = record(value, 'the durability result');
  switch (entry.status) {
    case 'confirmed':
      return { status: 'confirmed' };
    case 'unconfirmed':
      return { status: 'unconfirmed', gaps: gaps(entry.gaps) };
    case 'superseded':
      return { status: 'superseded' };
    case 'missing':
      return { status: 'missing' };
    case 'refused':
      return { status: 'refused', reason: reason(entry.reason), detail: text(entry.detail, 'detail') };
    case 'failed':
      return { status: 'failed', detail: text(entry.detail, 'detail') };
    default:
      throw new AtomicWriteProtocolError(`unknown durability status ${JSON.stringify(entry.status)}`);
  }
}

function tempState(value: Json): TempState {
  switch (value.state) {
    case 'absent':
      return { state: 'absent' };
    case 'holdsAttempted':
      return { state: 'holdsAttempted' };
    case 'holdsOther':
      return { state: 'holdsOther' };
    case 'unreadable':
      return { state: 'unreadable', detail: text(value.detail, 'detail') };
    default:
      throw new AtomicWriteProtocolError(`unknown temporary-file state ${JSON.stringify(value.state)}`);
  }
}

export function parseInspectionResult(value: unknown): InspectionResult {
  const entry = record(value, 'the inspection result');
  switch (entry.status) {
    case 'inspected': {
      if (typeof entry.target !== 'string' || !TARGETS.has(entry.target)) {
        throw new AtomicWriteProtocolError(`unknown target ${JSON.stringify(entry.target)}`);
      }
      if (!Array.isArray(entry.temps)) throw new AtomicWriteProtocolError('temps is not a list');
      return {
        status: 'inspected',
        target: entry.target as InspectedTarget,
        temps: entry.temps.map((temp) => {
          const report = record(temp, 'a temporary-file report');
          return { path: text(report.path, 'path'), ...tempState(report) };
        }),
      };
    }
    case 'refused':
      return { status: 'refused', reason: reason(entry.reason), detail: text(entry.detail, 'detail') };
    case 'failed':
      return { status: 'failed', detail: text(entry.detail, 'detail') };
    default:
      throw new AtomicWriteProtocolError(`unknown inspection status ${JSON.stringify(entry.status)}`);
  }
}

/** A command-level refusal arrives as `{ code, detail }`; anything else is rethrown as it was. */
function toRefusal(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) {
    const { code, detail } = error as { code?: unknown; detail?: unknown };
    if (typeof code === 'string' && REFUSAL_CODES.has(code) && typeof detail === 'string') {
      return new AtomicWriteRefusedError(code as AtomicWriteRefusalCode, detail);
    }
  }
  return error;
}

/**
 * The native atomic writer: three Tauri commands, scoped natively to the approved filesystem scope and to
 * `vaultRoot` (ADR-063, Stage 2a). **Not constructed anywhere in the application.** `vaultRoot` is a narrowing the
 * native layer verifies; it is never authorization.
 */
export class NativeAtomicVaultWriter implements AtomicVaultWriter {
  readonly kind = 'native-atomic' as const;

  constructor(
    private readonly invoke: Invoke,
    private readonly vaultRoot: string
  ) {}

  private async call(command: string, request: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.invoke(command, { request: { vaultRoot: this.vaultRoot, ...request } });
    } catch (error) {
      throw toRefusal(error);
    }
  }

  async write(attempt: WriteAttempt): Promise<AtomicWriteOutcome> {
    return parseWriteOutcome(
      await this.call(ATOMIC_COMMANDS.write, {
        path: attempt.path,
        contents: attempt.contents,
        intent: attempt.intent,
      })
    );
  }

  async inspect(query: InspectQuery): Promise<InspectionResult> {
    return parseInspectionResult(
      await this.call(ATOMIC_COMMANDS.inspect, {
        path: query.path,
        attempted: query.attempted,
        previous: query.previous,
        tempPaths: query.tempPaths,
      })
    );
  }

  async confirmDurability(path: string, expected: string): Promise<DurabilityResult> {
    return parseDurabilityResult(await this.call(ATOMIC_COMMANDS.confirmDurability, { path, expected }));
  }
}
