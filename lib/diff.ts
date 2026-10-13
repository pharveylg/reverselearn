/** Minimal line diff (LCS) → unified-diff-style text. Pure + tested. */
export function makeDiff(path: string, before: string, after: string): string {
  const a = before.split('\n'), b = after.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push(' ' + a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('-' + a[i]); i++; }
    else { out.push('+' + b[j]); j++; }
  }
  while (i < m) out.push('-' + a[i++]);
  while (j < n) out.push('+' + b[j++]);
  return out.join('\n');
}
export function diffStats(diff: string) {
  const lines = diff.split('\n');
  return { added: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length, removed: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length };
}
