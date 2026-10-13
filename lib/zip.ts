import ZipLib from 'jszip';
import { InputFile } from './types';
import { MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES, normalizeZipPath, isExcluded, isProbablyBinary } from './security';

export type ZipResult = { files: InputFile[]; excludedCount: number; rejected: string[] };

/** Safely read a ZIP File in the browser. Never executes imported code. */
export async function readZip(file: File): Promise<ZipResult> {
  if (file.size > 30 * 1024 * 1024) throw new Error('ZIP is larger than 30 MB. Split the project or exclude build folders first.');
  const zip = await ZipLib.loadAsync(file);
  const entries = Object.values(zip.files).filter((e: any) => !e.dir);
  if (entries.length > MAX_FILES * 2) throw new Error('Too many files in archive.');
  const files: InputFile[] = []; const rejected: string[] = []; let excludedCount = 0; let total = 0;
  // detect single top-level folder to strip it
  for (const entry of entries as any[]) {
    const clean = normalizeZipPath(entry.name);
    if (!clean) { rejected.push(entry.name); continue; }
    if (isExcluded(clean)) { excludedCount++; continue; }
    if (files.length >= MAX_FILES) { rejected.push(clean + ' (file limit)'); continue; }
    let text: string;
    try { text = await entry.async('string'); } catch { rejected.push(clean); continue; }
    if (isProbablyBinary(text)) { excludedCount++; continue; }
    if (text.length > MAX_FILE_BYTES) { rejected.push(clean + ' (file too large, skipped)'); continue; }
    total += text.length; if (total > MAX_TOTAL_BYTES) throw new Error('Uncompressed text exceeds 25 MB safety limit.');
    files.push({ path: stripCommonRoot(clean, entries.map((e: any) => e.name)), content: text });
  }
  // fix paths after root-strip decision
  return { files: normalizeRoots(files), excludedCount, rejected };
}
function stripCommonRoot(p: string, _all: string[]) { return p; }
function normalizeRoots(files: InputFile[]): InputFile[] {
  if (!files.length) return files;
  const first = files[0].path.split('/')[0];
  const allShare = files.every((f) => f.path.startsWith(first + '/')) && !files.some((f) => f.path === 'package.json' || f.path.endsWith('/package.json') && f.path.split('/').length === 2 && files.some((x) => x.path.split('/').length === 1));
  const hasRootManifest = files.some((f) => f.path === first + '/package.json');
  const hasBareManifest = files.some((f) => f.path === 'package.json');
  if (allShare && hasRootManifest && !hasBareManifest) return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
  return files;
}
