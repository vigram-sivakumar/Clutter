// Durable transport ingress, not a semantic mutation owner. Every replay calls Core.
import {
  constants as C,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  lstatSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseCommand, stable, Fault } from '../contracts.ts';
import { hash } from './media-formats.mjs';
import { syncDirectory } from './media-files.mjs';
const format = 'clutter-pending-media-v1';
export class MediaIngress {
  constructor({ directory, spaceId, peerId, execute, phase = () => {} }) {
    if (
      realpathSync(directory) !== directory ||
      lstatSync(directory).isSymbolicLink()
    )
      throw new Fault('UNSAFE_INGRESS_DIRECTORY');
    this.directory = directory;
    this.spaceId = spaceId;
    this.peerId = peerId;
    this.execute = execute;
    this.phase = phase;
  }
  command(value) {
    const c = parseCommand(value);
    if (
      !['media.import', 'media.replace', 'media.remove'].includes(c.method) ||
      c.spaceId !== this.spaceId
    )
      throw new Fault('INVALID_MEDIA_INGRESS');
    return c;
  }
  path(id) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
      throw new Fault('INVALID_OPERATION_ID');
    return join(this.directory, id + '.json');
  }
  read(id) {
    const fd = openSync(this.path(id), C.O_RDONLY | C.O_NOFOLLOW);
    try {
      const s = lstatSync(this.path(id));
      if (!s.isFile() || s.isSymbolicLink() || s.size > 1048576)
        throw new Fault('BROKEN_MEDIA_INGRESS');
      const row = JSON.parse(readFileSync(fd, 'utf8'));
      const c = this.command(row.command);
      if (
        row.format !== format ||
        row.spaceId !== this.spaceId ||
        row.peerId !== this.peerId ||
        c.operationId !== id ||
        row.hash !== hash(stable(c))
      )
        throw new Fault('BROKEN_MEDIA_INGRESS');
      return c;
    } finally {
      closeSync(fd);
    }
  }
  list() {
    return readdirSync(this.directory)
      .filter((n) => n.endsWith('.json'))
      .map((n) => this.read(n.slice(0, -5)));
  }
  put(value) {
    const c = this.command(value),
      path = this.path(c.operationId);
    try {
      const old = this.read(c.operationId);
      if (stable(old) !== stable(c)) throw new Fault('OPERATION_ID_REUSED');
      return c;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    this.phase('before_journal');
    const temp = join(this.directory, '.' + randomUUID() + '.part'),
      fd = openSync(
        temp,
        C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
        0o600
      );
    try {
      writeFileSync(
        fd,
        stable({
          format,
          spaceId: this.spaceId,
          peerId: this.peerId,
          command: c,
          hash: hash(stable(c)),
        })
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    syncDirectory(this.directory);
    this.phase('after_journal');
    return c;
  }
  async submit(value) {
    const c = this.put(value);
    const result = await this.execute(c);
    if (result.ok) {
      try {
        unlinkSync(this.path(c.operationId));
        syncDirectory(this.directory);
      } catch (e) {
        if (e.code !== 'ENOENT')
          return { durable: true, result, retained: true };
      }
    }
    return { durable: true, result };
  }
  async replay() {
    const results = [];
    for (const c of this.list()) results.push(await this.submit(c));
    return results;
  }
}
