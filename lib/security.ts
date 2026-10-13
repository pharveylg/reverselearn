// Security boundaries for untrusted project imports. Pure + unit-tested.
export const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor', '.turbo', '__MACOSX', '.vercel', 'out'];
export const MAX_FILES = 2000;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB uncompressed text
export const MAX_FILE_BYTES = 512 * 1024;

/** Normalize a zip entry path. Returns null if unsafe (traversal / absolute / drive). */
export function normalizeZipPath(raw: string): string | null {
  if (!raw || raw.endsWith('/')) return null; // directory entry
  const p = raw.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:\//.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((x) => x === '..' || x === '')) return null;
  // strip a single common top-level folder later by caller; here just return clean path
  return parts.join('/');
}

export function isExcluded(path: string): boolean {
  const parts = path.split('/');
  return parts.some((seg) => EXCLUDED_DIRS.includes(seg)) || parts.some((seg) => seg.startsWith('.env'));
}

export function isSensitivePath(path: string): boolean {
  const base = path.split('/').pop()!.toLowerCase();
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.pem') || base.endsWith('.key') ||
    base.includes('secret') || base.includes('credential') || base === 'id_rsa';
}

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'aws-key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'api-key-assignment', re: /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { name: 'bearer-token', re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
];

/** Returns pattern names found. NEVER returns the secret values themselves. */
export function detectSecretKinds(content: string): string[] {
  return SECRET_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.name);
}

/** Replace likely secret values with a placeholder. Used before display / AI context. */
export function redactSecrets(content: string): string {
  let out = content;
  out = out.replace(/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
  out = out.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]');
  out = out.replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*)['"][^'"]+['"]/gi, '$1"[REDACTED]"');
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]{20,}/g, 'Bearer [REDACTED]');
  return out;
}

export function isProbablyBinary(content: string): boolean {
  return content.includes('\u0000');
}
