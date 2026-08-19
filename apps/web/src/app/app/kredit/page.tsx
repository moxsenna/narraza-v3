import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProject } from '../../../../../server/domain/queries';

export default async function KreditPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  
  let projectTitle = 'Proyek';
  
  try {
    const project = await getMyProject(projectId);
    if (!project) notFound();
    projectTitle = project.title;
  } catch (error) {
    // Fallback for presentation mode
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href={`/app/proyek/${projectId}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors">
        ← {projectTitle}
      </Link>
      
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Kredit Kapabilitas</h1>
        
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
          Presentation Mode
        </span>
      </div>
      
      <p className="mt-2 text-sm text-gray-600">
        Lacak status kapabilitas sistem dan mode presentasi
      </p>

      {/* Capability Overview */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          STATUS KAPABILITAS
        </h2>
        
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">Mode Sistem</dt>
            <dd className="mt-1">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                REAL
              </span>
            </dd>
          </div>
          
          <div>
            <dt className="text-xs font-medium text-gray-500">Backend Tersedia</dt>
            <dd className="mt-1 text-sm font-semibold text-red-600">Tidak</dd>
          </div>
          
          <div>
            <dt className="text-xs font-medium text-gray-500">Enforcement</dt>
            <dd className="mt-1 text-sm font-semibold text-green-600">Active</dd>
          </div>
          
          <div>
            <dt className="text-xs font-medium text-gray-500">Environment</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">Development</dd>
          </div>
        </dl>
      </section>

      {/* Feature Availability */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          KETERSEDIAAN FITUR
        </h2>
        
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-green-500 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Create Project Action</p>
              <p className="text-xs text-gray-600 mt-0.5">Server-side mutation dengan CAS protection</p>
            </div>
          </li>
          
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-yellow-500 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">AI Chat Response</p>
              <p className="text-xs text-gray-600 mt-0.5">Segera hadir di M4</p>
            </div>
          </li>
          
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-gray-400 shrink-0"></span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Proposal Management</p>
              <p className="text-xs text-gray-600 mt-0.5">Perubahan terkunci fondasi lewat proposal (M5)</p>
            </div>
          </li>
        </ul>
      </section>

      {/* Architecture Notes */}
      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-2 text-sm font-extrabold tracking-widest uppercase text-brand-700">
          CATATAN ARSITEKTUR
        </h2>
        
        <p className="text-sm text-gray-700">
          Halaman ini menyediakan visibilitas terhadap state kapabilitas sistem 
          dan mode presentasi yang aktif. Semua data ditampilkan tanpa operasi 
          backend sesungguhnya—ini murni untuk demonstrasi dan testing UI.
        </p>
        
        <p className="text-sm text-gray-700 mt-2">
          Pattern yang diterapkan: resolve → choose → blocked (tidak ada bypass).
        </p>
      </section>
    </main>
  );
}
