export const APP_MESSAGES_ID = {
  metadata: {
    title: 'Narraza — Cerita panjang, tetap terarah',
    titleTemplate: '%s | Narraza',
    description:
      'Narraza membantu penulis Indonesia menyusun fondasi, merencanakan bab, menjaga rahasia, dan memoles cerita serial.',
  },
  brand: {
    name: 'Narraza',
    tagline: 'Cerita panjang, tetap terarah.',
    homeLabel: 'Narraza — kembali ke beranda',
    dashboardLabel: 'Narraza — buka dashboard',
  },
  common: {
    backHome: 'Kembali ke beranda',
    skipToContent: 'Lewati ke konten utama',
  },
  landing: {
    navigationLabel: 'Navigasi utama',
    workLink: 'Cara kerja',
    loginLink: 'Masuk',
    registerLink: 'Mulai gratis',
    hero: {
      eyebrow: 'Untuk penulis serial Indonesia',
      title: 'Tulis serial panjang tanpa kehilangan arah.',
      description:
        'Ceritakan idemu ke Narra. Narraza membantu menyusun fondasi, merencanakan bab, menjaga rahasia, dan memoles tulisanmu untuk pembaca mobile.',
      primaryAction: 'Mulai dari ide',
      secondaryAction: 'Lihat cara kerja',
      previewLabel: 'Alur cerita yang terarah',
      previewStart: 'Ide mentah',
      previewMiddle: 'Fondasi dan rencana bab',
      previewEnd: 'Bab siap ditinjau',
    },
    workflow: {
      title: 'Dari ide sampai bab yang membuat pembaca ingin lanjut',
      description: 'Enam langkah. Kamu memutuskan, Narraza menjaga.',
      steps: [
        {
          number: '1',
          title: 'Ngobrol',
          description: 'Ceritakan idemu ke Narra sesantai chat biasa.',
        },
        {
          number: '2',
          title: 'Fondasi',
          description: 'Percakapan menjadi tokoh, konflik, dan janji pembaca.',
        },
        {
          number: '3',
          title: 'Rencana',
          description: 'Susun 10 bab pertama dengan hook dan rahasia terjaga.',
        },
        {
          number: '4',
          title: 'Tulis',
          description: 'Tulis per adegan dengan arahan yang jelas.',
        },
        {
          number: '5',
          title: 'Cek',
          description: 'Cek otomatis: cerita nyambung, rahasia aman.',
        },
        {
          number: '6',
          title: 'Publish',
          description: 'Teaser, caption, dan bab siap dibaca di HP.',
        },
      ],
    },
    finalCta: {
      title: 'AI boleh membantu. Keputusan cerita tetap milikmu.',
      description:
        'Tidak ada fakta penting yang masuk cerita resmi tanpa persetujuanmu. Tidak ada janji novel sekali klik — yang ada: bantuan yang terarah dan mudah ditinjau.',
      action: 'Mulai cerita pertamamu',
    },
    footer: {
      navigationLabel: 'Tautan informasi',
      privacy: 'Privasi',
      terms: 'Ketentuan',
    },
  },
  shell: {
    creditSoon: 'Kredit — segera hadir',
    avatarLabel: 'Akun',
    logout: 'Keluar',
    navigationLabel: 'Navigasi aplikasi',
    groups: [
      {
        label: 'PERSIAPAN',
        items: ['Beranda Proyek', 'Chat Narra', 'Fondasi Cerita', 'Karakter'],
      },
      {
        label: 'PERENCANAAN',
        items: ['Rencana Bab', 'Jadwal Rahasia', 'Fakta'],
      },
      {
        label: 'PENULISAN',
        items: ['Naskah Bab', 'Ruang Tulis'],
      },
      {
        label: 'PEMERIKSAAN',
        items: ['Cek Cerita', 'Tutup Bab'],
      },
      {
        label: 'PUBLIKASI',
        items: ['Paket Publish'],
      },
      {
        label: 'LAINNYA',
        items: ['Kredit & Penggunaan', 'Pengaturan'],
      },
    ],
  },
  dashboard: {
    eyebrow: 'MULAI CERITA',
    title: 'Cerita pertamamu belum dimulai',
    description:
      'Pilih cara mulai yang paling nyaman — dari ide kosong, premis kasar, atau draft yang sudah ada. Narra akan menemanimu di setiap langkah.',
    unavailableLabel: 'Pilihan belum tersedia',
    soon: 'Segera hadir',
    paths: [
      {
        title: 'Aku belum punya ide',
        description: 'Ngobrol santai dengan Narra sampai idemu terbentuk.',
      },
      {
        title: 'Aku punya ide kasar',
        description: 'Satu kalimat cukup untuk mulai membentuk konsep.',
      },
      {
        title: 'Aku sudah punya draft',
        description: 'Narraza membaca draftmu dan membantu melanjutkan.',
        soon: true,
      },
    ],
  },
  legal: {
    status: 'Draf sementara',
    privacy: {
      title: 'Kebijakan Privasi',
      description:
        'Halaman ini sedang disiapkan untuk menjelaskan cara Narraza menyimpan, memakai, dan melindungi data pengguna serta cerita.',
    },
    terms: {
      title: 'Ketentuan Layanan',
      description:
        'Halaman ini sedang disiapkan untuk menjelaskan aturan penggunaan Narraza, tanggung jawab pengguna, dan batas layanan.',
    },
  },
  notFound: {
    eyebrow: '404',
    title: 'Halaman ini tidak ditemukan',
    description: 'Alamatnya mungkin berubah atau halaman belum tersedia.',
  },
  error: {
    eyebrow: 'TERJADI KENDALA',
    title: 'Halaman belum bisa ditampilkan',
    description: 'Coba muat ulang. Jika masih bermasalah, kembali ke beranda.',
    retry: 'Coba lagi',
  },
} as const;

export type AppMessageCatalog = typeof APP_MESSAGES_ID;
