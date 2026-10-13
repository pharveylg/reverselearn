import { describe, it, expect } from 'vitest';
import { normalizeZipPath, isExcluded, detectSecretKinds, redactSecrets, isSensitivePath } from '../lib/security';

describe('archive path safety', () => {
  it('rejects traversal and absolute paths', () => {
    expect(normalizeZipPath('../evil.ts')).toBeNull();
    expect(normalizeZipPath('app/../../evil.ts')).toBeNull();
    expect(normalizeZipPath('/etc/passwd')).toBeNull();
    expect(normalizeZipPath('app/page.tsx')).toBe('app/page.tsx');
  });
  it('excludes dependency/build dirs by default', () => {
    expect(isExcluded('node_modules/react/index.js')).toBe(true);
    expect(isExcluded('.next/server/page.js')).toBe(true);
    expect(isExcluded('app/page.tsx')).toBe(false);
  });
});
describe('secret handling', () => {
  it('detects kinds without returning values', () => {
    const kinds = detectSecretKinds('const api_key = "supersecretvalue123"');
    expect(kinds.length).toBeGreaterThan(0);
    expect(JSON.stringify(kinds)).not.toContain('supersecretvalue123');
  });
  it('redacts values from displayed source', () => {
    const out = redactSecrets('token = "supersecretvalue123" and AKIA1234567890ABCDEF');
    expect(out).not.toContain('supersecretvalue123');
    expect(out).not.toContain('AKIA1234567890ABCDEF');
    expect(out).toContain('[REDACTED]');
  });
  it('flags .env paths as sensitive', () => { expect(isSensitivePath('app/.env.local')).toBe(true); });
});
