import { afterEach, describe, expect, it, vi } from 'vitest';
import { sitePath } from '../utility/site-path';

afterEach(() => vi.unstubAllEnvs());

describe('site paths for project Pages deployments', () => {
  it('prefixes native links and public images without changing remote URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/IdleonToolbox');
    expect(sitePath('/data/Coins5.png')).toBe('/IdleonToolbox/data/Coins5.png');
    expect(sitePath('/wiki/monster')).toBe('/IdleonToolbox/wiki/monster');
    expect(sitePath('/IdleonToolbox/wiki')).toBe('/IdleonToolbox/wiki');
    expect(sitePath('https://example.com/icon.png')).toBe('https://example.com/icon.png');
    expect(sitePath('//example.com/icon.png')).toBe('//example.com/icon.png');
    expect(sitePath(undefined)).toBeUndefined();
  });
  it('preserves root deployments', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    expect(sitePath('/data/Coins5.png')).toBe('/data/Coins5.png');
  });
});
