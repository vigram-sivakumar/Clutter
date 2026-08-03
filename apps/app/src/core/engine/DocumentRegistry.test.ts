import { describe, expect, it } from 'vitest';
import { DocumentRegistry } from './DocumentRegistry';
import { DocumentState } from './DocumentState';

describe('DocumentRegistry.close', () => {
  it('disposes the session before removing it from the registry', () => {
    const registry = new DocumentRegistry();
    const session = registry.open('page-1', '# Hello');

    expect(session.state).toBe(DocumentState.Clean);

    registry.close('page-1');

    expect(session.state).toBe(DocumentState.Disposed);
  });

  it('removes the session from the registry, as before', () => {
    const registry = new DocumentRegistry();
    registry.open('page-1', '# Hello');

    registry.close('page-1');

    expect(registry.get('page-1')).toBeUndefined();
    expect(registry.isOpen('page-1')).toBe(false);
  });

  it('is a no-op when no session exists for the id', () => {
    const registry = new DocumentRegistry();

    expect(() => registry.close('missing-page')).not.toThrow();
    expect(registry.isOpen('missing-page')).toBe(false);
  });

  it('a second close for the same id is a no-op — the session stays Disposed, not re-notified', () => {
    const registry = new DocumentRegistry();
    const session = registry.open('page-1', '# Hello');

    registry.close('page-1');
    expect(session.state).toBe(DocumentState.Disposed);

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    registry.close('page-1');

    expect(session.state).toBe(DocumentState.Disposed);
    expect(notifications).toBe(0);
  });

  it('disposing one session does not affect another open session', () => {
    const registry = new DocumentRegistry();
    const sessionA = registry.open('page-a', '# A');
    const sessionB = registry.open('page-b', '# B');

    registry.close('page-a');

    expect(sessionA.state).toBe(DocumentState.Disposed);
    expect(sessionB.state).toBe(DocumentState.Clean);
    expect(registry.isOpen('page-b')).toBe(true);
  });
});

describe('DocumentRegistry.clear', () => {
  it('disposes every open session before removing them', () => {
    const registry = new DocumentRegistry();
    const sessionA = registry.open('page-a', '# A');
    const sessionB = registry.open('page-b', '# B');
    const sessionC = registry.open('page-c', '# C');

    registry.clear();

    expect(sessionA.state).toBe(DocumentState.Disposed);
    expect(sessionB.state).toBe(DocumentState.Disposed);
    expect(sessionC.state).toBe(DocumentState.Disposed);
  });

  it('removes every session from the registry, as before', () => {
    const registry = new DocumentRegistry();
    registry.open('page-a', '# A');
    registry.open('page-b', '# B');

    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.isOpen('page-a')).toBe(false);
    expect(registry.isOpen('page-b')).toBe(false);
  });

  it('is a no-op on an empty registry', () => {
    const registry = new DocumentRegistry();

    expect(() => registry.clear()).not.toThrow();
    expect(registry.size).toBe(0);
  });
});
