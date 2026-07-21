import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanClientBundle } from '../../scripts/scan-client-bundle.mjs';

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'narraza-client-scan-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('scanClientBundle', () => {
  it('fails when bundle directory is missing', async () => {
    const root = await fixture();
    await expect(scanClientBundle(path.join(root, 'missing'))).rejects.toThrow(
      /bundle directory is missing/,
    );
  });

  it('fails when no scannable client files exist', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'asset.css'), 'OPENROUTER_API_KEY');
    await expect(scanClientBundle(root)).rejects.toThrow(/no client bundle files/);
  });

  it.each([
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
    'AI_ENABLE_MOCK',
    'service_restricted',
    'CanonicalChangeOperation',
    'google/gemini-2.5-pro',
    'claude-3-7-sonnet',
  ])('rejects forbidden client content: %s', async (forbidden) => {
    const root = await fixture();
    const nested = path.join(root, 'chunks');
    await mkdir(nested);
    await writeFile(path.join(nested, 'app.js'), `window.__value=${JSON.stringify(forbidden)}`);

    await expect(scanClientBundle(root)).rejects.toThrow(/Forbidden client bundle content/);
  });

  it('scans js, mjs, json, and map files recursively', async () => {
    const root = await fixture();
    const nested = path.join(root, 'chunks', 'deep');
    await mkdir(nested, { recursive: true });
    await Promise.all([
      writeFile(path.join(root, 'app.js'), 'console.log("public")'),
      writeFile(path.join(nested, 'module.mjs'), 'export const value="safe"'),
      writeFile(path.join(nested, 'manifest.json'), '{"route":"/app"}'),
      writeFile(path.join(nested, 'module.js.map'), '{"version":3,"sources":[]}'),
    ]);

    await expect(scanClientBundle(root)).resolves.toEqual({ filesScanned: 4 });
  });
});
