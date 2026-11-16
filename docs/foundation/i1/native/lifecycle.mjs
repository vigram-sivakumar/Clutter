// A runner must never silently substitute a fresh Space for an existing session.
export function sessionChoice({
  existing,
  reopen = false,
  fresh = false,
  isLive = () => false,
}) {
  if (reopen && fresh) throw Error('CHOOSE_REOPEN_OR_NEW');
  if (reopen) {
    if (!existing?.session || !existing?.bundle)
      throw Error('NO_EXISTING_NATIVE28_SESSION');
    if (existing.uiPid && isLive(existing.uiPid, existing.session))
      throw Error('NATIVE28_WINDOW_STILL_OPEN');
    return existing;
  }
  if (existing && !fresh)
    throw Error(
      'EXISTING_NATIVE28_SESSION_USE_native:core28:reopen_OR_EXPLICIT_--new'
    );
  return undefined;
}
