import { useSyncExternalStore } from 'react';
import type { RecoveryCandidate, RecoveryOperations } from '@core/application/recovery/RecoveryOperations';

const NONE: readonly RecoveryCandidate[] = [];
const noopSubscribe = () => () => {};
const noopSnapshot = () => '';

/** The unsaved work an earlier session left behind, as RecoveryOperations last found it (empty when there is none). */
export function useRecovery(operations: RecoveryOperations | null): readonly RecoveryCandidate[] {
  useSyncExternalStore(
    operations ? (listener) => operations.subscribe(listener) : noopSubscribe,
    operations ? () => operations.snapshot() : noopSnapshot
  );

  return operations?.candidates ?? NONE;
}
