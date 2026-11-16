// Modify only the freshly generated development bundle, never an installed app.
export function setLoopbackPolicy(plist, invoke) {
  if (!plist.endsWith('.app/Contents/Info.plist'))
    throw Error('GENERATED_APP_PLIST_REQUIRED');
  const call = (command) =>
    invoke('/usr/libexec/PlistBuddy', ['-c', command, plist]);
  const probe = call('Print :NSAppTransportSecurity');
  if (probe.status === 0) {
    if (call('Delete :NSAppTransportSecurity').status !== 0)
      throw Error('ATS_REPLACE_FAILED');
  } else if (
    probe.status !== 1 ||
    !/Does Not Exist/.test((probe.stdout ?? '') + (probe.stderr ?? ''))
  ) {
    throw Error('ATS_PROBE_FAILED');
  }
  for (const command of [
    'Add :NSAppTransportSecurity dict',
    'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true',
  ]) {
    if (call(command).status !== 0) throw Error('ATS_LOOPBACK_POLICY_FAILED');
  }
}
