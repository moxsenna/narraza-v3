import { notFound } from 'next/navigation';
import { MobileLayout } from '../../../components/mobile/MobileLayout';

export const dynamic = 'force-dynamic';

export default function MobilePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="mx-auto max-w-[430px] border-x border-[#E2E8F0] shadow-2xl">
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
          <div className="rounded-2xl bg-[#881337] p-5 text-white shadow-md">
            <div className="flex items-center justify-between text-[11px] text-[#FECDD3] font-bold">
              <span>LANGKAH BERIKUTNYA</span>
              <span className="rounded-full bg-[#BE123C] px-2 py-0.5 text-white">Bab 3 Aktif</span>
            </div>
            <h2 className="mt-2 font-heading text-lg font-bold">Kotak di Gudang (Adegan 2)</h2>
            <p className="mt-1 text-xs text-[#FFE4E6]">
              Target hari ini: 1.200 kata • Alur konsisten 100%
            </p>
            <div className="mt-4 flex items-center justify-between text-[11px] text-[#FECDD3]">
              <span>840 / 1.200 kata</span>
              <span>70% selesai</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
              <div className="h-full rounded-full bg-white" style={{ width: '70%' }} />
            </div>
          </div>

          {/* Kesiapan Fondasi Cerita */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-bold text-[#0F172A]">
                Kesiapan Fondasi Cerita (D5)
              </h3>
              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#047857]">
                100% Siap
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Semua 7 indikator deterministik terpenuhi.
            </p>
          </div>

          {/* Metrik Produksi Ringkas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xs">
              <p className="text-[10px] font-bold text-[#64748B] uppercase">KATA PEKAN INI</p>
              <p className="mt-0.5 font-heading text-lg font-bold text-[#0F172A]">4.820</p>
              <p className="text-[10px] font-semibold text-[#059669]">+18%</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xs">
              <p className="text-[10px] font-bold text-[#64748B] uppercase">KOHERENSI</p>
              <p className="mt-0.5 font-heading text-lg font-bold text-[#0F172A]">100%</p>
              <p className="text-[10px] font-semibold text-[#059669]">0 plot hole</p>
            </div>
          </div>

          {/* Quick Chapters */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-2">
            <h3 className="font-heading text-xs font-bold text-[#0F172A]">Rencana Bab</h3>
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
                    ? 'border border-[#FDA4AF] bg-[#FFF1F2] text-[#881337] font-bold'
                    : 'bg-[#F8F9FA] text-[#334155]'
                }`}
              >
                <span>
                  {ch.num}. {ch.title}
                </span>
                <span className="text-[10px] font-normal text-[#64748B]">
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
