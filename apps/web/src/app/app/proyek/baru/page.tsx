'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { GlobalAppShell } from '../../../../components/composites/GlobalAppShell';
import { Badge, Button, Card, Input } from '../../../../components/primitives';
import { createProjectAction, type ActionState } from '../../../../server/domain/actions';

type ProjectPath = Readonly<{
  value: 'no_idea' | 'rough_idea' | 'has_draft' | 'has_outline' | 'fix_story';
  title: string;
  description: string;
  expectedResult: string;
  disabled?: boolean;
}>;

const JALUR: readonly ProjectPath[] = [
  {
    value: 'no_idea',
    title: 'Aku belum punya ide',
    description: 'Ngobrol santai dengan Narra lewat pertanyaan ringan tentang tokoh dan konflik.',
    expectedResult: 'Ide yang lebih berbentuk sebagai awal menyusun fondasi cerita.',
  },
  {
    value: 'rough_idea',
    title: 'Aku punya ide kasar',
    description: 'Mulai dari premis singkat, rasa cerita, atau konflik yang sudah terbayang.',
    expectedResult: 'Arah konsep, tokoh, konflik, dan janji cerita yang lebih jelas.',
  },
  {
    value: 'has_draft',
    title: 'Aku sudah punya draft',
    description: 'Bawa tulisan dari platform lain untuk dirapikan dan dilanjutkan.',
    expectedResult: 'Impor draft belum tersedia pada rilis ini.',
    disabled: true,
  },
  {
    value: 'has_outline',
    title: 'Aku sudah punya outline',
    description: 'Mulai dari rencana bab yang sudah kamu siapkan.',
    expectedResult: 'Rencana bab terstruktur yang bisa dikembangkan per adegan.',
  },
  {
    value: 'fix_story',
    title: 'Aku ingin memperbaiki cerita',
    description: 'Mulai proyek untuk menata ulang arah cerita secara bertahap.',
    expectedResult: 'Fondasi kerja untuk mencatat masalah dan menentukan perbaikan berikutnya.',
  },
] as const satisfies readonly ProjectPath[];

const initial: ActionState = { ok: false };

export default function NewProjectPage() {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  const [selectedPath, setSelectedPath] = useState<ProjectPath['value'] | null>(null);
  const [step, setStep] = useState<'path' | 'details'>('path');
  const selectedPathDetails = JALUR.find((path) => path.value === selectedPath);

  return (
    <GlobalAppShell>
      <main className="mx-auto w-full max-w-[var(--container-product)] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-muted hover:text-brand-strong"
        >
          ← Dashboard
        </Link>
        <header className="mt-2 max-w-2xl">
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">PROYEK BARU</p>
          <h1 className="mt-2 text-3xl font-bold text-primary sm:text-4xl">Mulai cerita baru</h1>
          <p className="mt-3 text-base leading-7 text-secondary">
            {step === 'path'
              ? 'Pilih titik awal lebih dulu. Tidak ada proyek yang dibuat sampai kamu meninjau pilihan dan menekan Buat proyek.'
              : 'Tinjau jalur pilihanmu, lalu beri judul sementara bila perlu sebelum membuat proyek.'}
          </p>
        </header>

        {step === 'path' ? (
          <section aria-labelledby="path-heading" className="mt-8">
            <h2 id="path-heading" className="text-base font-bold text-primary">
              Kamu mau mulai dari mana?
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {JALUR.map((path) => (
                <label
                  key={path.value}
                  className={`relative flex min-h-44 rounded-lg border bg-surface p-5 transition-colors ${
                    path.disabled
                      ? 'cursor-not-allowed border-default opacity-70'
                      : 'cursor-pointer border-default hover:border-active has-checked:border-action-primary has-checked:bg-brand-soft'
                  }`}
                >
                  <input
                    className="mt-1 size-4 shrink-0 accent-action-primary"
                    type="radio"
                    name="path-selection"
                    value={path.value}
                    checked={selectedPath === path.value}
                    onChange={() => setSelectedPath(path.value)}
                    disabled={path.disabled}
                  />
                  <span className="ml-3 min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-bold text-primary">
                      {path.title}
                      {path.disabled ? <Badge tone="neutral">Segera hadir</Badge> : null}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-secondary">
                      {path.description}
                    </span>
                    <span className="mt-3 block text-xs font-bold tracking-wide text-brand-strong">
                      HASIL YANG DIHARAPKAN
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted">
                      {path.expectedResult}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="button" disabled={!selectedPath} onClick={() => setStep('details')}>
                Lanjutkan
              </Button>
            </div>
          </section>
        ) : (
          <form action={action} className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card className="p-5 sm:p-6">
              <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">
                JALUR PILIHAN
              </p>
              <h2 className="mt-2 text-xl font-bold text-primary">{selectedPathDetails?.title}</h2>
              <p className="mt-2 leading-7 text-secondary">{selectedPathDetails?.description}</p>
              <p className="mt-5 text-sm font-bold text-primary">Hasil yang diharapkan</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {selectedPathDetails?.expectedResult}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-6"
                onClick={() => setStep('path')}
              >
                Ubah pilihan
              </Button>
            </Card>

            <Card className="h-fit p-5 lg:sticky lg:top-24">
              <input type="hidden" name="jalur" value={selectedPath ?? ''} />
              <label htmlFor="project-title" className="text-sm font-bold text-primary">
                Judul sementara <span className="font-normal text-muted">(opsional)</span>
              </label>
              <Input
                id="project-title"
                name="title"
                type="text"
                className="mt-2"
                placeholder="Contoh: Serpihan Janji"
              />
              <p className="mt-2 text-sm leading-6 text-muted">
                Belum punya judul? Biarkan kosong. Kamu bisa mengubahnya nanti.
              </p>

              {state.message ? (
                <p
                  className="mt-4 rounded-md bg-status-danger-soft px-3 py-2 text-sm text-status-danger"
                  role="alert"
                >
                  {state.message}
                </p>
              ) : null}

              <Button type="submit" disabled={pending || !selectedPath} className="mt-5 w-full">
                {pending ? 'Membuat…' : 'Buat proyek'}
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-muted">
                Proyek baru dibuat setelah tombol ini ditekan. Narra tidak menjalankan proses AI
                dari langkah ini.
              </p>
            </Card>
          </form>
        )}
      </main>
    </GlobalAppShell>
  );
}
