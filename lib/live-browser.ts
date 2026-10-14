/** URL policy for the optional live-app iframe. It never fetches page content. */
export function normalizeLiveAppUrl(raw: string, parentOrigin: string, parentHost: string): string {
  const value = raw.trim();
  if (!value) throw new Error('Paste your deployed app URL first.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Only http:// or https:// app URLs are allowed.');
  }
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error('That does not look like a valid app URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http:// or https:// app URLs are allowed.');
  if (url.username || url.password) throw new Error('Do not put a username or password in the URL. Sign in on the app itself.');
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host.toLowerCase());
  if (url.protocol === 'http:' && !(loopback(url.hostname) && loopback(parentHost))) {
    throw new Error('Use HTTPS for deployed apps. Plain HTTP is allowed only for local development on localhost.');
  }
  if (url.origin === parentOrigin) throw new Error('Use your deployed app’s URL, not ReverseLearn’s own address.');
  return url.toString();
}

/** Persist only the app origin; don't store route query/hash values that may contain one-time secrets. */
export function persistedLiveAppOrigin(raw: string): string {
  return new URL(raw).origin;
}
