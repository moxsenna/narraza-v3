import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export default async function TulisPage({ params }: { params: Promise<{ projectId: string; chapterId: string }> }) {
  const { projectId, chapterId } = await params;
  
  let projectTitle = 'Proyek';
  
  // Consume locked resolver pattern
  const result = await resolveChapterContext(projectId, chapterId);
  
  switch (result.kind) {
    case 'resolved':
      // Single resolved chapter - show editor shell
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
        <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
              ← {projectTitle}
            </Link>
            
            <div className="mt-2">
              <h1 className="font-serif text-3xl font-semibold text-gray-900">Bab Belum Tersedia</h1>
              <p className="mt-2 text-sm text-gray-600">
                Penulisan bab akan aktif setelah validasi selesai
              </p>
            </div>
          </header>
          
          {/* Presentation Shell — No Fake Numeric States */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
              EDITOR DRAF
            </h2>
            
            <div className="rounded-lg border border-pink-200 bg-pink-50 p-6">
              <p className="text-sm font-semibold text-pink-900 mb-2">
                Fitur penulisan belum tersedia
              </p>
              
              <p className="text-sm text-pink-800">
                Editor bab dengan autosave real-time dan verifikasi struktur naratif otomatis akan aktif di M4.
              </p>
            </div>
          </section>
          
          {/* Coming Soon Box */}
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
      
    case 'blocked':
      // Foundation not locked or no chapter exists - redirect to outline
      throw notFound();
      
    case 'choose':
      // Multiple chapters for choice — present UI (M4+)
      throw notFound();
      
    default:
      never(result);
  }
}

function never(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}
