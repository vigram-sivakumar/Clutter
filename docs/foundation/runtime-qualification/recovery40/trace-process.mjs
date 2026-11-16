// Operates only on its newly spawned trace CLI PID, never an app or process group.
import { spawn } from 'node:child_process';
export function traceProcess(
  executable,
  args,
  { cwd, env, interruptMs = 12000, terminateMs = 27000, killMs = 30000 } = {}
) {
  if (!(interruptMs > 0 && terminateMs > interruptMs && killMs > terminateMs))
    throw Error('INVALID_TRACE_DEADLINES');
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = {
      status: null,
      signal: null,
      errorCode: null,
      stdout: '',
      stderr: '',
      signalsSent: [],
      outputTruncated: false,
    };
    let finished = false;
    const timers = [];
    const signal = (kind) => {
      if (
        !finished &&
        child.pid &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        try {
          if (child.kill(kind)) result.signalsSent.push(kind);
        } catch {}
      }
    };
    const end = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      resolve(result);
    };
    const append = (key, chunk) => {
      const text = chunk.toString();
      if (Buffer.byteLength(result[key]) + Buffer.byteLength(text) <= 1048576)
        result[key] += text;
      else if (!result.outputTruncated) {
        result.outputTruncated = true;
        signal('SIGINT');
      }
    };
    child.stdout.on('data', (x) => append('stdout', x));
    child.stderr.on('data', (x) => append('stderr', x));
    child.once('error', (e) => {
      result.errorCode = e.code ?? 'SPAWN_ERROR';
      end();
    });
    child.once('close', (code, sig) => {
      result.status = code;
      result.signal = sig;
      end();
    });
    timers.push(
      setTimeout(() => signal('SIGINT'), interruptMs),
      setTimeout(() => signal('SIGTERM'), terminateMs),
      setTimeout(() => {
        signal('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        result.errorCode = 'TRACE_FINALIZATION_TIMEOUT';
        end();
      }, killMs)
    );
  });
}
