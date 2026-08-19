import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export default async function NaskahPage({ params }: { params: Promise<{ projectId: string; chapterId: string }> }) {
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
        <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
              ← {projectTitle}
            </Link>
            
            <div className="mt-2">
              <h1 className="font-serif text-3xl font-semibold text-gray-900">Naskah Bab</h1>
              <p className="mt-2 text-sm text-gray-600">
                Tampilan baca-only dari bab yang sudah validasi dan diterima
              </p>
            </div>
          </header>
          
          {/* Read-Only View — Presentation Shell Only */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
              TAMPILAN BACA-ONLY
            </h2>
            
            <div className="prose prose-lg max-w-none">
              <p className="text-gray-600">
                Naskah bab akan muncul setelah validasi selesai dan konten telah diterima ke dalam canonical version cerita Anda.
              </p>
            </div>
          </section>
          
          {/* Coming Soon Box */}
          <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
              SEGERA HADIR M4
            </h2>
            
            <p className="text-sm text-gray-700">
              Tampilan baca-only untuk naskah bab yang telah melalui semua tahap validasi dan disetujui ke dalam canonical version.
            </p>
            
            <p className="mt-4 text-sm font-semibold text-blue-900">
              Semua naskah akan ditampilkan secara real-time dari backend production.
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
