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
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden bg-canvas text-primary">
      {/* Workspace Body - 3 Columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* KOLOM KIRI: Navigator Bab & Adegan */}
        <aside
          aria-label="Navigator Bab dan Adegan"
          className="hidden w-[280px] shrink-0 flex-col gap-4 border-r border-default bg-white p-4 lg:flex overflow-y-auto"
        >
          {/* Arc Header Box */}
          <div className="rounded-xl border border-default bg-canvas p-3">
            <div className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">
              {projectTitle}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-heading text-xs font-bold text-primary">
                Arc 1: Rahasia Keluarga
              </span>
              <span className="font-body text-[10px] font-semibold text-muted">Bab 1–15</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-default overflow-hidden">
              <div className="h-full rounded-full bg-brand-600" style={{ width: '20%' }} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              3 dari 15 bab selesai • Target Arc: 25.000 kata
            </p>
          </div>

          {/* Chapter List */}
          <div className="flex-1 space-y-1.5">
            <div className="px-1 text-[11px] font-bold tracking-wider text-muted uppercase">
              DAFTAR BAB
            </div>
            {DEFAULT_CHAPTERS.map((ch) => {
              const isActive = ch.ordinal === chapterOrdinal;

              return (
                <div key={ch.id} className="space-y-1">
                  <div
                    className={`flex items-center justify-between rounded-lg p-2.5 text-xs transition-colors ${
                      isActive
                        ? 'border border-active bg-brand-soft text-brand-600'
                        : 'border border-transparent bg-white hover:bg-canvas text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-[11px]">
                        {ch.status === 'completed' ? (
                          <span className="text-status-success">✓</span>
                        ) : isActive ? (
                          <span className="text-brand-600">✎</span>
                        ) : (
                          <span className="text-muted">○</span>
                        )}
                      </span>
                      <span className="truncate font-semibold">
                        {String(ch.ordinal).padStart(2, '0')}. {ch.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-muted">
                      {ch.status === 'completed'
                        ? `${ch.wordCount} kata`
                        : isActive
                          ? 'Ditulis'
                          : 'Rencana'}
                    </span>
                  </div>

                  {/* Sub-scenes under active chapter */}
                  {isActive && ch.scenes && (
                    <div className="ml-4 space-y-1 border-l-2 border-active pl-2">
                      {ch.scenes.map((sc) => (
                        <div
                          key={sc.id}
                          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] ${
                            sc.status === 'active'
                              ? 'bg-brand-soft font-bold text-brand-600'
                              : 'text-muted hover:bg-surface-soft'
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
            className="w-full rounded-lg border border-dashed border-default p-2 text-center text-xs font-bold text-brand-600 hover:border-brand-600 hover:bg-brand-soft"
          >
            + Tambah Bab Baru
          </button>
        </aside>

        {/* KOLOM TENGAH: Canvas Naskah Tanpa Distraksi */}
        <main className="flex flex-1 flex-col overflow-hidden bg-surface">
          {/* Canvas Sub-Header Bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-default bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-brand-600">
                Bab {chapterOrdinal} &gt; Adegan 2 dari 3 (Konfrontasi di Gudang)
              </span>
              <span className="text-ink-300">•</span>
              <span className="hidden items-center gap-1.5 text-xs text-status-success sm:flex">
                <span className="size-2 rounded-full bg-status-success" />
                Tersimpan otomatis
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Candidate Switcher Pills */}
              <div className="flex items-center rounded-lg bg-surface-soft p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveCandidate('A')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    activeCandidate === 'A'
                      ? 'border border-default bg-white text-brand-600 shadow-xs'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  Kandidat A (Ketegangan)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCandidate('B')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    activeCandidate === 'B'
                      ? 'border border-default bg-white text-brand-600 shadow-xs'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  Kandidat B (Drama Batin)
                </button>
              </div>

              <div className="text-xs text-muted">
                <span className="font-bold text-primary">{wordCount}</span> / {targetWords} kata (
                {progressPercent}%)
              </div>
            </div>
          </div>

          {/* Manuscript Canvas Container */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-12 md:px-16 lg:px-20">
            <div className="mx-auto max-w-[780px] space-y-6">
              {/* Notification toast */}
              {appliedNotification && (
                <div className="rounded-xl border border-status-success-soft bg-status-success-soft p-3 text-xs font-semibold text-status-success shadow-sm transition-all">
                  ✓ {appliedNotification}
                </div>
              )}

              {/* Scene Goal Cue Banner */}
              <div className="flex items-center gap-3 rounded-xl border border-default bg-canvas p-3 text-xs">
                <span className="text-base" aria-hidden="true">
                  🎯
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-secondary">
                    Arah Emosi: Tertekan → Panik Terkendali
                  </span>
                  <span className="text-muted">•</span>
                  <span className="font-semibold text-brand-600">
                    Ending Hook: Panggilan telepon Dewi setelah 7 tahun hening
                  </span>
                </div>
              </div>

              {/* Chapter Title & Subtitle */}
              <div>
                <h1 className="font-editor text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                  Bab {chapterOrdinal} — {chapterTitle}
                </h1>
                <p className="mt-1 font-body text-xs font-medium text-muted">
                  Adegan 2: Peti kayu tua di sudut rak dan kecurigaan Bu Ratna
                </p>
              </div>

              {/* Distraction-Free Prose Area (Lora serif, line-height 1.85) */}
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
                  className="font-editor w-full resize-none border-none bg-transparent p-0 text-base leading-[1.85] text-ink-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:text-[17px]"
                />
              </div>

              {/* Inline AI Action Pills */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-soft p-2.5">
                <div className="flex items-center gap-1.5 font-body text-xs font-bold text-brand-600">
                  <span>✨</span>
                  <span>Lanjutkan Adegan:</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleInlineChip('Maya pura-pura merapikan tumpukan selimut usang.')
                  }
                  className="rounded-full border border-active bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-2xs hover:bg-brand-soft"
                >
                  Maya mengalihkan topik ke selimut
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleInlineChip('Bu Ratna mendekat dan bertanya dengan tatapan dingin.')
                  }
                  className="rounded-full border border-active bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-2xs hover:bg-brand-soft"
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
                  className="rounded-full border border-active bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-2xs hover:bg-brand-soft"
                >
                  Panggilan Dewi berdering
                </button>
              </div>
            </div>
          </div>

          {/* Studio Bottom Footer Bar */}
          <footer className="flex h-14 shrink-0 items-center justify-between border-t border-default bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="font-bold text-primary">{wordCount} kata</span>
              <span>•</span>
              <span>~{Math.max(1, Math.round(wordCount / 250))} menit baca</span>
              <span>•</span>
              <span className="font-semibold text-status-success">Siap Ditinjau</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRightTab('continuity')}
                className="rounded-lg border border-default bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-canvas"
              >
                🔍 Cek Kontinuitas Cerita
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppliedNotification('Naskah adegan telah diterima dan disimpan!');
                  setTimeout(() => setAppliedNotification(null), 3000);
                }}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-700"
              >
                ✓ Terima Versi Adegan Ini
              </button>
            </div>
          </footer>
        </main>

        {/* KOLOM KANAN: Narra Story Intelligence + 3 Cabang Kelanjutan Narasi */}
        <aside
          aria-label="Narra Story Intelligence Inspector"
          className="hidden w-[360px] shrink-0 flex-col gap-4 border-l border-default bg-white p-4 xl:flex overflow-y-auto"
        >
          {/* Panel Header Block */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-status-success" />
                <span className="font-heading text-xs font-bold text-primary">
                  Narra Story Intelligence
                </span>
              </div>
              <span className="font-body text-[10px] font-bold text-brand-600">v3 Copilot</span>
            </div>

            {/* Inspector Subtabs */}
            <div className="flex rounded-lg bg-surface-soft p-0.5">
              <button
                type="button"
                onClick={() => setRightTab('branches')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'branches'
                    ? 'border border-default bg-white font-bold text-primary shadow-xs'
                    : 'text-muted hover:text-primary'
                }`}
              >
                3 Cabang Narasi
              </button>
              <button
                type="button"
                onClick={() => setRightTab('continuity')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'continuity'
                    ? 'border border-default bg-white font-bold text-primary shadow-xs'
                    : 'text-muted hover:text-primary'
                }`}
              >
                Radar Alur (2)
              </button>
              <button
                type="button"
                onClick={() => setRightTab('characters')}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
                  rightTab === 'characters'
                    ? 'border border-default bg-white font-bold text-primary shadow-xs'
                    : 'text-muted hover:text-primary'
                }`}
              >
                Fakta Tokoh
              </button>
            </div>
          </div>

          {/* Subtab 1: 3 Cabang Kelanjutan Narasi (AI Proposal) */}
          {rightTab === 'branches' && (
            <div className="space-y-3">
              <div className="text-[10px] font-extrabold tracking-wider text-brand-600 uppercase">
                PILIHAN KELANJUTAN ADEGAN (AI PROPOSAL)
              </div>

              {DEFAULT_BRANCHES.map((branch) => {
                const isSelected = selectedBranch === branch.id;

                return (
                  <div
                    key={branch.id}
                    className={`space-y-2 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? 'border-active bg-brand-soft shadow-xs'
                        : 'border-default bg-white hover:border-default'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-xs font-bold text-primary">
                        {branch.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          branch.isRecommended
                            ? 'bg-brand-soft text-brand-600'
                            : 'bg-status-warning-soft text-status-warning'
                        }`}
                      >
                        {branch.badge}
                      </span>
                    </div>

                    <p className="font-body text-xs leading-relaxed text-secondary">
                      {branch.pitch}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleApplyBranch(branch.id)}
                      className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-brand-700"
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
              <div className="rounded-xl border border-status-success-soft bg-status-success-soft p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-status-success">
                    Pemeriksaan Kontinuitas Naskah
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-status-success">
                    96% Lolos
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-status-success">
                  Tidak ada blocker deterministik. Semua rahasia aman di jadwalnya.
                </p>
              </div>

              {/* Finding 1 */}
              <div className="rounded-lg border border-default bg-white p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-primary">Jadwal Rahasia: Asal Usul Maya</span>
                  <span className="text-status-success">Aman ✓</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Kain selimut bayi memicu kecurigaan Bu Ratna tanpa membocorkan fakta anak kandung
                  sebelum Bab 25.
                </p>
              </div>

              {/* Finding 2 */}
              <div className="rounded-lg border border-status-warning-soft bg-status-warning-soft p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-status-warning">Rekomendasi Ritme Adegan</span>
                  <span className="text-status-warning">Saran Alur</span>
                </div>
                <p className="mt-1 text-[11px] text-status-warning">
                  Buat tatapan Bu Ratna lebih menggantung agar penutup adegan langsung mengalir ke
                  panggilan telepon Dewi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleInlineChip('Tatapan Bu Ratna terpaku pada sudut meja.');
                  }}
                  className="mt-2 rounded bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-700"
                >
                  ✨ Terapkan Saran ke Naskah
                </button>
              </div>
            </div>
          )}

          {/* Subtab 3: Character Voice Guard */}
          {rightTab === 'characters' && (
            <div className="space-y-2.5 text-xs">
              <div className="text-[10px] font-extrabold tracking-wider text-muted uppercase">
                PEMERIKSAAN KARAKTER DI ADEGAN
              </div>

              <div className="rounded-lg border border-default bg-canvas p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-primary">Maya (Protagonis)</span>
                  <span className="text-status-success">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-muted">Sopan, tertekan, waspada</p>
              </div>

              <div className="rounded-lg border border-default bg-canvas p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-primary">Bu Ratna (Mertua)</span>
                  <span className="text-status-success">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-muted">Dingin, cermat, penuh selidik</p>
              </div>

              <div className="rounded-lg border border-default bg-canvas p-2.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-primary">Raka (Suami)</span>
                  <span className="text-status-success">Konsisten ✓</span>
                </div>
                <p className="text-[11px] text-muted">Hangat, polos, tanpa curiga</p>
              </div>
            </div>
          )}

          {/* Narra AI Chat Prompt Box */}
          <div className="mt-auto rounded-xl border border-brand-200 bg-brand-soft p-3 text-xs">
            <span className="font-bold text-brand-600">Tanya Asisten Narra AI:</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-active bg-white p-1.5">
              <input
                type="text"
                placeholder="Ketik arahan atau minta dialog alternatif..."
                className="w-full border-none bg-transparent text-xs text-primary focus:outline-none"
              />
              <button
                type="button"
                aria-label="Kirim arahan"
                className="flex size-6 shrink-0 items-center justify-center rounded bg-brand-600 text-white hover:bg-brand-700"
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
