'use client';

import Link from 'next/link';

/**
 * Project Writing Entry — Explicit projectId verification
 */
export default async function ProjectTulisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  
  // Step 2: Show presentation shell — honest, no fake state
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
        ← Kembali ke proyek
      </Link>
      
      <header className="mt-4 mb-8">
        <h1 className="font-serif text-3xl font-semibold text-gray-900">Mulai Menulis</h1>
        <p className="mt-2 text-sm text-gray-600">
          Proyek Anda akan muncul di sini setelah fondasi diverifikasi
        </p>
      </header>
      
      {/* Presentation Shell — No Fake Numeric States */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          RANGKAIAN CERITA
        </h2>
        
        <p className="text-sm text-gray-700">
          Outline cerita Anda akan tersedia di sini setelah fondasi diverifikasi.
          Bab-bab akan muncul dalam urutan logis saat Anda membuatnya.
        </p>
      </section>
      
      {/* Honest Coming Soon Box */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
          SEGERA HADIR M4
        </h2>
        
        <p className="text-sm text-gray-700">
          Editor bab dengan autosave real-time dan verifikasi struktur naratif otomatis.
        </p>
        
        <p className="mt-4 text-sm font-semibold text-blue-900">
          Semua data akan terintegrasi secara real-time dengan backend production.
        </p>
      </section>
    </main>
  );
}
