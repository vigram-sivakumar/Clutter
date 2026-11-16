import { resolve, join } from 'node:path';
export function planId(args) {
  if (
    args.length !== 2 ||
    args[0] !== '--plan' ||
    !/^[A-Za-z0-9-]{1,100}$/.test(args[1])
  )
    throw Error('USE_--plan_ID');
  return args[1];
}
export function validatePlan(value, folder) {
  if (
    value?.format !== 'clutter-manual-plan44' ||
    !['H-T', 'H-E'].includes(value.candidate) ||
    !Number.isSafeInteger(value.targetUiPid) ||
    value.targetUiPid <= 0 ||
    !/^[a-f0-9]{64}$/.test(value.bundleSha256) ||
    value.tracePath !== join(resolve(folder), 'manual.trace')
  )
    throw Error('INVALID_MANUAL_PLAN');
  return value;
}
export function acquisitionGate(status, errorCode, schemas) {
  if (status !== 0 || errorCode) return 'blocked: saved trace export failed';
  return [
    'process-info',
    'hitches-frame-lifetimes',
    'displayed-surfaces-interval',
  ].every((s) => schemas.includes(s))
    ? 'readable-schema-gate-only'
    : 'blocked: required schemas unavailable';
}
export function reuseGui(locator, command, imageMatches) {
  return (
    imageMatches &&
    typeof locator?.privateBootFile === 'string' &&
    locator.privateBootFile.length > 0 &&
    typeof command === 'string' &&
    command.trim().endsWith(locator.privateBootFile) &&
    command.includes('--host-config ')
  );
}
