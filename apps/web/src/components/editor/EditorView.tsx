'use client';

import { useState } from 'react';

export interface EditorChapter {
  id: string;
  ordinal: number;
  title: string;
  wordCount: number;
  status: 'completed' | 'active' | 'planned';
  scenes?: {
    id: string;
    ordinal: number;
    title: string;
    status: 'completed' | 'active' | 'pending';
  }[];
}

export interface EditorBranchProposal {
  id: 'A' | 'B' | 'C';
  title: string;
  badge: string;
  isRecommended?: boolean;
  pitch: string;
}

export interface EditorViewProps {
  projectTitle?: string;
  chapterTitle?: string;
  chapterOrdinal?: number;
  initialProse?: string;
  readOnly?: boolean;
  onApplyBranch?: (branchId: 'A' | 'B' | 'C') => void;
  onSave?: (content: string) => void;
}

const DEFAULT_CHAPTERS: EditorChapter[] = [
  {
    id: 'ch-1',
    ordinal: 1,
    title: 'Pulang ke Rumah',
    wordCount: 1420,
    status: 'completed',
  },
  {
    id: 'ch-2',
    ordinal: 2,
    title: 'Makan Malam Dingin',
    wordCount: 1680,
    status: 'completed',
  },
  {
    id: 'ch-3',
    ordinal: 3,
    title: 'Kotak di Gudang',
    wordCount: 840,
    status: 'active',
    scenes: [
      { id: 'sc-1', ordinal: 1, title: 'Mencari kunci laci', status: 'completed' },
      { id: 'sc-2', ordinal: 2, title: 'Konfrontasi Bu Ratna', status: 'active' },
      { id: 'sc-3', ordinal: 3, title: 'Panggilan Dewi', status: 'pending' },
    ],
  },
  {
    id: 'ch-4',
    ordinal: 4,
    title: 'Surat Rahasia',
    wordCount: 0,
    status: 'planned',
  },
  {
    id: 'ch-5',
    ordinal: 5,
    title: 'Pertemuan di Dermaga',
    wordCount: 0,
    status: 'planned',
  },
];

const DEFAULT_BRANCHES: EditorBranchProposal[] = [
  {
    id: 'A',
    title: 'Opsi A: Ketegangan Psikologis',
    badge: 'Sesuai Visi ★',
    isRecommended: true,
    pitch:
      'Maya pura-pura santai dan menawarkan teh hangat, menutupi celah peti dengan badannya seraya membaca reaksi Bu Ratna yang menatap tajam.',
  },
  {
    id: 'B',
    title: 'Opsi B: Konfrontasi Dingin',
    badge: 'Tensi Tinggi',
    isRecommended: false,
    pitch:
      'Bu Ratna melangkah masuk gudang, menunjuk kain selimut: “Maya, ini bukan barang peninggalan Raka. Punya siapa sebenarnya peti itu?”',
  },
  {
    id: 'C',
    title: 'Opsi C: Kejutan Tak Terduga',
    badge: 'Plot Twist',
    isRecommended: false,
    pitch:
      'Ponsel di saku Maya bergetar keras memecah keheningan gudang. Layar menampilkan nomor tak dikenal dengan pesan: “Jangan buka peti itu sekarang.”',
  },
];

const DEFAULT_PROSE = `Debu tipis melayang di udara lembap saat Maya menarik peti kayu usang dari sudut rak paling bawah. Jemarinya gemetar saat menyentuh permukaan gembok kuningan yang sudah berkarat. Di dalam rumah besar ini, hanya gudang belakang yang luput dari renovasi serba putih keluarga Wardhana.

Langkah kaki terdengar dari lorong semen di luar. Maya membeku, menahan napas seraya merapatkan lututnya ke lantai dingin.

“Maya? Kamu di dalam?”

Suara Bu Ratna terdengar datar, tanpa nada ramah seperti biasa. Suara seorang nyonya rumah yang menyadari ada pintu tertutup di wilayah kekuasaannya. Maya menarik napas perlahan, memasukkan kunci kecil ke dalam saku roknya, lalu berbalik sambil tersenyum tenang.`;

