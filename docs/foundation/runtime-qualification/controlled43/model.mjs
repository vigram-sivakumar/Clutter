export function startAnnouncement() {
  let tail = '',
    announced = false;
  return (chunk) => {
    tail = (tail + chunk).slice(-4096);
    if (!announced && tail.includes('Ctrl-C to stop the recording')) {
      announced = true;
      return true;
    }
    return false;
  };
}
export function controlledResult({ status, errorCode, tracePresent, tocExit }) {
  if (errorCode || !tracePresent || tocExit !== 0)
    return 'method-trial-capture-blocked';
  return 'method-trial-recorded-correlation-unvalidated';
}
