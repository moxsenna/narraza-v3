import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../../../server/domain/queries';
import { resolveChapterContext } from '../../../../../../../lib/server/capability-resolvers/chapter-context';

export default async function SelesaikanPage({ params }: { params: Promise<{ projectId: string; chapterId: string }> }) {
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
              <h1 className="font-serif text-3xl font-semibold text-gray-900">Selesaikan Bab</h1>
              <p className="mt-2 text-sm text-gray-600">
                Checklist finalisasi bab sebelum publikasi
              </p>
            </div>
          </header>
          
          {/* Completion Checklist — Presentation Shell Only */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
              CHECKLIST FINALISASI
            </h2>
            
            <div className="space-y-4">
              {/* Item 1: Plot Points Verified */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start">
                  <span className="mr-4 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">✓</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Plot Point Terverifikasi</p>
                    <p className="text-sm text-gray-600">
                      Semua plot point utama telah diverifikasi konsistensi naratifnya
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Item 2: Character Arc Checked */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start">
                  <span className="mr-4 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">✓</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Arc Karakter Terjamin</p>
                    <p className="text-sm text-gray-600">
                      Perkembangan karakter mengikuti arc yang ditetapkan dalam fondasi cerita
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Item 3: Fact Consistency */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start">
                  <span className="mr-4 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">✓</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Konsistensi Fakta</p>
                    <p className="text-sm text-gray-600">
                      Semua fakta dan detail cerita konsisten dengan database facts yang ada
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Item 4: No Conflicts */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start">
                  <span className="mr-4 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">✓</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Tidak Ada Konflik</p>
                    <p className="text-sm text-gray-600">
                      Tidak ada konflik dengan outline, reveals, atau timeline cerita
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          {/* Coming Soon Box */}
          <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-blue-900">
              SEGERA HADIR M4
            </h2>
            
            <p className="text-sm text-gray-700">
              Checklist interaktif yang memandu Anda melalui semua tahap finalisasi bab secara sistematis.
            </p>
            
            <p className="mt-4 text-sm font-semibold text-blue-900">
              Setiap item akan dicek real-time terhadap canonical version cerita Anda.
            </p>
          </section>
          
          {/* Info Box */}
          <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-6">
            <h3 className="mb-2 text-sm font-bold text-gray-900">INFO PENTING</h3>
            <p className="text-sm text-gray-700">
              Setelah semua checklist selesai dan bab terpublikasi, bab tersebut tidak dapat diubah lagi tanpa membuat versi baru. Pastikan untuk meninjau dengan teliti sebelum melanjutkan ke publikasi.
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
