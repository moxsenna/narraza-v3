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
 * 
 * Instead: honest presentation UI with unavailable messaging
 */
export default async function KreditPage() {
  // This is a presentation shell — backend credit data doesn't exist yet
  
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-semibold text-gray-900">Kredit & Penggunaan</h1>
        <p className="mt-2 text-sm text-gray-600">
          Lacak kredit Narra Anda dan riwayat penggunaan fitur
        </p>
      </header>
      
      {/* Honest Unavailable State — No Fake Numbers */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          KREDIT TERSEDIA
        </h2>
        
        <div className="rounded-lg border border-pink-200 bg-pink-50 p-6">
          <p className="text-sm font-semibold text-pink-900 mb-2">
            Backend kredit belum tersedia
          </p>
          
          <p className="text-sm text-pink-800">
            Sistem penghitungan kredit akan aktif di M4. Saat ini semua akun memiliki kredit penuh untuk testing.
          </p>
        </div>
      </section>
      
      {/* Feature Credits Overview — User-Facing Only */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          FITUR YANG DIGUNAKAN
        </h2>
        
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-green-500 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Buat Proyek</p>
              <p className="text-xs text-gray-600 mt-0.5">Gratis sepanjang masa</p>
            </div>
          </li>
          
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-gray-400 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Chat Narra</p>
              <p className="text-xs text-gray-600 mt-0.5">Akan menggunakan kredit di M4</p>
            </div>
          </li>
          
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-gray-400 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Publikasi Bab</p>
              <p className="text-xs text-gray-600 mt-0.5">Akan menggunakan kredit di M6</p>
            </div>
          </li>
        </ul>
      </section>
      
      {/* Coming Soon Box */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
          SEGERA HADIR M4
        </h2>
        
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1"></span>
            Real-time credit balance tracking
          </li>
          <li className="flex items-start gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1"></span>
            Detailed usage history per feature
          </li>
          <li className="flex items-start gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1"></span>
            Credit purchase top-up options
          </li>
        </ul>
      </section>
    </main>
  );
}
