import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ngsw-config', () => {
  it('keeps API data out of durable service worker cache', () => {
    const configPath = resolve(process.cwd(), 'ngsw-config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      dataGroups: Array<{
        name: string;
        urls: string[];
        cacheConfig: { maxSize: number; maxAge: string; strategy: string };
      }>;
    };

    const apiGroup = config.dataGroups.find((group) => group.name === 'api-freshness');
    expect(apiGroup?.urls).toContain('/api/**');
    expect(apiGroup?.cacheConfig.maxSize).toBe(0);
    expect(apiGroup?.cacheConfig.maxAge).toBe('0s');
    expect(apiGroup?.cacheConfig.strategy).toBe('freshness');
  });
});
