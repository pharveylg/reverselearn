// Import a project by pasting a GitHub repository link.
// Public repos need no token. Private repos accept an optional fine-grained
// read-only token which is used only for that request, in memory, and is
// never stored, logged, or included in the saved project.
import { InputFile } from './types';
import { EXCLUDED_DIRS, MAX_FILES, MAX_FILE_BYTES, isExcluded } from './security';

export type ParsedGitHub = { owner: string; repo: string; branch?: string; subpath?: string };
const NAME = /^[A-Za-z0-9_.-]+$/;

/** Accepts: https://github.com/owner/repo, .../tree/branch/sub/path, owner/repo, git@github.com:owner/repo.git */
export function parseGitHubUrl(raw: string): ParsedGitHub | null {
  if (!raw) return null;
  let s = raw.trim();
  const ssh = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  let parts: string[] | null = null;
  if (ssh) parts = [ssh[1], ssh[2]];
  else {
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (s.startsWith('github.com/')) parts = s.slice('github.com/'.length).split('/');
    else if (/^[^/\s]+\/[^/\s]+/.test(s) && !s.includes('.')) parts = s.split('/'); // owner/repo shorthand
    else return null;
  }
  if (!parts || parts.length < 2) return null;
  const owner = parts[0]; const repo = (parts[1] || '').replace(/\.git$/, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  let branch: string | undefined; let subpath: string | undefined;
  if (parts[2] === 'tree' && parts[3]) { branch = parts[3]; subpath = parts.slice(4).join('/') || undefined; }
  return { owner, repo, branch, subpath };
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token?.trim()) h.Authorization = `Bearer ${token.trim()}`;
  return h;
}
async function ghError(res: Response, repo: string): Promise<Error> {
  if (res.status === 404) return new Error(`Repository "${repo}" was not found — check the link, or if it is private, paste a read-only token below.`);
  if (res.status === 403 || res.status === 429) return new Error('GitHub rate limit reached (60 requests/hour without a token). Wait a while, or paste a token to raise the limit.');
  if (res.status === 401) return new Error('GitHub rejected that token. Use a fine-grained token with read-only access to this repository.');
  return new Error(`GitHub returned HTTP ${res.status}. Try again, or download a ZIP from the repo instead.`);
}

export async function fetchDefaultBranch(p: ParsedGitHub, token?: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}`, { headers: headers(token) });
  if (!res.ok) throw await ghError(res, `${p.owner}/${p.repo}`);
  const j = await res.json(); return j.default_branch || 'main';
}

/** Download the repo as a ZIP via the GitHub API (reuses the same safe ZIP reader as file uploads). */
export async function fetchRepoZipBlob(p: ParsedGitHub, branch: string, token?: string): Promise<Blob> {
  const res = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/zipball/${encodeURIComponent(branch)}`, { headers: headers(token), redirect: 'follow' });
  if (!res.ok) throw await ghError(res, `${p.owner}/${p.repo}`);
  return res.blob();
}

const TEXT_EXT = /\.(ts|tsx|js|jsx|json|md|css|html|txt|yml|yaml|toml|sql|prisma|py|rb|go|rs|java|php|sh|xml|svg|env\.example|gitignore)$/i;
/** Fallback if the ZIP download is blocked: walk the git tree and fetch files one by one (capped). */
export async function fetchRepoFilesViaTree(p: ParsedGitHub, branch: string, token?: string, onProgress?: (n: number) => void): Promise<{ files: InputFile[]; excludedCount: number }> {
  const res = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: headers(token) });
  if (!res.ok) throw await ghError(res, `${p.owner}/${p.repo}`);
  const j = await res.json();
  const blobs = (j.tree || []).filter((t: { type: string; path: string; size?: number }) => t.type === 'blob');
  const files: InputFile[] = []; let excluded = 0;
  for (const b of blobs) {
    let path = b.path as string;
    if (p.subpath) { if (!path.startsWith(p.subpath + '/')) { excluded++; continue; } path = path.slice(p.subpath.length + 1); }
    if (isExcluded(path) || (b.size || 0) > MAX_FILE_BYTES || !TEXT_EXT.test(path)) { excluded++; continue; }
    if (files.length >= Math.min(MAX_FILES, 300)) break;
    const r = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/contents/${encodeURIComponent(b.path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, { headers: { ...headers(token), Accept: 'application/vnd.github.raw+json' } });
    if (!r.ok) continue;
    files.push({ path, content: await r.text() }); onProgress?.(files.length);
  }
  return { files, excludedCount: excluded };
}
export { EXCLUDED_DIRS };
