// Transform the deployment output, retaining upstream public files in the checkout.
import fs from 'node:fs';
import path from 'node:path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const siteUrl = process.env.NEXT_PUBLIC_IT_URL;
if (!siteUrl) throw new Error('NEXT_PUBLIC_IT_URL is required to prepare Pages output');
const out = path.resolve('out');
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('Build the static export first');
// A fork must not claim the upstream project's domain.
fs.rmSync(path.join(out, 'CNAME'), { force: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const manifestPath = path.join(out, 'site.webmanifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.start_url = `${basePath}/`;
manifest.scope = `${basePath}/`;
manifest.icons = manifest.icons.map((icon) => ({ ...icon,
  src: basePath && icon.src.startsWith('/') && !icon.src.startsWith('//')
    && !icon.src.startsWith(`${basePath}/`) ? `${basePath}${icon.src}` : icon.src }));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);
const sitemapPath = path.join(out, 'sitemap.xml');
fs.writeFileSync(sitemapPath, fs.readFileSync(sitemapPath, 'utf8')
  .replaceAll('https://idleontoolbox.com', siteUrl.replace(/\/$/, '')));
console.log(`Prepared Pages output for ${siteUrl}`);
