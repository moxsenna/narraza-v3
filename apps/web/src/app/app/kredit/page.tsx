import Link from 'next/link';

/**
 * Credit & Usage — User-Facing Presentation Shell
 * 
 * NO:
 * - "Mode Sistem" labels (REAL/PRESENTATION/DISABLED)
 * - "Backend Tersedia" developer jargon
 * - "Enforcement" terminology
 * - "Environment" labels
 * - Architecture notes
 * - Resolver pattern explanation
 * - Fake balance/history/usage numbers
 */
export default async function KreditPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/app" className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
        ← Kembali ke dashboard
      </Link>
      
      <header className="mt-4 mb-8">
        <h1 className="font-serif text-3xl font-semibold text-gray-900">Kredit & Penggunaan</h1>
        <p className="mt-2 text-sm text-gray-600">
          Track penggunaan kredit untuk fitur AI dan layanan premium lainnya
        </p>
      </header>
      
      {/* Honest Unavailable State — No Fake Numbers */}
      <section className="rounded-xl border border-pink-200 bg-pink-50 p-6">
        <p className="text-sm font-semibold text-pink-900 mb-2">
          Backend kredit belum tersedia
        </p>
        
        <p className="text-sm text-pink-800">
          Sistem manajemen kredit dengan tracking real-time akan aktif di M4. Fitur ini akan mencatat setiap penggunaan kredit untuk penulisan bab, verifikasi naratif, dan layanan AI lainnya.
        </p>
      </section>
      
      {/* Coming Soon Box */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
          SEGERA HADIR M4
        </h2>
        
        <p className="text-sm text-gray-700">
          Dashboard lengkap untuk track kredit, history penggunaan, dan status langganan Anda.
        </p>
      </section>
    </main>
  );
}
