import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export default async function CekPage({ params }: { params: Promise<{ projectId: string; chapterId: string }> }) {
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
              <h1 className="font-serif text-3xl font-semibold text-gray-900">Status Validasi</h1>
              <p className="mt-2 text-sm text-gray-600">
                Dashboard validasi bab untuk struktur naratif dan konsistensi plot
              </p>
            </div>
          </header>
          
          {/* State Machine Dashboard — Presentation Shell Only */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
              MESIN STATUS
            </h2>
            
            {/* Draft State */}
            <div className="mb-6 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">DRAF</p>
                  <p className="text-sm text-gray-600">
                    Status draft — belum masuk antrian validasi
                  </p>
                </div>
                
                <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  Tidak berjalan
                </span>
              </div>
            </div>
            
            {/* Validation State */}
            <div className="mb-6 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">VALIDASI</p>
                  <p className="text-sm text-gray-600">
                    Sedang memverifikasi struktur naratif
                  </p>
                </div>
                
                <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  Tidak berjalan
                </span>
              </div>
            </div>
            
            {/* Job State */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">PEMROSESAN</p>
                  <p className="text-sm text-gray-600">
                    Antrian pemrosesan generasi naratif otomatis
                  </p>
                </div>
                
                <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  Tidak berjalan
                </span>
              </div>
            </div>
          </section>
          
          {/* Coming Soon Box */}
          <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
              SEGERA HADIR M4
            </h2>
            
            <p className="text-sm text-gray-700">
              Dashboard status real-time yang menampilkan progress validasi, hasil verifikasi, dan log pemrosesan.
            </p>
            
            <p className="mt-4 text-sm font-semibold text-blue-900">
              Semua status akan diperbarui otomatis melalui backend production.
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
