import { describe, expect, it } from 'vitest';

import { resolveNavigationUrl } from './openExternalUrl';

describe('resolveNavigationUrl', () => {
  it('unwraps a nested link-as-destination and resolves the inner URL', () => {
    expect(resolveNavigationUrl('[www.google.co.in](https://www.google.co.in)')).toBe(
      'https://www.google.co.in'
    );
  });

  it('prepends https:// to a bare domain with a path', () => {
    expect(resolveNavigationUrl('google.co.in/path')).toBe('https://google.co.in/path');
  });

  it('leaves an explicit https:// destination unchanged', () => {
    expect(resolveNavigationUrl('https://example.com')).toBe('https://example.com');
  });

  it('leaves an explicit http:// destination unchanged', () => {
    expect(resolveNavigationUrl('http://example.com')).toBe('http://example.com');
  });

  it('leaves a mailto: destination unchanged', () => {
    expect(resolveNavigationUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
  });

  it('leaves a tel: destination unchanged', () => {
    expect(resolveNavigationUrl('tel:+919999999999')).toBe('tel:+919999999999');
  });

  it('leaves a ./relative destination unchanged', () => {
    expect(resolveNavigationUrl('./docs')).toBe('./docs');
  });

  it('leaves a ../relative destination unchanged', () => {
    expect(resolveNavigationUrl('../docs')).toBe('../docs');
  });

  it('leaves a /absolute-path destination unchanged', () => {
    expect(resolveNavigationUrl('/docs')).toBe('/docs');
  });

  it('leaves a #fragment destination unchanged', () => {
    expect(resolveNavigationUrl('#section')).toBe('#section');
  });

  it('leaves a ?query destination unchanged', () => {
    expect(resolveNavigationUrl('?query')).toBe('?query');
  });

  it('prepends https:// to a bare domain with no path', () => {
    expect(resolveNavigationUrl('example.com')).toBe('https://example.com');
  });

  it('resolves a nested link-as-destination whose inner URL has a path and query', () => {
    expect(
      resolveNavigationUrl('[www.example.com/path?q=1](https://www.example.com/path?q=1)')
    ).toBe('https://www.example.com/path?q=1');
  });
});
