import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export default async function PublishPage({ params }: { params: Promise<{ projectId: string; chapterId: string }> }) {
  const { projectId, chapterId } = await params;
  
  let projectTitle = 'Proyek';
  
  // Consume locked resolver pattern
  const result = await resolveChapterContext(projectId, chapterId);
  
  switch (result.kind) {
    case 'resolved':
      try {
        const [project] = await Promise.all([
          getMyProject(projectId),
        ]);
        
        if (!project) throw new Error('Project not found');
        projectTitle = project.title;
      } catch {
        notFound();
      }
      
      return (
        <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
              ← {projectTitle}
            </Link>
            
            <div className="mt-2">
              <h1 className="font-serif text-3xl font-semibold text-gray-900">Terbitkan Bab</h1>
              <p className="mt-2 text-sm text-gray-600">
                Publikasi bab ke dalam versi kanonikal cerita Anda
              </p>
            </div>
          </header>
          
          {/* Demo Mode — NO Fake Mutations */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
              DEMO MODE
            </h2>
            
            <div className="space-y-4">
              {/* Status Banner */}
              <div className="rounded-lg border border-pink-200 bg-pink-50 p-4">
                <p className="text-sm font-semibold text-pink-900 mb-2">
                  Fitur publikasi belum tersedia
                </p>
                
                <p className="text-sm text-pink-800">
                  Mekanisme publikasi yang aman dengan verifikasi ganda dan history lengkap akan aktif di M4.
                </p>
              </div>
              
              {/* Demo Process Flow - No Action Buttons */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase text-blue-900 mb-3">
                  PROSES PUBLIKASI (M4+)
                </p>
                
                <ol className="space-y-3">
                  <li className="flex items-start">
                    <span className="mr-3 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">1</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Verifikasi Struktur</p>
                      <p className="text-sm text-blue-800">Validasi bahwa bab memenuhi standar struktural dan naratif</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start">
                    <span className="mr-3 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">2</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Pembandingan Draf</p>
                      <p className="text-sm text-blue-800">Review diff dengan versi sebelumnya untuk memastikan perubahan yang diharapkan</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start">
                    <span className="mr-3 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">3</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Konfirmasi Penulis</p>
                      <p className="text-sm text-blue-800">Anda diminta untuk mengkonfirmasi publikasi secara eksplisit</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start">
                    <span className="mr-3 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">4</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Penyimpanan Kanonik</p>
                      <p className="text-sm text-blue-800">Bab disimpan sebagai bagian dari canonical version dengan audit trail lengkap</p>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </section>
          
          {/* Security Notice */}
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h3 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-amber-900">
              KEAMANAN DATA
            </h3>
            
            <p className="text-sm text-gray-700">
              Semua aksi publikasi akan dicatat dengan timestamp, user ID, dan hash konten untuk keperluan audit dan recovery.
            </p>
            
            <p className="mt-4 text-sm font-semibold text-amber-900">
              Versi-versi sebelumnya tetap tersimpan dan dapat direstorasi kapan saja.
            </p>
          </section>
        </main>
      );
      
    case 'blocked':
      throw notFound();
      
    case 'choose':
      throw notFound();
      
    default:
      never(result);
  }
}

function never(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}
