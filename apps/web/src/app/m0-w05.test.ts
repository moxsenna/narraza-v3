import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '..');

function source(relativePath: string): string {
  try {
    return readFileSync(resolve(srcRoot, relativePath), 'utf8');
  } catch {
    return '';
  }
}

describe('M0 W0.5 public shell', () => {
  test('landing exposes exact prototype hero, CTA routes, workflow, and legal links', () => {
    const page = source('app/page.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${page}\n${catalog}`;

    expect(combined).toContain('Untuk penulis serial Indonesia');
    expect(combined).toContain('Tulis serial panjang tanpa kehilangan arah.');
    expect(combined).toContain(
      'Ceritakan idemu ke Narra. Narraza membantu menyusun fondasi, merencanakan bab, menjaga rahasia, dan memoles tulisanmu untuk pembaca mobile.',
    );
    expect(page).toContain('href="/daftar"');
    expect(page).toContain('href="#cara-kerja"');
    expect(page).toContain('id="cara-kerja"');
    expect(page).toContain('href="/privasi"');
    expect(page).toContain('href="/ketentuan"');

    for (const step of ['Ngobrol', 'Fondasi', 'Rencana', 'Tulis', 'Cek', 'Publish']) {
      expect(combined).toContain(step);
    }

    expect(combined).not.toContain('Masuk tanpa kata sandi');
  });

  test('authenticated layout guards once and renders exact disabled navigation', () => {
    const layout = source('app/app/layout.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${layout}\n${catalog}`;

    expect(layout.match(/getCurrentUser\(\)/g)).toHaveLength(1);
    expect(layout).toContain("redirect('/masuk')");
    expect(layout).toContain('action={logoutAction}');
    expect(layout).toContain('aria-disabled="true"');
    expect(layout).not.toMatch(/<a[^>]+aria-disabled="true"/);
    expect(combined).toContain('Kredit — segera hadir');

    const groups = ['PERSIAPAN', 'PERENCANAAN', 'PENULISAN', 'PEMERIKSAAN', 'PUBLIKASI', 'LAINNYA'];
    const items = [
      'Beranda Proyek',
      'Chat Narra',
      'Fondasi Cerita',
      'Karakter',
      'Rencana Bab',
      'Jadwal Rahasia',
      'Fakta',
      'Naskah Bab',
      'Ruang Tulis',
      'Cek Cerita',
      'Tutup Bab',
      'Paket Publish',
      'Kredit & Penggunaan',
      'Pengaturan',
    ];

    for (const label of [...groups, ...items]) expect(combined).toContain(label);
  });

  test('dashboard stays functionally empty until M2', () => {
    const page = source('app/app/page.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${page}\n${catalog}`;

    expect(combined).toContain('Cerita pertamamu belum dimulai');
    expect(combined).toContain('Aku belum punya ide');
    expect(combined).toContain('Aku punya ide kasar');
    expect(combined).toContain('Aku sudah punya draft');
    expect(combined).toContain('Segera hadir');
    expect(page).toContain('disabled');
    expect(page).not.toContain('createProject');
    expect(page).not.toContain('href=');
  });

  test('legal, not-found, and error pages are branded and safe', () => {
    const privacy = source('app/privasi/page.tsx');
    const terms = source('app/ketentuan/page.tsx');
    const notFound = source('app/not-found.tsx');
    const error = source('app/error.tsx');
    const catalog = source('messages/app-id.ts');
    const combined = `${privacy}\n${terms}\n${notFound}\n${error}\n${catalog}`;

    expect(privacy).toContain('APP_MESSAGES_ID.legal.status');
    expect(terms).toContain('APP_MESSAGES_ID.legal.status');
    expect(catalog).toContain('Draf sementara');
    expect(notFound).toContain('<BrandMark');
    expect(combined).toContain('Narraza');
    expect(error).toContain("'use client'");
    expect(error).toContain('reset()');
    expect(error).not.toMatch(/error\.(message|stack|digest)/);
    expect(combined).toContain('Kembali');
  });
});
