import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

/** Give each browser registration a distinct reverse-proxy client key.
 * Production rate limits remain unchanged; only Playwright request headers differ. */
export async function isolateE2eClientIp(page: Page): Promise<void> {
  const hex = randomUUID().replaceAll('-', '');
  const groups = hex.match(/.{1,4}/g);
  if (!groups || groups.length !== 8) throw new Error('failed to create E2E client IP');
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `2001:db8:${groups.slice(0, 6).join(':')}` });
}
