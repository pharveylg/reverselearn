import { describe, expect, it } from 'vitest';
import { normalizeLiveAppUrl, persistedLiveAppOrigin } from '../lib/live-browser';

describe('live app browser URL policy', () => {
  const parent = 'https://pharveylg.github.io';
  it('adds HTTPS to a bare host and retains the chosen route', () => {
    expect(normalizeLiveAppUrl('my-app.vercel.app/login', parent, 'pharveylg.github.io')).toBe('https://my-app.vercel.app/login');
  });
  it('rejects non-web schemes and embedded credentials', () => {
    expect(() => normalizeLiveAppUrl('javascript:alert(1)', parent, 'pharveylg.github.io')).toThrow(/http/);
    expect(() => normalizeLiveAppUrl('https://user:secret@example.com', parent, 'pharveylg.github.io')).toThrow(/username or password/);
  });
  it('requires HTTPS except for local-to-local development', () => {
    expect(() => normalizeLiveAppUrl('http://example.com', parent, 'pharveylg.github.io')).toThrow(/HTTPS/);
    expect(normalizeLiveAppUrl('http://localhost:3001', 'http://localhost:3000', 'localhost')).toBe('http://localhost:3001/');
  });
  it('rejects the ReverseLearn origin and persists only the origin', () => {
    expect(() => normalizeLiveAppUrl('https://pharveylg.github.io/reverselearn/', parent, 'pharveylg.github.io')).toThrow(/ReverseLearn/);
    expect(persistedLiveAppOrigin('https://my-app.vercel.app/private/path?code=secret#token')).toBe('https://my-app.vercel.app');
  });
});
