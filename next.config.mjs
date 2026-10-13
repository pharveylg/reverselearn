/** @type {import('next').NextConfig} */
// On GitHub Pages the site lives under /reverselearn (project page), so we
// export a fully static build with that base path. Locally and on Vercel
// the app is served from the root, with no export needed.
const isPages = process.env.GITHUB_PAGES === 'true';
const nextConfig = {
  reactStrictMode: true,
  ...(isPages
    ? { output: 'export', basePath: '/reverselearn', assetPrefix: '/reverselearn/' }
    : {}),
};
export default nextConfig;
