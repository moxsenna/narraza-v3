import { notFound } from 'next/navigation';
import { MobileLayout } from '../../../components/mobile/MobileLayout';

export const dynamic = 'force-dynamic';

export default function MobilePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="mx-auto max-w-[430px] border-x border-default shadow-2xl">
      <MobileLayout
        projectId="demo-project"
        projectTitle="Serpihan Janji"
        authorInitials="DN"
        availableCredits={240}
        stickyAction={{
          label: '✍ Lanjutkan Tulis Bab 3',
          href: '#',
          secondaryLabel: '✦ 3 Opsi Adegan',
        }}
      >
        <div className="space-y-4 p-4">
          {/* Active Chapter Hero */}
          <div className="rounded-2xl bg-brand-600 p-5 text-white shadow-md">
            <div className="flex items-center justify-between text-[11px] text-brand-200 font-bold">
              <span>LANGKAH BERIKUTNYA</span>
              <span className="rounded-full bg-brand-700 px-2 py-0.5 text-white">Bab 3 Aktif</span>
            </div>
            <h2 className="mt-2 font-heading text-lg font-bold">Kotak di Gudang (Adegan 2)</h2>
            <p className="mt-1 text-xs text-brand-50">
              Target hari ini: 1.200 kata • Alur konsisten 100%
            </p>
            <div className="mt-4 flex items-center justify-between text-[11px] text-brand-200">
              <span>840 / 1.200 kata</span>
              <span>70% selesai</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
              <div className="h-full rounded-full bg-white" style={{ width: '70%' }} />
            </div>
          </div>

          {/* Kesiapan Fondasi Cerita */}
          <div className="rounded-xl border border-default bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-bold text-primary">
                Kesiapan Fondasi Cerita (D5)
              </h3>
              <span className="rounded-full bg-status-success-soft px-2 py-0.5 text-[10px] font-bold text-status-success">
                100% Siap
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Semua 7 indikator deterministik terpenuhi.
            </p>
          </div>

          {/* Metrik Produksi Ringkas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-default bg-white p-3 shadow-xs">
              <p className="text-[10px] font-bold text-muted uppercase">KATA PEKAN INI</p>
              <p className="mt-0.5 font-heading text-lg font-bold text-primary">4.820</p>
              <p className="text-[10px] font-semibold text-status-success">+18%</p>
            </div>
            <div className="rounded-xl border border-default bg-white p-3 shadow-xs">
              <p className="text-[10px] font-bold text-muted uppercase">KOHERENSI</p>
              <p className="mt-0.5 font-heading text-lg font-bold text-primary">100%</p>
              <p className="text-[10px] font-semibold text-status-success">0 plot hole</p>
            </div>
          </div>

          {/* Quick Chapters */}
          <div className="rounded-xl border border-default bg-white p-4 shadow-xs space-y-2">
            <h3 className="font-heading text-xs font-bold text-primary">Rencana Bab</h3>
            {[
              { num: 1, title: 'Pulang ke Rumah', words: 1420, done: true },
              { num: 2, title: 'Makan Malam Dingin', words: 1680, done: true },
              { num: 3, title: 'Kotak di Gudang', words: 840, active: true },
              { num: 4, title: 'Surat Rahasia', words: 0, pending: true },
            ].map((ch) => (
              <div
                key={ch.num}
                className={`flex items-center justify-between rounded-lg p-2.5 text-xs ${
                  ch.active
                    ? 'border border-active bg-brand-soft text-brand-600 font-bold'
                    : 'bg-canvas text-secondary'
                }`}
              >
                <span>
                  {ch.num}. {ch.title}
                </span>
                <span className="text-[10px] font-normal text-muted">
                  {ch.done ? '✓ Selesai' : ch.active ? '✎ Ditulis' : '○ Rencana'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </MobileLayout>
    </div>
  );
}