export function EditorView({
  projectTitle = 'Serpihan Janji',
  chapterTitle = 'Kotak di Gudang',
  chapterOrdinal = 3,
  initialProse = DEFAULT_PROSE,
  readOnly = false,
  onApplyBranch,
  onSave,
}: EditorViewProps) {
  const [prose, setProse] = useState(initialProse);
  const [activeCandidate, setActiveCandidate] = useState<'A' | 'B'>('A');
  const [rightTab, setRightTab] = useState<'branches' | 'continuity' | 'characters'>('branches');
  const [selectedBranch, setSelectedBranch] = useState<'A' | 'B' | 'C'>('A');
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  const wordCount = prose.trim() ? prose.trim().split(/\s+/).length : 0;
  const targetWords = 1200;
  const progressPercent = Math.min(100, Math.round((wordCount / targetWords) * 100));

  const handleApplyBranch = (branchId: 'A' | 'B' | 'C') => {
    setSelectedBranch(branchId);
    const branch = DEFAULT_BRANCHES.find((b) => b.id === branchId);
    if (branch) {
      const continuationText = `\n\n${branch.pitch}`;
      setProse((prev) => prev + continuationText);
      setAppliedNotification(`Cabang ${branchId} berhasil diterapkan ke naskah!`);
      setTimeout(() => setAppliedNotification(null), 3500);
      onApplyBranch?.(branchId);
      onSave?.(prose + continuationText);
    }
  };

  const handleInlineChip = (text: string) => {
    setProse((prev) => `${prev} ${text}`);
    setAppliedNotification(`Ditambahkan: "${text}"`);
    setTimeout(() => setAppliedNotification(null), 3000);
  };

  return (
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden bg-[#F8F9FA] text-[#0F172A]">
      {/* Workspace Body - 3 Columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* KOLOM KIRI: Navigator Bab & Adegan */}
        <aside
          aria-label="Navigator Bab dan Adegan"
          className="hidden w-[280px] shrink-0 flex-col gap-4 border-r border-[#E2E8F0] bg-white p-4 lg:flex overflow-y-auto"
        >
          {/* Arc Header Box */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8F9FA] p-3">
            <div className="text-[10px] font-bold text-[#881337] uppercase tracking-wider">
              {projectTitle}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-heading text-xs font-bold text-[#0F172A]">
                Arc 1: Rahasia Keluarga
              </span>
              <span className="font-body text-[10px] font-semibold text-[#64748B]">Bab 1–15</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
              <div className="h-full rounded-full bg-[#881337]" style={{ width: '20%' }} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#64748B]">
              3 dari 15 bab selesai • Target Arc: 25.000 kata
            </p>
          </div>

          {/* Chapter List */}
          <div className="flex-1 space-y-1.5">
            <div className="px-1 text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              DAFTAR BAB
            </div>
            {DEFAULT_CHAPTERS.map((ch) => {
              const isActive = ch.ordinal === chapterOrdinal;

              return (
                <div key={ch.id} className="space-y-1">
                  <div
                    className={`flex items-center justify-between rounded-lg p-2.5 text-xs transition-colors ${
                      isActive
                        ? 'border border-[#FDA4AF] bg-[#FFF1F2] text-[#881337]'
                        : 'border border-transparent bg-white hover:bg-[#F8F9FA] text-[#334155]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-[11px]">
                        {ch.status === 'completed' ? (
                          <span className="text-[#059669]">✓</span>
                        ) : isActive ? (
                          <span className="text-[#881337]">✎</span>
                        ) : (
                          <span className="text-[#94A3B8]">○</span>
                        )}
                      </span>
                      <span className="truncate font-semibold">
                        {String(ch.ordinal).padStart(2, '0')}. {ch.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-[#64748B]">
                      {ch.status === 'completed'
                        ? `${ch.wordCount} kata`
                        : isActive
                          ? 'Ditulis'
                          : 'Rencana'}
                    </span>
                  </div>

                  {/* Sub-scenes under active chapter */}
                  {isActive && ch.scenes && (
                    <div className="ml-4 space-y-1 border-l-2 border-[#FDA4AF] pl-2">
                      {ch.scenes.map((sc) => (
                        <div
                          key={sc.id}
                          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] ${
                            sc.status === 'active'
                              ? 'bg-[#FFE4E6] font-bold text-[#881337]'
                              : 'text-[#64748B] hover:bg-[#F1F5F9]'
                          }`}
                        >
                          <span className="truncate">
                            Adg {sc.ordinal}: {sc.title}
                          </span>
                          <span className="text-[9px]">
                            {sc.status === 'completed'
                              ? '● Selesai'
                              : sc.status === 'active'
                                ? '▶ Aktif'
                                : '○ Draft'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-[#CBD5E1] p-2 text-center text-xs font-bold text-[#881337] hover:border-[#881337] hover:bg-[#FFF5F8]"
          >
            + Tambah Bab Baru
          </button>
        </aside>

        {/* KOLOM TENGAH: Canvas Naskah Tanpa Distraksi */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#FCFDFD]">
          {/* Canvas Sub-Header Bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#881337]">
                Bab {chapterOrdinal} &gt; Adegan 2 dari 3 (Konfrontasi di Gudang)
              </span>
              <span className="text-[#CBD5E1]">•</span>
              <span className="hidden items-center gap-1.5 text-xs text-[#059669] sm:flex">
                <span className="size-2 rounded-full bg-[#059669]" />
                Tersimpan otomatis
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Candidate Switcher Pills */}
              <div className="flex items-center rounded-lg bg-[#F1F5F9] p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveCandidate('A')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    activeCandidate === 'A'
                      ? 'border border-[#E2E8F0] bg-white text-[#881337] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  Kandidat A (Ketegangan)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCandidate('B')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    activeCandidate === 'B'
                      ? 'border border-[#E2E8F0] bg-white text-[#881337] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  Kandidat B (Drama Batin)
                </button>
              </div>

              <div className="text-xs text-[#64748B]">
                <span className="font-bold text-[#0F172A]">{wordCount}</span> / {targetWords} kata (
                {progressPercent}%)
              </div>
            </div>
          </div>

          {/* Manuscript Canvas Container */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-12 md:px-16 lg:px-20">
            <div className="mx-auto max-w-[780px] space-y-6">
              {/* Notification toast */}
              {appliedNotification && (
                <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3 text-xs font-semibold text-[#047857] shadow-sm transition-all">
                  ✓ {appliedNotification}
                </div>
              )}

              {/* Scene Goal Cue Banner */}
              <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <span className="text-base" aria-hidden="true">
                  🎯
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#334155]">
                    Arah Emosi: Tertekan → Panik Terkendali
                  </span>
                  <span className="text-[#94A3B8]">•</span>
                  <span className="font-semibold text-[#881337]">
                    Ending Hook: Panggilan telepon Dewi setelah 7 tahun hening
                  </span>
                </div>
              </div>

              {/* Chapter Title & Subtitle */}
              <div>
                <h1 className="font-editor text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                  Bab {chapterOrdinal} — {chapterTitle}
                </h1>
                <p className="mt-1 font-body text-xs font-medium text-[#64748B]">
                  Adegan 2: Peti kayu tua di sudut rak dan kecurigaan Bu Ratna
                </p>
              </div>

              {/* Distraction-Free Prose Area (Newsreader serif, line-height 1.85) */}
              <div className="relative">
                <textarea
                  value={prose}
                  onChange={(e) => {
                    setProse(e.target.value);
                    onSave?.(e.target.value);
                  }}
                  disabled={readOnly}
                  rows={14}
                  placeholder="Ketik naskah adegan di sini..."
                  className="font-editor w-full resize-none border-none bg-transparent p-0 text-base leading-[1.85] text-[#1E293B] focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:text-[17px]"
                />
              </div>

              {/* Inline AI Action Pills */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] p-2.5">
                <div className="flex items-center gap-1.5 font-body text-xs font-bold text-[#881337]">
                  <span>✨</span>
                  <span>Lanjutkan Adegan:</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleInlineChip('Maya pura-pura merapikan tumpukan selimut usang.')
                  }
                  className="rounded-full border border-[#FDA4AF] bg-white px-3 py-1 text-xs font-semibold text-[#881337] shadow-2xs hover:bg-[#FFE4E6]"
                >
                  Maya mengalihkan topik ke selimut
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleInlineChip('Bu Ratna mendekat dan bertanya dengan tatapan dingin.')
                  }
                  className="rounded-full border border-[#FDA4AF] bg-white px-3 py-1 text-xs font-semibold text-[#881337] shadow-2xs hover:bg-[#FFE4E6]"
                >
                  Bu Ratna mendekat & bertanya
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleInlineChip(
                      'Tiba-tiba nada dering telepon berdering nyaring di saku celana.',
                    )
                  }
                  className="rounded-full border border-[#FDA4AF] bg-white px-3 py-1 text-xs font-semibold text-[#881337] shadow-2xs hover:bg-[#FFE4E6]"
                >
                  Panggilan Dewi berdering
                </button>
              </div>
            </div>
          </div>

          {/* Studio Bottom Footer Bar */}
          <footer className="flex h-14 shrink-0 items-center justify-between border-t border-[#E2E8F0] bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3 text-xs text-[#64748B]">
              <span className="font-bold text-[#0F172A]">{wordCount} kata</span>
              <span>•</span>
              <span>~{Math.max(1, Math.round(wordCount / 250))} menit baca</span>
              <span>•</span>
              <span className="font-semibold text-[#059669]">Siap Ditinjau</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRightTab('continuity')}
                className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#F8F9FA]"
              >
                🔍 Cek Kontinuitas Cerita
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppliedNotification('Naskah adegan telah diterima dan disimpan!');
                  setTimeout(() => setAppliedNotification(null), 3000);
                }}
                className="rounded-lg bg-[#881337] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#9F1239]"
              >
                ✓ Terima Versi Adegan Ini
              </button>
            </div>
          </footer>
        </main>

        {/* KOLOM KANAN: Narra Story Intelligence + 3 Cabang Kelanjutan Narasi */}
        <aside
          aria-label="Narra Story Intelligence Inspector"
          className="hidden w-[360px] shrink-0 flex-col gap-4 border-l border-[#E2E8F0] bg-white p-4 xl:flex overflow-y-auto"
        >
          {/* Panel Header Block */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#059669]" />
                <span className="font-heading text-xs font-bold text-[#0F172A]">
                  Narra Story Intelligence
                </span>
              </div>
              <span className="font-body text-[10px] font-bold text-[#881337]">v3 Copilot</span>
            </div>

            {/* Inspector Subtabs */}
            <div className="flex rounded-lg bg-[#F1F5F9] p-0.5">
              <button
                type="button"
                onClick={() => setRightTab('branches')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'branches'
                    ? 'border border-[#E2E8F0] bg-white font-bold text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                3 Cabang Narasi
              </button>
              <button
                type="button"
                onClick={() => setRightTab('continuity')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'continuity'
                    ? 'border border-[#E2E8F0] bg-white font-bold text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Radar Alur (2)
              </button>
              <button
                type="button"
                onClick={() => setRightTab('characters')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'characters'
                    ? 'border border-[#E2E8F0] bg-white font-bold text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Fakta Tokoh
              </button>
            </div>
          </div>

          {/* Subtab 1: 3 Cabang Kelanjutan Narasi (AI Proposal) */}
          {rightTab === 'branches' && (
            <div className="space-y-3">
              <div className="text-[10px] font-extrabold tracking-wider text-[#881337] uppercase">
                PILIHAN KELANJUTAN ADEGAN (AI PROPOSAL)
              </div>

              {DEFAULT_BRANCHES.map((branch) => {
                const isSelected = selectedBranch === branch.id;

                return (
                  <div
                    key={branch.id}
                    className={`space-y-2 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? 'border-[#FDA4AF] bg-[#FFF1F2] shadow-xs'
                        : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-xs font-bold text-[#0F172A]">
                        {branch.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          branch.isRecommended
                            ? 'bg-[#FFE4E6] text-[#881337]'
                            : 'bg-[#FEF3C7] text-[#D97706]'
                        }`}
                      >
                        {branch.badge}
                      </span>
                    </div>

                    <p className="font-body text-xs leading-relaxed text-[#475569]">
                      {branch.pitch}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleApplyBranch(branch.id)}
                      className="w-full rounded-lg bg-[#881337] py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#9F1239]"
                    >
                      ✨ Terapkan Cabang {branch.id} ke Naskah
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Subtab 2: Continuity Radar / Findings */}
          {rightTab === 'continuity' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#047857]">Pemeriksaan Kontinuitas Naskah</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#059669]">
                    96% Lolos
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#065F46]">
                  Tidak ada blocker deterministik. Semua rahasia aman di jadwalnya.
                </p>
              </div>

              {/* Finding 1 */}
              <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#0F172A]">Jadwal Rahasia: Asal Usul Maya</span>
                  <span className="text-[#059669]">Aman ✓</span>
                </div>
                <p className="mt-1 text-[11px] text-[#64748B]">
                  Kain selimut bayi memicu kecurigaan Bu Ratna tanpa membocorkan fakta anak kandung
                  sebelum Bab 25.
                </p>
              </div>

              {/* Finding 2 */}
              <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#92400E]">Rekomendasi Ritme Adegan</span>
                  <span className="text-[#B45309]">Saran Alur</span>
                </div>
                <p className="mt-1 text-[11px] text-[#78350F]">
                  Buat tatapan Bu Ratna lebih menggantung agar penutup adegan langsung mengalir ke
                  panggilan telepon Dewi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleInlineChip('Tatapan Bu Ratna terpaku pada sudut meja.');
                  }}
                  className="mt-2 rounded bg-[#881337] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#9F1239]"
                >
                  ✨ Terapkan Saran ke Naskah
                </button>
              </div>
            </div>
          )}

          {/* Subtab 3: Character Voice Guard */}
          {rightTab === 'characters' && (
            <div className="space-y-2.5 text-xs">
              <div className="text-[10px] font-extrabold tracking-wider text-[#64748B] uppercase">
                PEMERIKSAAN KARAKTER DI ADEGAN
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#0F172A]">Maya (Protagonis)</span>
                  <span className="text-[#059669]">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-[#64748B]">Sopan, tertekan, waspada</p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#0F172A]">Bu Ratna (Mertua)</span>
                  <span className="text-[#059669]">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-[#64748B]">Dingin, cermat, penuh selidik</p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#0F172A]">Raka (Suami)</span>
                  <span className="text-[#059669]">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-[#64748B]">Hangat, polos, tanpa curiga</p>
              </div>
            </div>
          )}

          {/* Narra AI Chat Prompt Box */}
          <div className="mt-auto rounded-xl border border-[#FECDD3] bg-[#FFF1F2] p-3 text-xs">
            <span className="font-bold text-[#881337]">Tanya Asisten Narra AI:</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#FDA4AF] bg-white p-1.5">
              <input
                type="text"
                placeholder="Ketik arahan atau minta dialog alternatif..."
                className="w-full border-none bg-transparent text-xs text-[#0F172A] focus:outline-none"
              />
              <button
                type="button"
                aria-label="Kirim arahan"
                className="flex size-6 shrink-0 items-center justify-center rounded bg-[#881337] text-white hover:bg-[#9F1239]"
              >
                ➤
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
