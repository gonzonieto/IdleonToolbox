import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

it('prepares repeatable fork metadata without claiming the upstream domain', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'idleon-pages-'));
  const out = join(cwd, 'out');
  try {
    mkdirSync(out);
    writeFileSync(join(out, 'index.html'), '<html></html>');
    writeFileSync(join(out, 'CNAME'), 'idleontoolbox.com');
    writeFileSync(join(out, 'sitemap.xml'), '<loc>https://idleontoolbox.com/tools/progression-advisor</loc>');
    writeFileSync(join(out, 'site.webmanifest'), JSON.stringify({ start_url: '/', icons: [{ src: '/etc/icon-192.png' }] }));
    const script = resolve('utility/prepare-pages.mjs');
    const env = { ...process.env, NEXT_PUBLIC_BASE_PATH: '/IdleonToolbox',
      NEXT_PUBLIC_IT_URL: 'https://gonzonieto.github.io/IdleonToolbox' };
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [script], { cwd, env });
    expect(existsSync(join(out, 'CNAME'))).toBe(false);
    expect(existsSync(join(out, '.nojekyll'))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, 'site.webmanifest'), 'utf8'))).toMatchObject({
      start_url: '/IdleonToolbox/', scope: '/IdleonToolbox/',
      icons: [{ src: '/IdleonToolbox/etc/icon-192.png' }]
    });
    expect(readFileSync(join(out, 'sitemap.xml'), 'utf8')).toContain('https://gonzonieto.github.io/IdleonToolbox/tools/progression-advisor');
    expect(readFileSync(join(out, 'robots.txt'), 'utf8')).toContain('https://gonzonieto.github.io/IdleonToolbox/sitemap.xml');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
