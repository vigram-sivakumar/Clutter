// Opaque window-state storage mechanism; navigation policy belongs to the shared UI.
import { mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { hash, privateJSON, readJSON } from './session.mjs';
import { syncDirectory } from '../media-files.mjs';
export class WindowStateStore {
  constructor(directory, beforeWrite = () => {}) {
    this.directory = join(directory, 'window-state');
    this.beforeWrite = beforeWrite;
    try {
      mkdirSync(this.directory, { mode: 0o700 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    syncDirectory(directory);
  }
  execute(request) {
    const allowed =
      request?.action === 'read'
        ? ['action', 'windowId']
        : ['action', 'windowId', 'revision', 'value'];
    if (
      !request ||
      Object.keys(request).sort().join() !== allowed.sort().join() ||
      typeof request.windowId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(request.windowId) ||
      !['read', 'write'].includes(request.action)
    )
      throw Error('INVALID_WINDOW_STATE_REQUEST');
    const dir = lstatSync(this.directory);
    if (!dir.isDirectory() || dir.isSymbolicLink())
      throw Error('INVALID_WINDOW_STATE_DIRECTORY');
    const path = join(this.directory, hash(request.windowId) + '.json');
    let current;
    try {
      current = readJSON(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('WINDOW_STATE_UNREADABLE');
    }
    if (
      current &&
      (Object.keys(current).sort().join() !==
        'format,revision,value,windowId' ||
        current.format !== 'clutter-window-state-v1' ||
        current.windowId !== request.windowId ||
        !Number.isSafeInteger(current.revision) ||
        current.revision < 1 ||
        typeof current.value !== 'string')
    )
      throw Error('WINDOW_STATE_UNREADABLE');
    if (request.action === 'read')
      return {
        revision: current?.revision ?? 0,
        value: current?.value ?? null,
      };
    if (
      !Number.isSafeInteger(request.revision) ||
      request.revision < 1 ||
      typeof request.value !== 'string' ||
      Buffer.byteLength(request.value) > 524288
    )
      throw Error('INVALID_WINDOW_STATE_REQUEST');
    const next = {
      format: 'clutter-window-state-v1',
      windowId: request.windowId,
      revision: request.revision,
      value: request.value,
    };
    if (Buffer.byteLength(JSON.stringify(next) + '\n') > 1048576)
      throw Error('INVALID_WINDOW_STATE_REQUEST');
    if (current && request.revision < current.revision)
      throw Error('STALE_WINDOW_STATE');
    if (
      current &&
      request.revision === current.revision &&
      request.value !== current.value
    )
      throw Error('WINDOW_STATE_CONFLICT');
    this.beforeWrite();
    if (current?.revision === request.revision) syncDirectory(this.directory);
    else privateJSON(path, next);
    return { revision: request.revision };
  }
}
