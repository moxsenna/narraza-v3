import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('mobile landing keeps essential navigation reachable without JavaScript', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  const fallback = page.getByRole('navigation', {
    name: 'Navigasi utama mobile tanpa JavaScript',
  });
  await expect(fallback).toBeVisible();

  for (const [label, href] of [
    ['Cara kerja', '#cara-kerja'],
    ['Fitur', '#fitur'],
    ['Untuk siapa', '#untuk-siapa'],
    ['Kredit', '#kredit'],
    ['Masuk', '/masuk'],
    ['Mulai gratis', '/daftar'],
  ] as const) {
    await expect(fallback.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'href',
      href,
    );
  }

  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
});
